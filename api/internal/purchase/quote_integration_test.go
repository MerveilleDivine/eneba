//go:build integration

package purchase

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
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

func quoteTestDatabase(t *testing.T) (*Service, func()) {
	t.Helper()
	owner, app := os.Getenv("TEST_MIGRATION_DATABASE_URL"), os.Getenv("TEST_DATABASE_URL")
	for _, dsn := range []string{owner, app} {
		u, err := url.Parse(dsn)
		if err != nil || u.Path != "/eneba_test" || u.Hostname() == "" {
			t.Fatal("quote integration requires explicit isolated eneba_test URLs")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	root := filepath.Join("..", "..", "..", "db")
	if _, err := maintenance.Migrate(ctx, owner, app, filepath.Join(root, "migrations")); err != nil {
		t.Fatalf("test schema migration failed: %v", err)
	}
	if _, err := maintenance.SeedDatabase(ctx, app, filepath.Join(root, "seeds")); err != nil {
		t.Fatalf("test seed failed: %v", err)
	}
	pool, err := database.OpenPool(ctx, app)
	if err != nil {
		t.Fatal(err)
	}
	return NewService(NewRepository(pool)), pool.Close
}

func TestQuoteReadsRealInventoryWithoutAllocating(t *testing.T) {
	service, cleanup := quoteTestDatabase(t)
	defer cleanup()
	ctx := context.Background()
	var beforeOrders, beforeItems int
	if err := service.repository.pool.QueryRow(ctx,
		"SELECT count(*) FROM marketplace.orders").Scan(&beforeOrders); err != nil {
		t.Fatal(err)
	}
	if err := service.repository.pool.QueryRow(ctx,
		"SELECT count(*) FROM marketplace.order_items").Scan(&beforeItems); err != nil {
		t.Fatal(err)
	}
	findOffer := func(slug string, available bool) string {
		t.Helper()
		var id string
		err := service.repository.pool.QueryRow(ctx, `
			SELECT o.id::text FROM marketplace.offers o
			JOIN marketplace.products p ON p.id=o.product_id
			WHERE p.slug=$1 AND o.active AND
				(EXISTS (SELECT 1 FROM marketplace.digital_keys k WHERE k.offer_id=o.id AND
					NOT EXISTS (SELECT 1 FROM marketplace.order_items i WHERE i.digital_key_id=k.id)))=$2
			ORDER BY o.id LIMIT 1`, slug, available).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	availableID := findOffer("solar-drift", true)
	soldID := findOffer("lunar-legacy", false)
	q, err := service.Quote(ctx, QuoteRequest{Lines: []QuoteRequestLine{
		{OfferID: availableID, Quantity: 1}, {OfferID: soldID, Quantity: 1},
	}})
	if err != nil || q.TotalCents != nil || len(q.Lines) != 2 ||
		!q.Lines[0].Available || q.Lines[1].Available || q.Lines[0].ProductName == nil ||
		*q.Lines[0].ProductName != "Solar Drift" || q.Lines[1].ProductName == nil {
		t.Fatalf("wrong quote projection: %+v, %v", q, err)
	}
	// Unknown, well-formed offers remain removable without inventing their price.
	id := "00000000-0000-4000-8000-000000000000"
	q, err = service.Quote(ctx, QuoteRequest{Lines: []QuoteRequestLine{{OfferID: id, Quantity: 1}}})
	if err != nil || q.TotalCents != nil || len(q.Lines) != 1 ||
		q.Lines[0].Available || q.Lines[0].UnitPriceCents != nil || q.Lines[0].ProductName != nil {
		t.Fatalf("missing offer invented stock: %+v, %v", q, err)
	}
	q, err = service.Quote(ctx, QuoteRequest{Lines: []QuoteRequestLine{{OfferID: availableID, Quantity: 1}}})
	if err != nil || q.TotalCents == nil || *q.TotalCents <= 0 ||
		q.Lines[0].LineTotalCents == nil || *q.Lines[0].LineTotalCents != *q.TotalCents {
		t.Fatalf("available quote lacks authoritative amount: %+v, %v", q, err)
	}
	var afterOrders, afterItems int
	if err := service.repository.pool.QueryRow(ctx,
		"SELECT count(*) FROM marketplace.orders").Scan(&afterOrders); err != nil {
		t.Fatal(err)
	}
	if err := service.repository.pool.QueryRow(ctx,
		"SELECT count(*) FROM marketplace.order_items").Scan(&afterItems); err != nil {
		t.Fatal(err)
	}
	if beforeOrders != afterOrders || beforeItems != afterItems {
		t.Fatal("quote wrote an order or allocated an inventory key")
	}
}

func TestQuoteHTTPEndToEnd(t *testing.T) {
	service, cleanup := quoteTestDatabase(t)
	defer cleanup()
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewHandler(service, logger).RegisterRoutes(mux)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	defer server.Close()

	var offerID string
	err := service.repository.pool.QueryRow(context.Background(), `
		SELECT o.id::text FROM marketplace.offers o
		JOIN marketplace.products p ON p.id=o.product_id
		WHERE p.slug='solar-drift' AND o.active ORDER BY o.id LIMIT 1`).Scan(&offerID)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(QuoteRequest{Lines: []QuoteRequestLine{{OfferID: offerID, Quantity: 1}}})
	request, _ := http.NewRequest(http.MethodPost, server.URL+"/api/v1/cart/quote", bytes.NewReader(data))
	request.Header.Set("Content-Type", "application/json")
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || response.Header.Get("Cache-Control") != "no-store" ||
		response.Header.Get("X-Content-Type-Options") != "nosniff" || response.Header.Get("X-Request-ID") == "" {
		t.Fatalf("incorrect response %d: %s", response.StatusCode, body)
	}
	if strings.Contains(string(body), "DEMO-NONREDEEMABLE") || strings.Contains(string(body), "demoCode") {
		t.Fatal("quote leaked an inventory key")
	}
	var quote Quote
	if err := json.Unmarshal(body, &quote); err != nil {
		t.Fatal(err)
	}
	if quote.TotalCents == nil || quote.Currency != "EUR" || len(quote.Lines) != 1 ||
		quote.Lines[0].OfferID != offerID {
		t.Fatalf("bad quote: %+v", quote)
	}
}
