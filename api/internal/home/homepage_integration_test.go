//go:build integration

package home

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Read through three real handlers on separate pool connections. A transaction
// isolated to one repository connection cannot prove homepage API isolation.
func TestHomepageIndependentSources(t *testing.T) {
	app, owner := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, raw := range []string{app, owner} {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Hostname() == "" || parsed.Path != "/eneba_test" {
			t.Fatal("homepage acceptance requires explicit eneba_test database URLs")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	root := filepath.Join("..", "..", "..")
	if _, err := maintenance.Migrate(ctx, owner, app, filepath.Join(root, "db", "migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := maintenance.SeedDatabase(ctx, app, filepath.Join(root, "db", "seeds")); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, app)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewBannerHandler(NewBannerService(NewBannerRepository(pool)), logger).RegisterRoutes(mux)
	NewBestSellerHandler(NewBestSellerService(NewBestSellerRepository(pool)), logger).RegisterRoutes(mux)
	NewDealHandler(NewDealService(NewDealRepository(pool)), logger).RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Timeout = 10 * time.Second

	paths := []string{
		"/api/v1/home/banners",
		"/api/v1/home/best-sellers",
		"/api/v1/home/deals",
	}
	read := func(t *testing.T) [3][]byte {
		t.Helper()
		var bodies [3][]byte
		for i, path := range paths {
			response, err := client.Get(server.URL + path)
			if err != nil {
				t.Fatal(err)
			}
			body, readErr := io.ReadAll(response.Body)
			response.Body.Close()
			if readErr != nil {
				t.Fatal(readErr)
			}
			if response.StatusCode != http.StatusOK ||
				response.Header.Get("Cache-Control") != "no-store" ||
				response.Header.Get("X-Content-Type-Options") != "nosniff" ||
				response.Header.Get("X-Request-ID") == "" {
				t.Fatalf("incorrect response for %s: %d %s", path, response.StatusCode, body)
			}
			bodies[i] = body
		}
		return bodies
	}
	baseline := read(t)

	var bannerHeadline string
	if err := pool.QueryRow(ctx,
		"SELECT headline FROM marketplace.homepage_banners WHERE id=$1",
		fixtureBannerID,
	).Scan(&bannerHeadline); err != nil {
		t.Fatal(err)
	}
	var rankedID string
	var rankedSales int32
	if err := pool.QueryRow(ctx, `
		SELECT product_id::text, demo_weekly_sales
		FROM marketplace.homepage_best_sellers
		ORDER BY demo_weekly_sales ASC LIMIT 1
	`).Scan(&rankedID, &rankedSales); err != nil {
		t.Fatal(err)
	}
	var dealID string
	var dealPosition int32
	if err := pool.QueryRow(ctx, `
		SELECT offer_id::text, position FROM marketplace.homepage_deals
		ORDER BY position ASC LIMIT 1
	`).Scan(&dealID, &dealPosition); err != nil {
		t.Fatal(err)
	}
	var maxDealPosition int32
	if err := pool.QueryRow(ctx,
		"SELECT MAX(position) FROM marketplace.homepage_deals",
	).Scan(&maxDealPosition); err != nil {
		t.Fatal(err)
	}

	changes := []struct {
		name      string
		index     int
		statement string
		id        string
		original  any
		updated   any
	}{
		{"banners", 0,
			"UPDATE marketplace.homepage_banners SET headline=$1 WHERE id=$2",
			fixtureBannerID, bannerHeadline, "3E independent source verification"},
		{"best sellers", 1,
			"UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2",
			rankedID, rankedSales, int32(999)},
		{"deals", 2,
			"UPDATE marketplace.homepage_deals SET position=$1 WHERE offer_id=$2",
			dealID, dealPosition, maxDealPosition + 1},
	}
	for _, change := range changes {
		t.Run(change.name, func(t *testing.T) {
			if _, err := pool.Exec(ctx, change.statement, change.updated, change.id); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
				defer stop()
				if _, err := pool.Exec(restore, change.statement, change.original, change.id); err != nil {
					t.Errorf("restore %s source: %v", change.name, err)
				}
			})
			after := read(t)
			for index := range after {
				changed := !bytes.Equal(after[index], baseline[index])
				if changed != (index == change.index) {
					t.Fatalf("%s source unexpectedly changed %s (changed=%v)",
						change.name, paths[index], changed)
				}
			}
			if _, err := pool.Exec(ctx, change.statement, change.original, change.id); err != nil {
				t.Fatal(err)
			}
			restored := read(t)
			for index := range restored {
				if !bytes.Equal(restored[index], baseline[index]) {
					t.Fatalf("%s source failed to restore %s", change.name, paths[index])
				}
			}
		})
	}
}
