//go:build integration

package purchase

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

type purchaseFixture struct {
	buyer1, buyer2, offer1, offer2 string
	price1, price2                 int64
}

func setupPurchaseFixture(t *testing.T, svc *Service, secondKey bool) purchaseFixture {
	t.Helper()
	ctx := context.Background()
	pool := svc.repository.pool
	tag := fmt.Sprintf("s6b-%d", time.Now().UnixNano())
	var p purchaseFixture
	for i, slot := range []*string{&p.buyer1, &p.buyer2} {
		err := pool.QueryRow(ctx, `INSERT INTO marketplace.users(email,display_name,password_hash)
   VALUES($1,'Checkout fixture','unused') RETURNING id::text`, fmt.Sprintf("%s-%d@example.test", tag, i)).Scan(slot)
		if err != nil {
			t.Fatal(err)
		}
	}
	var seller, product string
	if err := pool.QueryRow(ctx, `INSERT INTO marketplace.sellers(name,rating_percent) VALUES($1,98) RETURNING id::text`, tag).Scan(&seller); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO marketplace.products(slug,name,edition,platform,region,cover_url)
  VALUES($1,'Checkout fixture game','Standard','steam','global','/images/covers/solar-drift.webp')
  RETURNING id::text`, tag).Scan(&product); err != nil {
		t.Fatal(err)
	}
	p.price1, p.price2 = 1200, 1800
	for i, ptr := range []*string{&p.offer1, &p.offer2} {
		price := p.price1
		if i == 1 {
			price = p.price2
		}
		var sellerForOffer string
		sellerForOffer = seller
		if i == 1 {
			// A second seller is required by the unique SKU/seller constraint.
			if err := pool.QueryRow(ctx, `INSERT INTO marketplace.sellers(name,rating_percent) VALUES($1,96) RETURNING id::text`, tag+"-seller2").Scan(&sellerForOffer); err != nil {
				t.Fatal(err)
			}
		}
		if err := pool.QueryRow(ctx, `INSERT INTO marketplace.offers(product_id,seller_id,price_cents) VALUES($1,$2,$3) RETURNING id::text`, product, sellerForOffer, price).Scan(ptr); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO marketplace.digital_keys(offer_id,demo_code) VALUES($1,$2)`, p.offer1, tag+"-fixture-key1"); err != nil {
		t.Fatal(err)
	}
	if secondKey {
		if _, err := pool.Exec(ctx, `INSERT INTO marketplace.digital_keys(offer_id,demo_code) VALUES($1,$2)`, p.offer2, tag+"-fixture-key2"); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		tx, err := pool.Begin(cleanCtx)
		if err != nil {
			t.Errorf("cleanup transaction: %v", err)
			return
		}
		defer tx.Rollback(cleanCtx)
		for _, sql := range []string{
			`DELETE FROM marketplace.order_items WHERE order_id IN(SELECT id FROM marketplace.orders WHERE user_id IN ($1::uuid,$2::uuid))`,
			`DELETE FROM marketplace.orders WHERE user_id IN ($1::uuid,$2::uuid)`,
			`DELETE FROM marketplace.sessions WHERE user_id IN ($1::uuid,$2::uuid)`,
			`DELETE FROM marketplace.users WHERE id IN ($1::uuid,$2::uuid)`,
		} {
			if _, err := tx.Exec(cleanCtx, sql, p.buyer1, p.buyer2); err != nil {
				t.Errorf("cleanup: %v", err)
				return
			}
		}
		if _, err := tx.Exec(cleanCtx, `DELETE FROM marketplace.digital_keys WHERE offer_id IN ($1::uuid,$2::uuid)`, p.offer1, p.offer2); err != nil {
			t.Error(err)
			return
		}
		if _, err := tx.Exec(cleanCtx, `DELETE FROM marketplace.offers WHERE id IN ($1::uuid,$2::uuid)`, p.offer1, p.offer2); err != nil {
			t.Error(err)
			return
		}
		if _, err := tx.Exec(cleanCtx, `DELETE FROM marketplace.products WHERE id=$1`, product); err != nil {
			t.Error(err)
			return
		}
		if _, err := tx.Exec(cleanCtx, `DELETE FROM marketplace.sellers WHERE name LIKE $1`, tag+"%"); err != nil {
			t.Error(err)
			return
		}
		if err := tx.Commit(cleanCtx); err != nil {
			t.Error(err)
		}
	})
	return p
}

