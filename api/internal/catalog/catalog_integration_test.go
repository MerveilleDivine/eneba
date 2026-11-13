//go:build integration

package catalog

import (
	"bytes"
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
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCatalogHTTP(t *testing.T) {
	pool, counter := catalogTestPool(t)
	server := catalogTestServer(t, pool, io.Discard)
	endpoint := server.URL + "/api/v1/products"
	client := server.Client()
	client.Timeout = 10 * time.Second

	t.Run("active catalog projection and bounded data queries", func(t *testing.T) {
		counter.queries.Store(0)
		response, body := getResponse(t, client, endpoint)
		page := decodePage(t, response, body)
		if page.Page != 1 || page.PageSize != 24 || page.Total != 16 || page.Currency != "EUR" || len(page.Items) != 16 {
			t.Fatalf("incorrect metadata: %+v", page)
		}
		if page.Items[0].Name != "Beyond the Vale" || page.Items[15].Name != "Wild Frontier" {
			t.Fatal("default name order is incorrect")
		}
		if counter.queries.Load() != 2 {
			t.Fatalf("expected two data queries, got %d", counter.queries.Load())
		}
		if response.Header.Get("X-Request-ID") == "" || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("missing HTTP metadata")
		}
		for _, product := range page.Items {
			if product.Name == "Archived Demo" {
				t.Fatal("inactive SKU exposed")
			}
			if product.ID == "" || product.Slug == "" || product.Edition == "" || product.Platform == "" || product.Region == "" || product.CoverURL == "" {
				t.Fatal("incomplete product projection")
			}
			if product.Name == "Lunar Legacy" && (product.Available || product.LowestPriceCents != nil) {
				t.Fatal("sold-out SKU has an available price")
			}
			if product.Name == "Deep Signal" && (!product.Available || product.LowestPriceCents == nil || *product.LowestPriceCents != 3304) {
				t.Fatal("unavailable cheaper offer was used")
			}
		}
		var wire struct {
			Items []map[string]json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(body, &wire); err != nil {
			t.Fatal(err)
		}
		expected := []string{"available", "coverUrl", "edition", "id", "lowestPriceCents", "name", "platform", "region", "slug"}
		for _, item := range wire.Items {
			keys := make([]string, 0, len(item))
			for key := range item {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			if strings.Join(keys, ",") != strings.Join(expected, ",") {
				t.Fatal("unexpected public product fields")
			}
		}
		if strings.Contains(string(body), "DEMO-NONREDEEMABLE") || strings.Contains(string(body), "digital_key") {
			t.Fatal("inventory details exposed")
		}
	})

	t.Run("filters and price order happen before pagination", func(t *testing.T) {
		for _, tt := range []struct {
			query, first string
			total        int64
		}{
			{"sort=price_desc&pageSize=1", "Deep Signal", 16},
			{"sort=price_desc&pageSize=1&page=2", "Emberlight", 16},
			{"sort=price_asc&pageSize=1", "Solar Drift", 16},
			{"sort=price_asc&pageSize=1&page=2", "The Last Outpost", 16},
			{"sort=price_asc&pageSize=1&page=16", "Lunar Legacy", 16},
			{"sort=price_desc&pageSize=1&page=16", "Lunar Legacy", 16},
			{"platform=steam&region=global&minPriceCents=1136&maxPriceCents=1136", "Solar Drift", 1},
			{"q=lunra", "Lunar Legacy", 1},
		} {
			response, body := getResponse(t, client, endpoint+"?"+tt.query)
			page := decodePage(t, response, body)
			if page.Total != tt.total || len(page.Items) == 0 || page.Items[0].Name != tt.first {
				t.Fatalf("unexpected result for %s: %+v", tt.query, page)
			}
		}
		response, body := getResponse(t, client, endpoint+"?minPriceCents=0")
		page := decodePage(t, response, body)
		if page.Total != 15 {
			t.Fatal("price bounds must exclude unpriced SKUs")
		}
		for _, query := range []string{"page=999", "q=zzzzzz", "platform=other", "q=%25", "q=_", "q=%5C"} {
			response, body := getResponse(t, client, endpoint+"?"+query)
			page := decodePage(t, response, body)
			if page.Items == nil || len(page.Items) != 0 {
				t.Fatalf("expected JSON empty array for %s", query)
			}
			if query == "page=999" && page.Total != 16 {
				t.Fatal("out-of-range page lost its total")
			}
		}
		counter.queries.Store(0)
		response, body = getResponse(t, client, endpoint+"?pageSize=1")
		decodePage(t, response, body)
		if counter.queries.Load() != 2 {
			t.Fatal("query budget must not depend on result size")
		}
	})

	t.Run("exact partial short and typo searches", func(t *testing.T) {
		for _, tt := range []struct{ query, first string }{
			{"  SOLAR DRIFT  ", "Solar Drift"}, {"solar", "Solar Drift"}, {"drift", "Solar Drift"},
			{"so", "Solar Drift"}, {"ir", "Ironbound"}, {"solr", "Solar Drift"}, {"circut", "Neon Circuit"},
		} {
			response, body := getResponse(t, client, endpoint+"?q="+url.QueryEscape(tt.query))
			page := decodePage(t, response, body)
			if len(page.Items) == 0 || page.Items[0].Name != tt.first {
				t.Fatalf("incorrect search for %q: %+v", tt.query, page)
			}
		}
		for _, query := range []string{"z", "zz"} {
			response, body := getResponse(t, client, endpoint+"?q="+query)
			if page := decodePage(t, response, body); page.Total != 0 {
				t.Fatal("short queries must not use fuzzy matching")
			}
		}
		response, body := getResponse(t, client, endpoint+"?q="+url.QueryEscape("'; DROP TABLE marketplace.products; --"))
		decodePage(t, response, body)
		response, body = getResponse(t, client, endpoint)
		if decodePage(t, response, body).Total != 16 {
			t.Fatal("query text affected stored data")
		}
	})

	t.Run("invalid requests do not reach PostgreSQL", func(t *testing.T) {
		for _, query := range []string{"unknown=1", "q=solar&q=drift", "page=0", "pageSize=51", "minPriceCents=-1", "sort=DROP", "page=9223372036854775807", "minPriceCents=20&maxPriceCents=10"} {
			counter.queries.Store(0)
			response, body := getResponse(t, client, endpoint+"?"+query)
			if response.StatusCode != 400 || !strings.Contains(string(body), `"code":"invalid_query"`) || counter.queries.Load() != 0 {
				t.Fatalf("invalid request handling failed for %s", query)
			}
		}
	})

	t.Run("method handling", func(t *testing.T) {
		request, err := http.NewRequest(http.MethodHead, endpoint, nil)
		if err != nil {
			t.Fatal(err)
		}
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode != 200 || len(body) != 0 {
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
	})

	t.Run("deadline cancels a blocked query and releases the pool", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		owner, err := pgx.Connect(ctx, os.Getenv("TEST_MIGRATION_DATABASE_URL"))
		if err != nil {
			t.Fatal("cannot connect test owner")
		}
		defer owner.Close(context.Background())
		lock, err := owner.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer lock.Rollback(context.Background())
		if _, err := lock.Exec(ctx, "LOCK TABLE marketplace.products IN ACCESS EXCLUSIVE MODE"); err != nil {
			t.Fatal(err)
		}
		started := time.Now()
		response, body := getResponse(t, client, endpoint)
		if response.StatusCode != 503 || !strings.Contains(string(body), `"code":"service_unavailable"`) {
			t.Fatal("blocked query must time out generically")
		}
		if elapsed := time.Since(started); elapsed < 2500*time.Millisecond || elapsed > 8*time.Second {
			t.Fatalf("unexpected request budget: %v", elapsed)
		}
		if err := lock.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		response, body = getResponse(t, client, endpoint)
		decodePage(t, response, body)
		if pool.Stat().AcquiredConns() != 0 {
			t.Fatal("request retained a database connection")
		}
		cancelled, stop := context.WithCancel(context.Background())
		stop()
		if _, err := NewService(NewRepository(pool)).List(cancelled, Filter{Page: 1, PageSize: 24}); !errors.Is(err, database.ErrUnavailable) {
			t.Fatal("cancellation did not propagate")
		}
	})
}

func TestCatalogSQLFixtures(t *testing.T) {
	pool, _ := catalogTestPool(t)
	t.Run("wildcards are literal", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		for _, name := range []string{"Percent % fixture", "Underscore _ fixture", "Backslash \\ fixture", "Quote ' fixture"} {
			insertProduct(t, ctx, tx, name)
		}
		for _, tt := range []struct{ query, name string }{{"%", "Percent % fixture"}, {"_", "Underscore _ fixture"}, {"\\", "Backslash \\ fixture"}, {"'", "Quote ' fixture"}} {
			page := fixturePage(t, ctx, tx, Filter{Query: tt.query, Page: 1, PageSize: 50})
			if page.Total != 1 || page.Items[0].Name != tt.name {
				t.Fatalf("literal search failed for %q", tt.query)
			}
		}
	})
	t.Run("relevance classes and stable UUID ties", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		exactA := insertProduct(t, ctx, tx, "Signal")
		exactB := insertProduct(t, ctx, tx, "SIGNAL")
		if _, err := tx.Exec(ctx, "UPDATE marketplace.products SET edition='Deluxe' WHERE id=$1", exactB); err != nil {
			t.Fatal(err)
		}
		prefix := insertProduct(t, ctx, tx, "Signal expansion")
		substring := insertProduct(t, ctx, tx, "The signal")
		typo := insertProduct(t, ctx, tx, "Signla")
		page := fixturePage(t, ctx, tx, Filter{Query: "signal", Page: 1, PageSize: 50})
		positions := map[string]int{}
		for index, item := range page.Items {
			positions[item.ID] = index
		}
		for _, id := range []string{exactA, exactB, prefix, substring, typo} {
			if _, found := positions[id]; !found {
				t.Fatal("rank fixture missing from results")
			}
		}
		if positions[exactA] > positions[prefix] || positions[exactB] > positions[prefix] || positions[prefix] > positions[substring] || positions[substring] > positions[typo] {
			t.Fatal("relevance classes are incorrect")
		}
		ids := []string{exactA, exactB}
		sort.Strings(ids)
		if page.Items[0].ID != ids[0] || page.Items[1].ID != ids[1] {
			t.Fatal("normalized-name ties must use UUID order")
		}
		explicit := fixturePage(t, ctx, tx, Filter{Query: "signal", Sort: "price_asc", Page: 1, PageSize: 50})
		if explicit.Items[0].Name != "Deep Signal" {
			t.Fatal("explicit price sorting did not override relevance")
		}
	})
	t.Run("only active unallocated offer inventory determines price", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		product := insertProduct(t, ctx, tx, "zxqv inventory fixture")
		insertOffer(t, ctx, tx, product, 1000, true, false)
		insertOffer(t, ctx, tx, product, 500, false, true)
		allocatedOffer, allocatedKey := insertOffer(t, ctx, tx, product, 1500, true, true)
		allocateFixtureKey(t, ctx, tx, allocatedOffer, allocatedKey)
		insertOffer(t, ctx, tx, product, 2000, true, true)
		page := fixturePage(t, ctx, tx, Filter{Query: "zxqv", Page: 1, PageSize: 24})
		if page.Total != 1 || page.Items[0].LowestPriceCents == nil || *page.Items[0].LowestPriceCents != 2000 {
			t.Fatal("incorrect available offer price")
		}
		if _, err := tx.Exec(ctx, "UPDATE marketplace.products SET active=false WHERE id=$1", product); err != nil {
			t.Fatal(err)
		}
		if fixturePage(t, ctx, tx, Filter{Query: "zxqv", Page: 1, PageSize: 24}).Total != 0 {
			t.Fatal("inactive product exposed")
		}
	})
	t.Run("unsafe stored cents cannot be projected", func(t *testing.T) {
		ctx, tx := catalogTestTx(t, pool)
		product := insertProduct(t, ctx, tx, "zxqv unsafe price fixture")
		insertOffer(t, ctx, tx, product, maxSafeInteger+1, true, true)
		page := fixturePage(t, ctx, tx, Filter{Query: "zxqv", Page: 1, PageSize: 24})
		if !errors.Is(prepareProducts(page.Items), errInvalidPrice) {
			t.Fatal("unsafe database price accepted")
		}
	})
}

