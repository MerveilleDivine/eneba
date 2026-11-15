//go:build integration

package home

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/catalog"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type bestSellerQueryCounter struct {
	count atomic.Int64
}

func (c *bestSellerQueryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(strings.TrimSpace(data.SQL), "WITH ") {
		c.count.Add(1)
	}
	return ctx
}

func (*bestSellerQueryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func TestBestSellerIntegration(t *testing.T) {
	app, owner := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, raw := range []string{app, owner} {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Hostname() == "" || parsed.Path != "/eneba_test" {
			t.Fatal("best-seller integration requires explicit eneba_test database URLs")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	root := filepath.Join("..", "..", "..")
	if _, err := maintenance.Migrate(ctx, owner, app, filepath.Join(root, "db", "migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := maintenance.SeedDatabase(ctx, app, filepath.Join(root, "db", "seeds")); err != nil {
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(app)
	if err != nil {
		t.Fatal(err)
	}
	counter := &bestSellerQueryCounter{}
	config.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewBestSellerHandler(NewBestSellerService(NewBestSellerRepository(pool)), logger).RegisterRoutes(mux)
	NewBannerHandler(NewBannerService(NewBannerRepository(pool)), logger).RegisterRoutes(mux)
	catalog.NewHandler(catalog.NewService(catalog.NewRepository(pool)), logger).RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Timeout = 10 * time.Second
	endpoint := server.URL + "/api/v1/home/best-sellers"

	get := func(path string) (int, []byte, http.Header) {
		t.Helper()
		response, err := client.Get(path)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		return response.StatusCode, body, response.Header
	}
	read := func() BestSellerPage {
		t.Helper()
		status, body, headers := get(endpoint)
		if status != 200 || headers.Get("Cache-Control") != "no-store" ||
			headers.Get("X-Request-ID") == "" || headers.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("incorrect best-seller HTTP response: %d %s", status, body)
		}
		var page BestSellerPage
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatal(err)
		}
		if page.Items == nil || page.Currency != "EUR" {
			t.Fatalf("invalid best-seller envelope: %+v", page)
		}
		return page
	}
	counter.count.Store(0)
	initial := read()
	if counter.count.Load() != 1 {
		t.Fatalf("best sellers must use one query, got %d", counter.count.Load())
	}
	if len(initial.Items) != 4 || initial.Items[0].Name != "Solar Drift" ||
		initial.Items[1].Name != "Neon Circuit" ||
		initial.Items[2].Name != "Echoes of Orion" ||
		initial.Items[3].Name != "Midnight Protocol" {
		t.Fatalf("wrong database ranking: %+v", initial)
	}
	for index, expected := range []int32{120, 103, 86, 69} {
		item := initial.Items[index]
		if item.DemoWeeklySales != expected || item.Slug == "" || item.CoverURL == "" {
			t.Fatalf("incorrect ranking/SKU projection: %+v", item)
		}
		status, body, _ := get(server.URL + "/api/v1/products?q=" + url.QueryEscape(item.Name))
		if status != 200 {
			t.Fatalf("catalog lookup failed: %d", status)
		}
		var catalogPage catalog.Page
		if err := json.Unmarshal(body, &catalogPage); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, product := range catalogPage.Items {
			if product.ID == item.ID {
				found = true
				if product.Available != item.Available ||
					(product.LowestPriceCents == nil) != (item.LowestPriceCents == nil) ||
					(product.LowestPriceCents != nil && *product.LowestPriceCents != *item.LowestPriceCents) {
					t.Fatalf("best seller differs from catalog availability: %+v %+v", item, product)
				}
			}
		}
		if !found {
			t.Fatalf("ranked product %s missing from catalog", item.ID)
		}
	}
	bannerStatus, originalBanners, _ := get(server.URL + "/api/v1/home/banners")
	if bannerStatus != 200 {
		t.Fatal("banner control request failed")
	}
	catalogStatus, originalCatalog, _ := get(server.URL + "/api/v1/products")
	if catalogStatus != 200 {
		t.Fatal("catalog control request failed")
	}

	for _, query := range []string{"?q=solar", "?unknown=1", "?page=2", "?q=a&q=b"} {
		code, body, _ := get(endpoint + query)
		if code != 400 || !strings.Contains(string(body), "invalid_query") {
			t.Fatalf("unexpected query accepted: %d %s", code, body)
		}
	}
	request, err := http.NewRequest(http.MethodHead, endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	headBody, readErr := io.ReadAll(response.Body)
	response.Body.Close()
	if readErr != nil || response.StatusCode != 200 || len(headBody) != 0 {
		t.Fatal("HEAD contract failed")
	}
	request, err = http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 405 || response.Header.Get("Allow") != "GET, HEAD" {
		t.Fatal("method contract failed")
	}

	// Mutations are committed only in the isolated test database so HTTP
	// requests on different connections can observe them. Cleanup reverses
	// every mutation even when a later assertion fails.
	last := initial.Items[3]
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", last.DemoWeeklySales, last.ID)
	})
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=999 WHERE product_id=$1", last.ID); err != nil {
		t.Fatal(err)
	}
	moved := read()
	if len(moved.Items) != 4 || moved.Items[0].ID != last.ID {
		t.Fatalf("changing ranking table did not update the block: %+v", moved)
	}
	_, newBanners, _ := get(server.URL + "/api/v1/home/banners")
	if string(newBanners) != string(originalBanners) {
		t.Fatal("editing best sellers changed the independent banner source")
	}
	_, newCatalog, _ := get(server.URL + "/api/v1/products")
	if string(newCatalog) != string(originalCatalog) {
		t.Fatal("editing only the ranking table changed catalog content")
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", last.DemoWeeklySales, last.ID); err != nil {
		t.Fatal(err)
	}

	// Equal demo counts resolve by case-normalized product name, not the
	// original ranking-table insertion order.
	first := initial.Items[0]
	second := initial.Items[1]
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", first.DemoWeeklySales, first.ID)
		_, _ = pool.Exec(restore, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", second.DemoWeeklySales, second.ID)
	})
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=250 WHERE product_id IN ($1,$2)", first.ID, second.ID); err != nil {
		t.Fatal(err)
	}
	tied := read()
	if tied.Items[0].ID != second.ID || tied.Items[1].ID != first.ID {
		t.Fatalf("equal weekly demo sales were not ordered by normalized product name: %+v", tied)
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", first.DemoWeeklySales, first.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_best_sellers SET demo_weekly_sales=$1 WHERE product_id=$2", second.DemoWeeklySales, second.ID); err != nil {
		t.Fatal(err)
	}

	// Avoid changing a seeded product's active status: catalog and home
	// package integration tests may run in parallel against eneba_test.
	const archivedID = "10000000-0000-4000-8000-000000000017"
	if _, err := pool.Exec(ctx, "INSERT INTO marketplace.homepage_best_sellers(product_id,demo_weekly_sales) VALUES ($1,1000)", archivedID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", archivedID)
	})
	inactive := read()
	if len(inactive.Items) != 4 {
		t.Fatalf("inactive ranking member changed visible results: %+v", inactive)
	}
	for _, item := range inactive.Items {
		if item.ID == archivedID {
			t.Fatal("inactive product was exposed")
		}
	}
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", archivedID); err != nil {
		t.Fatal(err)
	}

	const soldOutID = "10000000-0000-4000-8000-000000000016"
	if _, err := pool.Exec(ctx, "INSERT INTO marketplace.homepage_best_sellers(product_id,demo_weekly_sales) VALUES ($1,250)", soldOutID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", soldOutID)
	})
	soldOut := read()
	if len(soldOut.Items) != 5 || soldOut.Items[0].ID != soldOutID ||
		soldOut.Items[0].Available || soldOut.Items[0].LowestPriceCents != nil {
		t.Fatalf("sold-out product misrepresented: %+v", soldOut)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", soldOutID); err != nil {
		t.Fatal(err)
	}

	// With a fixed limit, adding more ranked products must never cause
	// additional SQL requests or more than eight returned cards.
	var extraIDs []string
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		for _, id := range extraIDs {
			_, _ = pool.Exec(restore, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", id)
		}
	})
	rows, err := pool.Query(ctx, `
		INSERT INTO marketplace.homepage_best_sellers (product_id, demo_weekly_sales)
		SELECT id, 1 FROM marketplace.products
		WHERE active AND NOT EXISTS (
			SELECT 1 FROM marketplace.homepage_best_sellers ranked WHERE ranked.product_id = products.id
		)
		ORDER BY id LIMIT 6 RETURNING product_id::text
	`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		extraIDs = append(extraIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		t.Fatal(err)
	}
	rows.Close()
	counter.count.Store(0)
	bounded := read()
	if len(bounded.Items) != 8 || counter.count.Load() != 1 {
		t.Fatalf("best-seller limit/query budget broken: %d records, %d queries", len(bounded.Items), counter.count.Load())
	}
	for _, id := range extraIDs {
		if _, err := pool.Exec(ctx, "DELETE FROM marketplace.homepage_best_sellers WHERE product_id=$1", id); err != nil {
			t.Fatal(err)
		}
	}
	if len(read().Items) != 4 {
		t.Fatal("ranking table did not recover after test mutations")
	}
}

