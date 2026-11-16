//go:build integration

package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestProductHTTP(t *testing.T) {
	pool, counter := catalogTestPool(t)
	server := catalogTestServer(t, pool, io.Discard)
	endpoint := server.URL + "/api/v1/products/"
	read := func(slug string) ProductDetails {
		t.Helper()
		response, body := getResponse(t, server.Client(), endpoint+slug)
		if response.StatusCode != 200 {
			t.Fatalf("product status %d: %s", response.StatusCode, body)
		}
		if response.Header.Get("Cache-Control") != "no-store" || response.Header.Get("X-Request-ID") == "" || response.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("missing response protection")
		}
		var details ProductDetails
		if err := json.Unmarshal(body, &details); err != nil {
			t.Fatal(err)
		}
		var wire map[string]json.RawMessage
		if err := json.Unmarshal(body, &wire); err != nil {
			t.Fatal(err)
		}
		assertPublicFields(t, wire, "currency,offers,product")
		var product map[string]json.RawMessage
		if err := json.Unmarshal(wire["product"], &product); err != nil {
			t.Fatal(err)
		}
		assertPublicFields(t, product, "available,coverUrl,description,edition,id,lowestPriceCents,name,platform,region,slug")
		var offers []map[string]json.RawMessage
		if err := json.Unmarshal(wire["offers"], &offers); err != nil {
			t.Fatal(err)
		}
		for _, offer := range offers {
			assertPublicFields(t, offer, "available,listPriceCents,offerId,priceCents,sellerId,sellerName,sellerRatingPercent")
		}
		if strings.Contains(string(body), "DEMO-NONREDEEMABLE") || strings.Contains(string(body), "digital_key") || strings.Contains(string(body), "password") {
			t.Fatal("private data exposed")
		}
		return details
	}
	t.Run("two reads return SKU and exact seller offers", func(t *testing.T) {
		counter.queries.Store(0)
		d := read("neon-circuit")
		if counter.queries.Load() != 2 || d.Currency != "EUR" || d.Product.Edition != "Deluxe" || d.Product.Platform != "playstation" || d.Product.Region != "united-states" || d.Product.Description == "" || len(d.Offers) != 2 {
			t.Fatalf("incomplete detail: %+v", d)
		}
		if *d.Product.LowestPriceCents != 1410 || d.Offers[0].PriceCents != 1410 || d.Offers[1].PriceCents != 1660 || d.Offers[1].OfferID != "30000000-0000-4000-8000-000000000006" || d.Offers[1].SellerName != "Orbit Games" {
			t.Fatal("deal identity collapsed into cheapest offer")
		}
	})
	t.Run("unavailable cheaper seller never sets From", func(t *testing.T) {
		d := read("deep-signal")
		if *d.Product.LowestPriceCents != 3304 || len(d.Offers) != 2 || !d.Offers[0].Available || d.Offers[1].Available || d.Offers[1].PriceCents != 3054 {
			t.Fatalf("incorrect stock projection: %+v", d)
		}
	})
	t.Run("sold out product keeps comparable unavailable offers", func(t *testing.T) {
		d := read("lunar-legacy")
		if d.Product.Available || d.Product.LowestPriceCents != nil || len(d.Offers) != 2 {
			t.Fatal("sold-out product hidden or priced")
		}
		for _, o := range d.Offers {
			if o.Available {
				t.Fatal("invented stock")
			}
		}
	})
	t.Run("missing inactive invalid and unsupported methods", func(t *testing.T) {
		for _, c := range []struct {
			slug    string
			status  int
			queries int64
		}{{"unknown-game", 404, 1}, {"archived-demo", 404, 1}, {"Bad_slug", 400, 0}, {"solar-drift?offerId=x", 400, 0}, {"solar-drift?price=1", 400, 0}} {
			counter.queries.Store(0)
			r, b := getResponse(t, server.Client(), endpoint+c.slug)
			if r.StatusCode != c.status || counter.queries.Load() != c.queries || strings.Contains(string(b), "SELECT") {
				t.Fatalf("%s: status %d, queries %d", c.slug, r.StatusCode, counter.queries.Load())
			}
		}
		req, _ := http.NewRequest(http.MethodPost, endpoint+"solar-drift", nil)
		r, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != 405 || r.Header.Get("Allow") != "GET, HEAD" {
			t.Fatal("incorrect method handling")
		}
		req, _ = http.NewRequest(http.MethodHead, endpoint+"solar-drift", nil)
		r, err = server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		b, _ := io.ReadAll(r.Body)
		if r.StatusCode != 200 || len(b) != 0 {
			t.Fatal("incorrect HEAD handling")
		}
	})
	t.Run("cancellation releases read resources", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if _, err := NewService(NewRepository(pool)).GetProduct(ctx, "solar-drift"); !errors.Is(err, database.ErrUnavailable) {
			t.Fatal("cancellation did not propagate")
		}
	})
}