func TestCatalogFailureResponses(t *testing.T) {
	app, _ := catalogTestURLs(t)
	for _, phase := range []string{"unavailable", "unexpected"} {
		t.Run(phase, func(t *testing.T) {
			cfg, err := pgxpool.ParseConfig(app)
			if err != nil {
				t.Fatal("invalid test configuration")
			}
			cfg.ConnConfig.ConnectTimeout = time.Second
			want, code := 503, "service_unavailable"
			if phase == "unavailable" {
				cfg.ConnConfig.Host = "127.0.0.1"
				cfg.ConnConfig.Port = 1
				cfg.ConnConfig.Fallbacks = nil
			} else {
				want, code = 500, "internal_error"
				cfg.AfterConnect = func(context.Context, *pgx.Conn) error { return errors.New("private SQL and password details") }
			}
			pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil {
				t.Fatal("cannot create failure pool")
			}
			t.Cleanup(pool.Close)
			var logs synchronizedLog
			server := catalogTestServer(t, pool, &logs)
			response, body := getResponse(t, server.Client(), server.URL+"/api/v1/products")
			if response.StatusCode != want || !strings.Contains(string(body), `"code":"`+code+`"`) {
				t.Fatalf("unexpected failure response: %d %s", response.StatusCode, body)
			}
			if strings.Contains(string(body)+logs.String(), "private") || strings.Contains(string(body), "postgres://") {
				t.Fatal("storage details leaked")
			}
		})
	}
}

