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
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/catalog"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	fixtureDealOffer = "30000000-0000-4000-8000-000000000003"
	alternateDealOffer = "30000000-0000-4000-8000-000000000004"
)

func TestDealsIntegration(t *testing.T) {
	app, owner := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, raw := range []string{app, owner} {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Hostname() == "" || parsed.Path != "/eneba_test" {
			t.Fatal("deals integration requires explicit eneba_test URLs")
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
	NewDealHandler(NewDealService(NewDealRepository(pool)), logger).RegisterRoutes(mux)
	NewBannerHandler(NewBannerService(NewBannerRepository(pool)), logger).RegisterRoutes(mux)
	NewBestSellerHandler(NewBestSellerService(NewBestSellerRepository(pool)), logger).RegisterRoutes(mux)
	catalog.NewHandler(catalog.NewService(catalog.NewRepository(pool)), logger).RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	client := server.Client()
	client.Timeout = 10 * time.Second
	endpoint := server.URL + "/api/v1/home/deals"

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
	read := func() DealPage {
		t.Helper()
		status, body, headers := get(endpoint)
		if status != 200 || headers.Get("Cache-Control") != "no-store" ||
			headers.Get("X-Request-ID") == "" || headers.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("unexpected deals response: %d %s", status, body)
		}
		var page DealPage
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatal(err)
		}
		if page.Items == nil || page.Currency != "EUR" {
			t.Fatalf("invalid deals envelope: %+v", page)
		}
		return page
	}

	original := read()
	if len(original.Items) != 3 {
		t.Fatalf("expected three real seller deals: %+v", original)
	}
	for i, wanted := range []struct {
		offer string
		price, list, percent int64
	}{
		{fixtureDealOffer, 1273, 1873, 32},
		{"30000000-0000-4000-8000-000000000006", 1660, 2260, 26},
		{"30000000-0000-4000-8000-000000000009", 1684, 2284, 26},
	} {
		deal := original.Items[i]
		if deal.OfferID != wanted.offer || deal.PriceCents != wanted.price ||
			deal.ListPriceCents != wanted.list || deal.DiscountPercent != wanted.percent ||
			deal.Position != int32(i) || deal.ProductID == "" || deal.SellerName == "" {
			t.Fatalf("incorrect seller-specific projection: %+v", deal)
		}
	}
	if original.Items[0].SellerName != "Purple Lantern" ||
		original.Items[0].Name != "The Last Outpost" {
		t.Fatalf("offer and seller association lost: %+v", original.Items[0])
	}
	code, body, _ := get(server.URL + "/api/v1/products?q=The+Last+Outpost")
	if code != 200 || !strings.Contains(string(body), "The Last Outpost") {
		t.Fatal("deal destination must be navigable in the catalog")
	}
	if strings.Contains(string(body), "DEMO-NONREDEEMABLE") {
		t.Fatal("catalog accidentally exposes key material")
	}

	for _, suffix := range []string{"?q=outpost", "?unknown=1", "?q=one&q=two"} {
		code, body, _ := get(endpoint + suffix)
		if code != 400 || !strings.Contains(string(body), "invalid_query") {
			t.Fatalf("unexpected deal query accepted: %d %s", code, body)
		}
	}
	request, err := http.NewRequest(http.MethodHead, endpoint, nil)
	if err != nil { t.Fatal(err) }
	response, err := client.Do(request)
	if err != nil { t.Fatal(err) }
	headBytes, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || len(headBytes) != 0 {
		t.Fatal("HEAD behavior incorrect")
	}
	request, err = http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil { t.Fatal(err) }
	response, err = client.Do(request)
	if err != nil { t.Fatal(err) }
	response.Body.Close()
	if response.StatusCode != 405 || response.Header.Get("Allow") != "GET, HEAD" {
		t.Fatal("unsupported method must return 405")
	}

	_, previousBanners, _ := get(server.URL + "/api/v1/home/banners")
	_, previousRanking, _ := get(server.URL + "/api/v1/home/best-sellers")

	// Committed test-database updates are visible across pooled HTTP reads.
	// Every mutation has cleanup registered before the dependent assertions.
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "UPDATE marketplace.homepage_deals SET position=0 WHERE offer_id=$1", fixtureDealOffer)
	})
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_deals SET position=4 WHERE offer_id=$1", fixtureDealOffer); err != nil { t.Fatal(err) }
	moved := read()
	if moved.Items[0].OfferID == fixtureDealOffer || moved.Items[2].OfferID != fixtureDealOffer {
		t.Fatalf("deal source ranking update had no effect: %+v", moved)
	}
	_, nextBanners, _ := get(server.URL + "/api/v1/home/banners")
	_, nextRanking, _ := get(server.URL + "/api/v1/home/best-sellers")
	if string(previousBanners) != string(nextBanners) || string(previousRanking) != string(nextRanking) {
		t.Fatal("editing homepage_deals must not change banners or best sellers")
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.homepage_deals SET position=0 WHERE offer_id=$1", fixtureDealOffer); err != nil { t.Fatal(err) }

	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "UPDATE marketplace.offers SET price_cents=1273, active=true WHERE id=$1", fixtureDealOffer)
	})
	if _, err := pool.Exec(ctx, "UPDATE marketplace.offers SET price_cents=1300 WHERE id=$1", fixtureDealOffer); err != nil { t.Fatal(err) }
	changed := read()
	if changed.Items[0].PriceCents != 1300 || changed.Items[0].ListPriceCents != 1873 ||
		changed.Items[0].DiscountPercent != 30 {
		t.Fatalf("current and list prices must belong to the selected offer: %+v", changed.Items[0])
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.offers SET active=false WHERE id=$1", fixtureDealOffer); err != nil { t.Fatal(err) }
	inactive := read()
	if len(inactive.Items) != 2 {
		t.Fatalf("inactive offers cannot advertise deals: %+v", inactive)
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.offers SET price_cents=1273, active=true WHERE id=$1", fixtureDealOffer); err != nil { t.Fatal(err) }

	// A different seller's offer for the same SKU is *not* a valid deal
	// until that exact offer has a higher list price and is on the deal board.
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.homepage_deals WHERE offer_id=$1", alternateDealOffer)
		_, _ = pool.Exec(restore, "UPDATE marketplace.offers SET list_price_cents=NULL WHERE id=$1", alternateDealOffer)
	})
	if _, err := pool.Exec(ctx, "INSERT INTO marketplace.homepage_deals(offer_id,position) VALUES ($1,3)", alternateDealOffer); err != nil { t.Fatal(err) }
	if len(read().Items) != 3 {
		t.Fatal("an offer with no original price is not a valid deal")
	}
	if _, err := pool.Exec(ctx, "UPDATE marketplace.offers SET list_price_cents=2000 WHERE id=$1", alternateDealOffer); err != nil { t.Fatal(err) }
	both := read()
	if len(both.Items) != 4 || both.Items[0].ProductID != both.Items[3].ProductID ||
		both.Items[0].OfferID == both.Items[3].OfferID ||
		both.Items[3].SellerName != "Northern Pixel" ||
		both.Items[3].PriceCents != 1523 || both.Items[3].DiscountPercent != 23 {
		t.Fatalf("different seller offers on the same SKU were mixed: %+v", both)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.homepage_deals WHERE offer_id=$1", alternateDealOffer); err != nil { t.Fatal(err) }
	if _, err := pool.Exec(ctx, "UPDATE marketplace.offers SET list_price_cents=NULL WHERE id=$1", alternateDealOffer); err != nil { t.Fatal(err) }

	// Exhaust both keys of one selected offer through real foreign-key-protected
	// order allocations in eneba_test, without editing or refilling key fixtures.
	var testUser string
	if err := pool.QueryRow(ctx, `INSERT INTO marketplace.users(email, display_name, password_hash)
		VALUES ('test-deals-'||gen_random_uuid()::text||'@invalid.test', 'Deals integration', 'not-a-login')
		RETURNING id::text`).Scan(&testUser); err != nil { t.Fatal(err) }
	t.Cleanup(func() {
		restore, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.order_items WHERE order_id IN (SELECT id FROM marketplace.orders WHERE user_id=$1)", testUser)
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.orders WHERE user_id=$1", testUser)
		_, _ = pool.Exec(restore, "DELETE FROM marketplace.users WHERE id=$1", testUser)
	})
	for _, keyID := range []string{
		"40000000-0000-4000-8000-000000000031",
		"40000000-0000-4000-8000-000000000032",
	} {
		var orderID string
		if err := pool.QueryRow(ctx, `
			INSERT INTO marketplace.orders(user_id,idempotency_key,request_fingerprint,total_cents)
			VALUES ($1, gen_random_uuid(), decode(repeat('00',32),'hex'), 1273)
			RETURNING id::text`, testUser).Scan(&orderID); err != nil { t.Fatal(err) }
		if _, err := pool.Exec(ctx, `
			INSERT INTO marketplace.order_items(order_id,offer_id,digital_key_id,unit_price_cents,product_name_snapshot,seller_name_snapshot)
			VALUES ($1,$2,$3,1273,'The Last Outpost','Purple Lantern')`, orderID, fixtureDealOffer, keyID); err != nil { t.Fatal(err) }
	}
	soldOut := read()
	if len(soldOut.Items) != 2 {
		t.Fatalf("an offer with no unallocated keys must disappear: %+v", soldOut)
	}
	for _, deal := range soldOut.Items {
		if deal.OfferID == fixtureDealOffer { t.Fatal("sold out seller offer still advertised") }
	}
	for _, row := range soldOut.Items {
		if strings.Contains(row.SellerName, "DEMO-NONREDEEMABLE") { t.Fatal("key leaked") }
	}
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.order_items WHERE order_id IN (SELECT id FROM marketplace.orders WHERE user_id=$1)", testUser); err != nil { t.Fatal(err) }
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.orders WHERE user_id=$1", testUser); err != nil { t.Fatal(err) }
	if _, err := pool.Exec(ctx, "DELETE FROM marketplace.users WHERE id=$1", testUser); err != nil { t.Fatal(err) }
	if len(read().Items) != 3 { t.Fatal("deals did not recover after isolated allocations were reversed") }
}

