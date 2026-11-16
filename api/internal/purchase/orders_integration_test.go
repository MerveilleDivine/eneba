//go:build integration

package purchase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MerveilleDivine/eneba/api/internal/auth"
	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

func TestOrdersOwnershipSnapshotsPaginationAndDelivery(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, true)
	ctx := context.Background()
	checkout := NewCheckoutService(quote.repository)
	var purchased []PurchaseResult
	for i, offer := range []string{f.offer1, f.offer2} {
		price := f.price1
		if i == 1 {
			price = f.price2
		}
		result, err := checkout.Purchase(ctx, f.buyer1, []string{"aaaaaaaa-1111-4111-8111-111111111111", "bbbbbbbb-2222-4222-8222-222222222222"}[i], PurchaseRequest{Lines: []PurchaseRequestLine{{OfferID: offer, Quantity: 1, ExpectedUnitPriceCents: price}}})
		if err != nil {
			t.Fatal(err)
		}
		purchased = append(purchased, result)
	}
	pool := quote.repository.pool
	var originalSeller string
	if err := pool.QueryRow(ctx, `SELECT s.name FROM marketplace.sellers s JOIN marketplace.offers o ON o.seller_id=s.id WHERE o.id=$1::uuid`, f.offer1).Scan(&originalSeller); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `UPDATE marketplace.sellers SET name=$2 WHERE id=(SELECT seller_id FROM marketplace.offers WHERE id=$1::uuid)`, f.offer1, originalSeller); err != nil {
			t.Error(err)
		}
	})
	// Receipt data must survive repricing, renaming and removal from sale.
	for _, sql := range []string{
		`UPDATE marketplace.products SET name='Changed title',active=false WHERE id=(SELECT product_id FROM marketplace.offers WHERE id=$1::uuid)`,
		`UPDATE marketplace.offers SET price_cents=9999,active=false WHERE id=$1::uuid`,
		`UPDATE marketplace.sellers SET name='Changed seller' WHERE id=(SELECT seller_id FROM marketplace.offers WHERE id=$1::uuid)`,
	} {
		if _, err := pool.Exec(ctx, sql, f.offer1); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `UPDATE marketplace.orders SET created_at='2026-11-16T10:00:00Z' WHERE user_id=$1::uuid`, f.buyer1); err != nil {
		t.Fatal(err)
	}
	service := NewOrderService(quote.repository)
	detail, err := service.Detail(ctx, f.buyer1, purchased[0].OrderID)
	if err != nil || len(detail.Items) != 1 || detail.TotalCents != f.price1 {
		t.Fatalf("receipt unavailable: %+v %v", detail, err)
	}
	item := detail.Items[0]
	if item.ProductName != "Checkout fixture game" || item.SellerName == "Changed seller" || item.UnitPriceCents != f.price1 || !strings.HasSuffix(item.KeyCode, "-fixture-key1") {
		t.Fatal("receipt lost historical snapshot or allocated key")
	}
	first, err := service.List(ctx, f.buyer1, "pageSize=1")
	if err != nil || first.Total != 2 || len(first.Items) != 1 {
		t.Fatalf("first page: %+v %v", first, err)
	}
	second, err := service.List(ctx, f.buyer1, "page=2&pageSize=1")
	if err != nil || second.Total != 2 || len(second.Items) != 1 || first.Items[0].ID <= second.Items[0].ID {
		t.Fatalf("unstable order pagination: %+v %+v %v", first, second, err)
	}
	empty, err := service.List(ctx, f.buyer1, "page=3&pageSize=1")
	if err != nil || empty.Total != 2 || empty.Items == nil || len(empty.Items) != 0 {
		t.Fatalf("empty page: %+v %v", empty, err)
	}
	other, err := service.List(ctx, f.buyer2, "")
	if err != nil || other.Total != 0 || len(other.Items) != 0 {
		t.Fatal("another buyer received history")
	}

	accounts := auth.NewService(auth.NewRepository(pool))
	makeToken := func(buyer string) string {
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(raw)
		if _, err := pool.Exec(ctx, `INSERT INTO marketplace.sessions(user_id,token_hash,expires_at) VALUES($1::uuid,$2,now()+interval '1 hour')`, buyer, digest[:]); err != nil {
			t.Fatal(err)
		}
		return base64.RawURLEncoding.EncodeToString(raw)
	}
	tokenA, tokenB := makeToken(f.buyer1), makeToken(f.buyer2)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	mux := http.NewServeMux()
	NewOrderHandler(service, accounts, logger, false).RegisterRoutes(mux)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	request := func(path, token, method string) (int, string, http.Header) {
		req, _ := http.NewRequest(method, server.URL+path, nil)
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "eneba_session", Value: token})
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		return res.StatusCode, string(body), res.Header
	}
	path := "/api/v1/orders/" + detail.ID
	status, body, headers := request(path, tokenA, "GET")
	if status != 200 || headers.Get("Cache-Control") != "private, no-store" || !strings.Contains(body, item.KeyCode) {
		t.Fatal("owner could not receive private delivery")
	}
	status, foreign, _ := request(path, tokenB, "GET")
	if status != 404 {
		t.Fatal("foreign owner accepted")
	}
	status, missing, _ := request("/api/v1/orders/00000000-0000-4000-8000-000000000000", tokenB, "GET")
	if status != 404 || missing != foreign {
		t.Fatal("order existence was disclosed")
	}
	for _, test := range []struct {
		path, token, method string
		status              int
	}{
		{path, "", "GET", 401}, {path + "?keys=true", tokenA, "GET", 400}, {"/api/v1/orders/bad", tokenA, "GET", 400},
		{"/api/v1/orders?page=1&page=2", tokenA, "GET", 400}, {path, tokenA, "POST", 405},
	} {
		code, body, _ := request(test.path, test.token, test.method)
		if code != test.status || strings.Contains(body, item.KeyCode) {
			t.Errorf("%s %s: %d", test.method, test.path, code)
		}
	}
	status, body, _ = request("/api/v1/orders", tokenA, "GET")
	var page OrderPage
	if status != 200 || json.Unmarshal([]byte(body), &page) != nil || strings.Contains(body, "keyCode") || strings.Contains(body, item.KeyCode) {
		t.Fatal("history leaked a key")
	}
	status, body, _ = request(path, tokenA, "HEAD")
	if status != 200 || body != "" {
		t.Fatal("HEAD returned protected body")
	}
	if _, err := pool.Exec(ctx, `UPDATE marketplace.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1::uuid`, f.buyer1); err != nil {
		t.Fatal(err)
	}
	status, body, _ = request(path, tokenA, "GET")
	if status != 401 || strings.Contains(body, item.KeyCode) {
		t.Fatal("expired session received key")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := service.Detail(cancelled, f.buyer1, detail.ID); err == nil {
		t.Fatal("cancelled read succeeded")
	}
	var allocated int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM marketplace.order_items WHERE order_id IN($1::uuid,$2::uuid)`, purchased[0].OrderID, purchased[1].OrderID).Scan(&allocated); err != nil || allocated != 2 {
		t.Fatal("reading changed allocations")
	}
}

func TestOrderUnavailableDatabaseDoesNotDiscloseDetails(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	cleanup()
	service := NewOrderService(quote.repository)
	_, err := service.List(context.Background(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "")
	if err == nil {
		t.Fatal("closed database was accepted")
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := NewOrderHandler(service, nil, logger, false)
	w := httptest.NewRecorder()
	handler.failure(context.Background(), w, database.ErrUnavailable)
	if w.Code != 503 || strings.Contains(w.Body.String(), "postgres") {
		t.Fatal("unavailable response was not sanitized")
	}
}