func assertPublicFields(t *testing.T, value map[string]json.RawMessage, expected string) {
	t.Helper()
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	if strings.Join(keys, ",") != expected {
		t.Fatalf("unexpected public fields: %v", keys)
	}
}

func TestProductSQLFixtures(t *testing.T) {
	pool, _ := catalogTestPool(t)
	t.Run("only this SKU and active offers, including allocated stock", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		id := insertProduct(t, ctx, tx, "Product read fixture")
		var slug string
		if err := tx.QueryRow(ctx, "SELECT slug FROM marketplace.products WHERE id=$1", id).Scan(&slug); err != nil {
			t.Fatal(err)
		}
		insertOffer(t, ctx, tx, id, 100, false, true)
		sold, key := insertOffer(t, ctx, tx, id, 200, true, true)
		allocateFixtureKey(t, ctx, tx, sold, key)
		available, _ := insertOffer(t, ctx, tx, id, 300, true, true)
		d, err := readProduct(ctx, tx, slug)
		if err != nil {
			t.Fatal(err)
		}
		if err := prepareProductDetails(&d); err != nil {
			t.Fatal(err)
		}
		if len(d.Offers) != 2 || d.Offers[0].OfferID != available || !d.Offers[0].Available || d.Offers[1].OfferID != sold || d.Offers[1].Available || *d.Product.LowestPriceCents != 300 {
			t.Fatal("incorrect offer/stock association")
		}
		if _, err := tx.Exec(ctx, "UPDATE marketplace.offers SET active=false WHERE product_id=$1", id); err != nil {
			t.Fatal(err)
		}
		d, err = readProduct(ctx, tx, slug)
		if err != nil {
			t.Fatal(err)
		}
		if err := prepareProductDetails(&d); err != nil {
			t.Fatal(err)
		}
		if len(d.Offers) != 0 || d.Product.Available {
			t.Fatal("empty offers fabricated")
		}
	})
	t.Run("offer guard fails closed and text reads are bounded", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		id := insertProduct(t, ctx, tx, "Offer guard fixture")
		var slug string
		if err := tx.QueryRow(ctx, "SELECT slug FROM marketplace.products WHERE id=$1", id).Scan(&slug); err != nil {
			t.Fatal(err)
		}
		for range maxProductOffers + 1 {
			insertOffer(t, ctx, tx, id, 100, true, false)
		}
		if _, err := readProduct(ctx, tx, slug); !errors.Is(err, errInvalidProductData) {
			t.Fatal("oversized seller list silently truncated")
		}
		if _, err := tx.Exec(ctx, "UPDATE marketplace.offers SET active=false WHERE product_id=$1", id); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, "UPDATE marketplace.products SET description=repeat('x',10000) WHERE id=$1", id); err != nil {
			t.Fatal(err)
		}
		d, err := readProduct(ctx, tx, slug)
		if err != nil {
			t.Fatal(err)
		}
		if len(d.Product.Description) != 5001 || !errors.Is(prepareProductDetails(&d), errInvalidProductData) {
			t.Fatal("unbounded or accepted oversized source")
		}
	})
}