type queryCounter struct{ queries atomic.Int64 }

func (c *queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	query := strings.ToUpper(strings.TrimSpace(data.SQL))
	if strings.HasPrefix(query, "SELECT") || strings.HasPrefix(query, "WITH") {
		c.queries.Add(1)
	}
	return ctx
}
func (*queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func catalogTestPool(t *testing.T) (*pgxpool.Pool, *queryCounter) {
	t.Helper()
	app, owner := catalogTestURLs(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := filepath.Join("..", "..", "..")
	if _, err := maintenance.Migrate(ctx, owner, app, filepath.Join(root, "db", "migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := maintenance.SeedDatabase(ctx, app, filepath.Join(root, "db", "seeds")); err != nil {
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(app)
	if err != nil {
		t.Fatal("invalid test pool configuration")
	}
	counter := &queryCounter{}
	cfg.ConnConfig.Tracer = counter
	cfg.MaxConns = 4
	cfg.ConnConfig.ConnectTimeout = time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal("cannot initialize catalog test pool")
	}
	t.Cleanup(pool.Close)
	return pool, counter
}

func catalogTestURLs(t *testing.T) (string, string) {
	t.Helper()
	app, owner := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, value := range []string{app, owner} {
		parsed, err := url.Parse(value)
		if err != nil || parsed.Path != "/eneba_test" || parsed.Hostname() == "" {
			t.Fatal("catalog integration requires explicit eneba_test URLs")
		}
	}
	return app, owner
}

func catalogTestServer(t *testing.T, pool *pgxpool.Pool, logs io.Writer) *httptest.Server {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(logs, nil))
	mux := http.NewServeMux()
	NewHandler(NewService(NewRepository(pool)), logger).RegisterRoutes(mux)
	mux.HandleFunc("/", httpapi.NotFound)
	server := httptest.NewServer(httpapi.Wrap(mux, logger))
	t.Cleanup(server.Close)
	return server
}

func getResponse(t *testing.T, client *http.Client, endpoint string) (*http.Response, []byte) {
	t.Helper()
	response, err := client.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	return response, body
}
func decodePage(t *testing.T, response *http.Response, body []byte) Page {
	t.Helper()
	if response.StatusCode != 200 {
		t.Fatalf("catalog returned %d: %s", response.StatusCode, body)
	}
	var page Page
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatal(err)
	}
	return page
}
func catalogTestTx(t *testing.T, pool *pgxpool.Pool) (context.Context, pgx.Tx) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return ctx, tx
}
func fixturePage(t *testing.T, ctx context.Context, tx pgx.Tx, filter Filter) Page {
	t.Helper()
	filter, err := normalizeFilter(filter)
	if err != nil {
		t.Fatal(err)
	}
	page, err := readPage(ctx, tx, filter)
	if err != nil {
		t.Fatal(err)
	}
	return page
}
func insertProduct(t *testing.T, ctx context.Context, tx pgx.Tx, name string) string {
	t.Helper()
	var id string
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.products(slug,name,platform,region,cover_url) VALUES ('integration-'||gen_random_uuid()::text,$1,'steam','global','/images/demo-cover.svg') RETURNING id::text", name).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
func insertOffer(t *testing.T, ctx context.Context, tx pgx.Tx, product string, price int64, active, stocked bool) (string, string) {
	t.Helper()
	var seller, offer, key string
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.sellers(name,rating_percent) VALUES ('Integration seller '||gen_random_uuid()::text,98) RETURNING id::text").Scan(&seller); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.offers(product_id,seller_id,price_cents,active) VALUES ($1,$2,$3,$4) RETURNING id::text", product, seller, price, active).Scan(&offer); err != nil {
		t.Fatal(err)
	}
	if stocked {
		if err := tx.QueryRow(ctx, "INSERT INTO marketplace.digital_keys(offer_id,demo_code) VALUES ($1,'DEMO-NONREDEEMABLE-TEST-'||gen_random_uuid()::text) RETURNING id::text", offer).Scan(&key); err != nil {
			t.Fatal(err)
		}
	}
	return offer, key
}
func allocateFixtureKey(t *testing.T, ctx context.Context, tx pgx.Tx, offer, key string) {
	t.Helper()
	var buyer, order string
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.users(email,display_name,password_hash) VALUES (gen_random_uuid()::text||'@example.test','Catalog test buyer','test-only-hash') RETURNING id::text").Scan(&buyer); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.orders(user_id,idempotency_key,request_fingerprint,total_cents) VALUES ($1,gen_random_uuid(),decode(repeat('00',32),'hex'),1500) RETURNING id::text", buyer).Scan(&order); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO marketplace.order_items(order_id,offer_id,digital_key_id,unit_price_cents,product_name_snapshot,seller_name_snapshot) VALUES ($1,$2,$3,1500,'Catalog fixture','Catalog seller')", order, offer, key); err != nil {
		t.Fatal(err)
	}
}

type synchronizedLog struct {
	mu   sync.Mutex
	data bytes.Buffer
}

func (l *synchronizedLog) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.data.Write(data)
}
func (l *synchronizedLog) String() string { l.mu.Lock(); defer l.mu.Unlock(); return l.data.String() }