func TestBestSellerFailureResponses(t *testing.T) {
	app := os.Getenv("TEST_DATABASE_URL")
	parsed, err := url.Parse(app)
	if err != nil || parsed.Hostname() == "" || parsed.Path != "/eneba_test" {
		t.Fatal("best seller failure tests require an isolated eneba_test URL")
	}
	for _, situation := range []string{"unavailable", "unexpected"} {
		t.Run(situation, func(t *testing.T) {
			cfg, err := pgxpool.ParseConfig(app)
			if err != nil {
				t.Fatal(err)
			}
			cfg.ConnConfig.ConnectTimeout = time.Second
			expectedStatus, expectedCode := 503, "service_unavailable"
			if situation == "unavailable" {
				cfg.ConnConfig.Host = "127.0.0.1"
				cfg.ConnConfig.Port = 1
				cfg.ConnConfig.Fallbacks = nil
			} else {
				expectedStatus, expectedCode = 500, "internal_error"
				cfg.AfterConnect = func(context.Context, *pgx.Conn) error {
					return errors.New("private connection and password details")
				}
			}
			pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(pool.Close)
			var logs concurrentLogBuffer
			logger := slog.New(slog.NewJSONHandler(&logs, nil))
			mux := http.NewServeMux()
			NewBestSellerHandler(NewBestSellerService(NewBestSellerRepository(pool)), logger).RegisterRoutes(mux)
			server := httptest.NewServer(httpapi.Wrap(mux, logger))
			t.Cleanup(server.Close)
			response, err := server.Client().Get(server.URL + "/api/v1/home/best-sellers")
			if err != nil {
				t.Fatal(err)
			}
			body, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != expectedStatus ||
				!strings.Contains(string(body), "\"" + expectedCode + "\"") {
				t.Fatalf("wrong failure response: %d %s", response.StatusCode, body)
			}
			if strings.Contains(string(body)+logs.String(), "private") ||
				strings.Contains(string(body), "postgres://") {
				t.Fatal("storage details leaked")
			}
		})
	}
}