func TestPurchaseConcurrentLastKey(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, false)
	svc := NewCheckoutService(quote.repository)
	line := PurchaseRequestLine{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1}
	buyers := []string{f.buyer1, f.buyer2}
	var wg sync.WaitGroup
	results := make([]PurchaseResult, 2)
	errs := make([]error, 2)
	start := make(chan struct{})
	for i := range buyers {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = svc.Purchase(context.Background(), buyers[i], fmt.Sprintf("11111111-2222-4333-8444-00000000000%d", i), PurchaseRequest{Lines: []PurchaseRequestLine{line}})
		}(i)
	}
	close(start)
	wg.Wait()
	successes, stock := 0, 0
	for i := range errs {
		if errs[i] == nil {
			successes++
			if results[i].TotalCents != f.price1 {
				t.Errorf("wrong total: %+v", results[i])
			}
		}
		if errors.Is(errs[i], ErrOutOfStock) {
			stock++
		}
		if errs[i] != nil && !errors.Is(errs[i], ErrOutOfStock) {
			t.Errorf("unexpected error: %v", errs[i])
		}
	}
	if successes != 1 || stock != 1 {
		t.Fatalf("last-key contention: success=%d soldout=%d", successes, stock)
	}
	var n int
	if err := quote.repository.pool.QueryRow(context.Background(), `SELECT count(*) FROM marketplace.order_items WHERE offer_id=$1::uuid`, f.offer1).Scan(&n); err != nil || n != 1 {
		t.Fatalf("key sold %d times: %v", n, err)
	}
}

func TestPurchaseIdempotencyAndPriceRevalidation(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, true)
	svc := NewCheckoutService(quote.repository)
	key := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	request := PurchaseRequest{Lines: []PurchaseRequestLine{{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1}}}
	var wg sync.WaitGroup
	results := make([]PurchaseResult, 2)
	errs := make([]error, 2)
	start := make(chan struct{})
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = svc.Purchase(context.Background(), f.buyer1, key, request)
		}(i)
	}
	close(start)
	wg.Wait()
	if errs[0] != nil || errs[1] != nil || results[0].OrderID != results[1].OrderID || results[0].OrderID == "" {
		t.Fatalf("idempotent concurrent replay: %+v %+v %v %v", results[0], results[1], errs[0], errs[1])
	}
	if _, err := svc.Purchase(context.Background(), f.buyer1, key, PurchaseRequest{Lines: []PurchaseRequestLine{{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1 + 1}}}); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed payload accepted: %v", err)
	}
	if _, err := quote.repository.pool.Exec(context.Background(), `UPDATE marketplace.offers SET price_cents=$2 WHERE id=$1::uuid`, f.offer1, f.price1+100); err != nil {
		t.Fatal(err)
	}
	again, err := svc.Purchase(context.Background(), f.buyer1, key, request)
	if err != nil || again.OrderID != results[0].OrderID {
		t.Fatalf("committed retry failed after price change: %+v %v", again, err)
	}
	if _, err := svc.Purchase(context.Background(), f.buyer2, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", request); !errors.Is(err, ErrPriceChanged) {
		t.Fatalf("stale line price should fail: %v", err)
	}
	var stored int64
	if err := quote.repository.pool.QueryRow(context.Background(), `SELECT total_cents FROM marketplace.orders WHERE id=$1::uuid`, results[0].OrderID).Scan(&stored); err != nil || stored != f.price1 {
		t.Fatalf("order total should preserve original price: %d %v", stored, err)
	}
}

func TestPurchaseAtomicRollbackForMissingSecondKey(t *testing.T) {
	quote, cleanup := quoteTestDatabase(t)
	t.Cleanup(cleanup)
	f := setupPurchaseFixture(t, quote, false)
	svc := NewCheckoutService(quote.repository)
	req := PurchaseRequest{Lines: []PurchaseRequestLine{
		{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1},
		{OfferID: f.offer2, Quantity: 1, ExpectedUnitPriceCents: f.price2},
	}}
	_, err := svc.Purchase(context.Background(), f.buyer1, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", req)
	if !errors.Is(err, ErrOutOfStock) {
		t.Fatalf("partial cart should fail: %v", err)
	}
	var n int
	if err := quote.repository.pool.QueryRow(context.Background(), `SELECT count(*) FROM marketplace.orders WHERE user_id=$1::uuid`, f.buyer1).Scan(&n); err != nil || n != 0 {
		t.Fatalf("partial checkout committed order: %d %v", n, err)
	}
	valid := PurchaseRequest{Lines: []PurchaseRequestLine{{OfferID: f.offer1, Quantity: 1, ExpectedUnitPriceCents: f.price1}}}
	if _, err := svc.Purchase(context.Background(), f.buyer2, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", valid); err != nil {
		t.Fatalf("rollback did not release first key: %v", err)
	}
}
