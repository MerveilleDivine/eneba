//go:build integration

package home

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/jackc/pgx/v5/pgxpool"
)

const fixtureBannerID = "50000000-0000-4000-8000-000000000001"

// The HTTP server logs on its own goroutine; assertions must read safely.
type concurrentLogBuffer struct {
	mu   sync.Mutex
	body bytes.Buffer
}

func (b *concurrentLogBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.body.Write(data)
}

func (b *concurrentLogBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.body.String()
}

func TestBannerIntegration(t *testing.T) {
	app, owner := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, value := range []string{app, owner} {
		parsed, err := url.Parse(value)
		if err != nil || parsed.Path != "/eneba_test" || parsed.Hostname() == "" {
			t.Fatal("banner integration requires explicit eneba_test database URLs")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
	var recordedLogs concurrentLogBuffer
	logger := slog.New(slog.NewJSONHandler(&recordedLogs, nil))
	mux := http.NewServeMux()
	NewBannerHandler(NewBannerService(NewBannerRepository(pool)), logger).RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Timeout = 10 * time.Second
	endpoint := server.URL + "/api/v1/home/banners"

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
	read := func() BannerPage {
		t.Helper()
		status, body, headers := get(endpoint)
		if status != 200 || headers.Get("Cache-Control") != "no-store" ||
			headers.Get("X-Request-ID") == "" {
			t.Fatalf("unexpected banner HTTP metadata: %d %s", status, body)
		}
		var page BannerPage
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatal(err)
		}
		return page
	}

	page := read()
	if len(page.Items) != 1 || page.Items[0].ID != fixtureBannerID ||
		page.Items[0].ImageURL != "/images/banners/discover-world.svg" ||
		page.Items[0].LinkHref != "/catalog" {
		t.Fatalf("seed correction did not reach Go API: %+v", page)
	}

	// The service must obey its own ordering and three-banner limit even
	// when a source table contains more active promotional records.
	var extras []string
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		for _, id := range extras {
			if _, err := pool.Exec(cleanupCtx, "DELETE FROM marketplace.homepage_banners WHERE id=$1", id); err != nil {
				t.Errorf("remove banner test fixture: %v", err)
			}
		}
	})
	for position := 1; position <= 3; position++ {
		var id string
		if err := pool.QueryRow(ctx, `
			INSERT INTO marketplace.homepage_banners(headline, subheading, image_url, link_href, position)
			VALUES ('Additional demo promotion', '', '/images/banners/discover-world.svg', '/catalog', $1)
			RETURNING id::text
		`, position).Scan(&id); err != nil {
			t.Fatal(err)
		}
		extras = append(extras, id)
	}
	ranked := read()
	if len(ranked.Items) != 3 || ranked.Items[0].Position != 0 ||
		ranked.Items[1].Position != 1 || ranked.Items[2].Position != 2 {
		t.Fatalf("banner ordering or bound broken: %+v", ranked)
	}
	// A malformed selected banner must not hide the next valid promotion.
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET link_href='/unsafe' WHERE id=$1", extras[1]); err != nil {
		t.Fatal(err)
	}
	recovered := read()
	if len(recovered.Items) != 3 || recovered.Items[0].Position != 0 ||
		recovered.Items[1].Position != 1 || recovered.Items[2].Position != 3 {
		t.Fatalf("invalid banner must be skipped in favor of valid later candidates: %+v", recovered)
	}
	if !strings.Contains(recordedLogs.String(), extras[1]) ||
		!strings.Contains(recordedLogs.String(), "invalid_destination") ||
		strings.Contains(recordedLogs.String(), "/unsafe") {
		t.Fatal("rejected banner must be logged with safe ID and reason, never raw destination")
	}
	for _, malformed := range []struct{ headline, href string }{
		{" \uFEFF ", "/catalog"},
		{"Valid headline", "/catalog?page=%2B1"},
		{"Valid headline", "/catalog?minPriceCents=-0"},
	} {
		if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET headline=$1, link_href=$2 WHERE id=$3", malformed.headline, malformed.href, extras[1]); err != nil {
			t.Fatal(err)
		}
		filtered := read()
		if len(filtered.Items) != 3 || filtered.Items[2].Position != 3 {
			t.Fatal("browser-invalid source data must not displace a later valid banner")
		}
	}
	for _, id := range extras {
		if _, err := pool.Exec(ctx, "DELETE FROM marketplace.homepage_banners WHERE id=$1", id); err != nil {
			t.Fatal(err)
		}
	}

	for _, query := range []string{"?unknown=1", "?q=solar", "?q=one&q=two"} {
		code, body, _ := get(endpoint + query)
		if code != 400 || !strings.Contains(string(body), "invalid_query") {
			t.Fatalf("unexpected query accepted: %d %s", code, body)
		}
	}

	head, err := http.NewRequest(http.MethodHead, endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Do(head)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || len(body) != 0 {
		t.Fatal("HEAD contract failed")
	}
	post, err := http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err = client.Do(post)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 405 || response.Header.Get("Allow") != "GET, HEAD" {
		t.Fatal("method contract failed")
	}

	// This test owns a committed mutation of eneba_test only and restores the
	// exact original values on cleanup, even after a test failure.
	var oldLink string
	var oldActive bool
	if err := pool.QueryRow(ctx, "SELECT link_href, active FROM marketplace.homepage_banners WHERE id=$1", fixtureBannerID).Scan(&oldLink, &oldActive); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := pool.Exec(restore, "UPDATE marketplace.homepage_banners SET link_href=$1, active=$2 WHERE id=$3", oldLink, oldActive, fixtureBannerID); err != nil {
			t.Errorf("restore banner destination and active state: %v", err)
		}
	})
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET active=false WHERE id=$1", fixtureBannerID); err != nil {
		t.Fatal(err)
	}
	if empty := read(); len(empty.Items) != 0 || empty.Items == nil {
		t.Fatalf("inactive fixture must return a real empty list: %+v", empty)
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET active=true, link_href='/unsafe' WHERE id=$1", fixtureBannerID); err != nil {
		t.Fatal(err)
	}
	empty := read()
	if len(empty.Items) != 0 || empty.Items == nil {
		t.Fatal("a single invalid banner must fail closed to an empty list, not a 500 or unsafe link")
	}
	var originalHeadline string
	if err := pool.QueryRow(ctx, "SELECT headline FROM marketplace.homepage_banners WHERE id=$1", fixtureBannerID).Scan(&originalHeadline); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := pool.Exec(restore, "UPDATE marketplace.homepage_banners SET headline=$1 WHERE id=$2", originalHeadline, fixtureBannerID); err != nil {
			t.Errorf("restore banner headline: %v", err)
		}
	})
	// A large stored string must be bounded in SQL and rejected by the service;
	// it must never be transferred in full or exposed in a success response.
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET headline=repeat(' ', 20000)||'Sale', link_href=$1 WHERE id=$2", oldLink, fixtureBannerID); err != nil {
		t.Fatal(err)
	}
	if oversized := read(); len(oversized.Items) != 0 {
		t.Fatalf("oversized raw banner text was returned: %+v", oversized)
	}
	if !strings.Contains(recordedLogs.String(), "invalid_headline") {
		t.Fatal("oversized stored text must produce a safe structured warning")
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_banners SET headline=$1, link_href=$2 WHERE id=$3", originalHeadline, oldLink, fixtureBannerID); err != nil {
		t.Fatal(err)
	}
	if len(read().Items) != 1 {
		t.Fatal("banner did not recover after correcting data")
	}
}