type productSnapshotTracer struct {
	once   sync.Once
	mutate func()
}

func (s *productSnapshotTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(d.SQL, "SELECT o.id::text") {
		s.once.Do(s.mutate)
	}
	return ctx
}
func (*productSnapshotTracer) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func TestProductReadSnapshot(t *testing.T) {
	writer, _ := catalogTestPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	const offer = "30000000-0000-4000-8000-000000000001"
	var original int64
	if err := writer.QueryRow(ctx, "SELECT price_cents FROM marketplace.offers WHERE id=$1", offer).Scan(&original); err != nil {
		t.Fatal(err)
	}
	app, _ := catalogTestURLs(t)
	cfg, err := pgxpool.ParseConfig(app)
	if err != nil {
		t.Fatal("invalid snapshot config")
	}
	mutation := make(chan error, 1)
	cfg.ConnConfig.Tracer = &productSnapshotTracer{mutate: func() {
		_, err := writer.Exec(ctx, "UPDATE marketplace.offers SET price_cents=$2, list_price_cents=NULL WHERE id=$1", offer, original+1000)
		mutation <- err
	}}
	// Preserve the nullable list price separately; updates above must not assume
	// this fixture will always lack a discount.
	var listPrice *int64
	if err := writer.QueryRow(ctx, "SELECT list_price_cents FROM marketplace.offers WHERE id=$1", offer).Scan(&listPrice); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		c, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		if _, err := writer.Exec(c, "UPDATE marketplace.offers SET price_cents=$2,list_price_cents=$3 WHERE id=$1", offer, original, listPrice); err != nil {
			t.Errorf("restore snapshot prices: %v", err)
		}
	})
	reader, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal("snapshot pool failed")
	}
	defer reader.Close()
	s := NewService(NewRepository(reader))
	d, err := s.GetProduct(ctx, "solar-drift")
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-mutation:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("snapshot test did not interleave the second read")
	}
	if *d.Product.LowestPriceCents != original || d.Offers[0].PriceCents != original {
		t.Fatal("read mixed snapshots")
	}
	next, err := s.GetProduct(ctx, "solar-drift")
	if err != nil {
		t.Fatal(err)
	}
	if *next.Product.LowestPriceCents == original {
		t.Fatal("new request retained stale snapshot")
	}
}

func TestProductFailureResponses(t *testing.T) {
	app, _ := catalogTestURLs(t)
	for _, mode := range []string{"unavailable", "unexpected", "deadline"} {
		t.Run(mode, func(t *testing.T) {
			cfg, err := pgxpool.ParseConfig(app)
			if err != nil {
				t.Fatal("invalid failure config")
			}
			cfg.MaxConns = 1
			cfg.ConnConfig.ConnectTimeout = time.Second
			status := 503
			if mode == "unavailable" {
				cfg.ConnConfig.Host = "127.0.0.1"
				cfg.ConnConfig.Port = 1
				cfg.ConnConfig.Fallbacks = nil
			}
			if mode == "unexpected" {
				status = 500
				cfg.AfterConnect = func(context.Context, *pgx.Conn) error { return errors.New("private SQL and credentials") }
			}
			pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil {
				t.Fatal("failure pool failed")
			}
			defer pool.Close()
			if mode == "deadline" {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				held, err := pool.Acquire(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer held.Release()
			}
			var logs synchronizedLog
			server := catalogTestServer(t, pool, &logs)
			started := time.Now()
			r, b := getResponse(t, server.Client(), server.URL+"/api/v1/products/solar-drift")
			if r.StatusCode != status || strings.Contains(string(b)+logs.String(), "private") || strings.Contains(string(b), "postgres://") {
				t.Fatal("unsafe or incorrect failure response")
			}
			if mode == "deadline" && (time.Since(started) < 2500*time.Millisecond || time.Since(started) > 8*time.Second) {
				t.Fatal("incorrect request deadline")
			}
		})
	}
}
