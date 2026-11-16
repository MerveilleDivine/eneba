//go:build integration

package purchase

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPurchaseRejectsCompensatingLinePriceChanges(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, true)
	pool := quote.repository.pool
	ctx := context.Background()
	request := PurchaseRequest{Lines: []PurchaseRequestLine{
		{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1},
		{OfferID: f.offer2, Quantity: 1, ExpectedUnitPriceCents: f.price2},
	}}
	_, err := pool.Exec(ctx, "UPDATE marketplace.offers SET price_cents=$2 WHERE id=$1::uuid", f.offer1, f.price1+100)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, "UPDATE marketplace.offers SET price_cents=$2 WHERE id=$1::uuid", f.offer2, f.price2-100)
	if err != nil {
		t.Fatal(err)
	}
	_, err = NewCheckoutService(quote.repository).Purchase(ctx, f.buyer1, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", request)
	if !errors.Is(err, ErrPriceChanged) {
		t.Fatalf("equal-total individual price substitution accepted: %v", err)
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM marketplace.orders WHERE user_id=$1::uuid", f.buyer1).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed price check wrote an order: %d, %v", count, err)
	}
}

func TestOrderKeyConstraintsRejectWrongOfferAndDoubleSale(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, true)
	pool := quote.repository.pool
	ctx := context.Background()
	var keyID string
	if err := pool.QueryRow(ctx, "SELECT id::text FROM marketplace.digital_keys WHERE offer_id=$1::uuid", f.offer1).Scan(&keyID); err != nil {
		t.Fatal(err)
	}
	makeAttempt := func(idempotencyKey, offerID string, expectedCode string) {
		t.Helper()
		tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var orderID string
		err = tx.QueryRow(ctx, "INSERT INTO marketplace.orders(user_id,idempotency_key,request_fingerprint,total_cents) VALUES($1::uuid,$2::uuid,decode(repeat('aa',32),'hex'),1200) RETURNING id::text", f.buyer1, idempotencyKey).Scan(&orderID)
		if err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(ctx, "INSERT INTO marketplace.order_items(order_id,offer_id,digital_key_id,unit_price_cents,product_name_snapshot,seller_name_snapshot) VALUES($1::uuid,$2::uuid,$3::uuid,1200,'Game','Seller')", orderID, offerID, keyID)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != expectedCode {
			t.Fatalf("expected SQLSTATE %s, got %v", expectedCode, err)
		}
	}
	makeAttempt("12345678-1234-4234-8234-123456789001", f.offer2, "23503")
	svc := NewCheckoutService(quote.repository)
	order, err := svc.Purchase(ctx, f.buyer1, "12345678-1234-4234-8234-123456789002", PurchaseRequest{Lines: []PurchaseRequestLine{{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1}}})
	if err != nil || order.OrderID == "" {
		t.Fatalf("valid purchase failed: %+v %v", order, err)
	}
	makeAttempt("12345678-1234-4234-8234-123456789003", f.offer1, "23505")
}