func TestDealFailureResponses(t *testing.T) {
	app := os.Getenv("TEST_DATABASE_URL")
	parsed, err := url.Parse(app)
	if err != nil || parsed.Hostname() == "" || parsed.Path != "/eneba_test" {
		t.Fatal("test requires isolated eneba_test URL")
	}
	for _, situation := range []string{"unavailable", "unexpected"} {
		t.Run(situation, func(t *testing.T) {
			cfg, err := pgxpool.ParseConfig(app)
			if err != nil { t.Fatal(err) }
			cfg.ConnConfig.ConnectTimeout = time.Second
			status, code := 503, "service_unavailable"
			if situation == "unavailable" {
				cfg.ConnConfig.Host = "127.0.0.1"
				cfg.ConnConfig.Port = 1
				cfg.ConnConfig.Fallbacks = nil
			} else {
				status, code = 500, "internal_error"
				cfg.AfterConnect = func(context.Context, *pgx.Conn) error {
					return errors.New("private database credentials")
				}
			}
			pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil { t.Fatal(err) }
			t.Cleanup(pool.Close)
			var logs concurrentLogBuffer
			logger := slog.New(slog.NewJSONHandler(&logs, nil))
			mux := http.NewServeMux()
			NewDealHandler(NewDealService(NewDealRepository(pool)), logger).RegisterRoutes(mux)
			server := httptest.NewServer(httpapi.Wrap(mux, logger))
			t.Cleanup(server.Close)
			response, err := server.Client().Get(server.URL + "/api/v1/home/deals")
			if err != nil { t.Fatal(err) }
			body, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil { t.Fatal(err) }
			if response.StatusCode != status || !strings.Contains(string(body), "\"" + code + "\"") {
				t.Fatalf("unexpected service response: %d %s", response.StatusCode, body)
			}
			if strings.Contains(string(body)+logs.String(), "private") || strings.Contains(string(body), "postgres://") {
				t.Fatal("internal details must not leak")
			}
		})
	}
}
