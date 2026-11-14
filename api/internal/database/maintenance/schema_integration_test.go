//go:build integration

package maintenance

import (
	"context"
	"crypto/sha256"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestFoundationDatabase(t *testing.T) {
	appURL, migrationURL := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, value := range []string{appURL, migrationURL} {
		parsed, err := url.Parse(value)
		if err != nil || parsed.Path != "/eneba_test" || parsed.Hostname() == "" {
			t.Fatal("integration checks require explicit connection URLs for eneba_test")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	root := filepath.Join("..", "..", "..", "..")
	migrations, seeds := filepath.Join(root, "db", "migrations"), filepath.Join(root, "db", "seeds")
	if _, err := Migrate(ctx, migrationURL, appURL, migrations); err != nil {
		t.Fatalf("initial migration: %v", err)
	}
	if count, err := Migrate(ctx, migrationURL, appURL, migrations); err != nil || count != 0 {
		t.Fatalf("repeated migration count=%d err=%v", count, err)
	}
	if _, err := SeedDatabase(ctx, appURL, seeds); err != nil {
		t.Fatalf("initial seed: %v", err)
	}
	if count, err := SeedDatabase(ctx, appURL, seeds); err != nil || count != 0 {
		t.Fatalf("repeated seed count=%d err=%v", count, err)
	}
	conn, err := pgx.Connect(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)

	t.Run("application credentials are checked before migration discovery", func(t *testing.T) {
		broken, err := url.Parse(appURL)
		if err != nil {
			t.Fatal("invalid test connection")
		}
		broken.User = url.UserPassword(broken.User.Username(), "intentionally-invalid")
		_, err = Migrate(ctx, migrationURL, broken.String(), filepath.Join(t.TempDir(), "missing-migrations"))
		if err == nil || !strings.Contains(err.Error(), "application credentials") {
			t.Fatalf("authentication must fail before inspecting migrations: %v", err)
		}
	})

	t.Run("seeded data is read from PostgreSQL", func(t *testing.T) {
		var products, keys, sellers int
		err := conn.QueryRow(ctx, "SELECT (SELECT count(*) FROM marketplace.products WHERE active), (SELECT count(*) FROM marketplace.digital_keys), (SELECT count(*) FROM marketplace.sellers)").Scan(&products, &keys, &sellers)
		if err != nil || products != 16 || keys != 58 || sellers != 3 {
			t.Fatalf("unexpected fixture products=%d keys=%d sellers=%d err=%v", products, keys, sellers, err)
		}
	})

	t.Run("wrong offer is rejected by composite foreign key", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		order, key, _, otherOffer := purchaseFixture(t, ctx, tx)
		_, err := tx.Exec(ctx, itemSQL, order, otherOffer, key)
		requirePostgresError(t, err, "23503", "ordered_key_matches_offer")
	})

	t.Run("new artwork seed preserves purchases and customized covers", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		order, key, offer, _ := purchaseFixture(t, ctx, tx)
		if _, err := tx.Exec(ctx, itemSQL, order, offer, key); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM marketplace.seed_versions WHERE version='002_catalog_artwork.sql';
		  UPDATE marketplace.products SET cover_url='/images/demo-cover.svg' WHERE slug='solar-drift';
		  UPDATE marketplace.products SET cover_url='/images/custom.webp' WHERE slug='ironbound'`); err != nil {
			t.Fatal(err)
		}
		if count, err := Seed(ctx, tx, seeds); err != nil || count != 1 {
			t.Fatalf("new artwork seed count=%d err=%v", count, err)
		}
		var allocated bool
		var cover, customized string
		var keys int
		err := tx.QueryRow(ctx, `SELECT
		  EXISTS(SELECT 1 FROM marketplace.order_items WHERE digital_key_id=$1),
		  (SELECT cover_url FROM marketplace.products WHERE slug='solar-drift'),
		  (SELECT cover_url FROM marketplace.products WHERE slug='ironbound'),
		  (SELECT count(*) FROM marketplace.digital_keys)`, key).Scan(&allocated, &cover, &customized, &keys)
		if err != nil || !allocated || cover != "/images/covers/solar-drift.webp" || customized != "/images/custom.webp" || keys != 58 {
			t.Fatalf("artwork must preserve allocation, customized covers and stock: allocated=%v cover=%q customized=%q keys=%d err=%v", allocated, cover, customized, keys, err)
		}
	})

	t.Run("a key cannot be allocated to two orders", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		order, key, offer, _ := purchaseFixture(t, ctx, tx)
		if _, err := tx.Exec(ctx, itemSQL, order, offer, key); err != nil {
			t.Fatal(err)
		}
		secondOrder := insertOrder(t, ctx, tx)
		_, err := tx.Exec(ctx, itemSQL, secondOrder, offer, key)
		requirePostgresError(t, err, "23505", "order_items_digital_key_id_key")
	})

	t.Run("seed rerun preserves allocated inventory", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		order, key, offer, _ := purchaseFixture(t, ctx, tx)
		if _, err := tx.Exec(ctx, itemSQL, order, offer, key); err != nil {
			t.Fatal(err)
		}
		if count, err := Seed(ctx, tx, seeds); err != nil || count != 0 {
			t.Fatalf("seed rerun count=%d err=%v", count, err)
		}
		var allocated bool
		err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM marketplace.order_items WHERE digital_key_id=$1)", key).Scan(&allocated)
		if err != nil || !allocated {
			t.Fatalf("allocation changed: %v", err)
		}
		var deletedKey string
		if err := tx.QueryRow(ctx, "DELETE FROM marketplace.digital_keys WHERE id=(SELECT id FROM marketplace.digital_keys WHERE id<>$1 ORDER BY id LIMIT 1) RETURNING id::text", key).Scan(&deletedKey); err != nil {
			t.Fatal(err)
		}
		if _, err := Seed(ctx, tx, seeds); err != nil {
			t.Fatal(err)
		}
		var recreated bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM marketplace.digital_keys WHERE id=$1)", deletedKey).Scan(&recreated); err != nil || recreated {
			t.Fatalf("seed replenished removed inventory: %v", err)
		}
	})

	t.Run("applied seed edits are rejected", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		source, err := os.ReadFile(filepath.Join(seeds, "001_demo.sql"))
		if err != nil {
			t.Fatal(err)
		}
		directory := t.TempDir()
		if err := os.WriteFile(filepath.Join(directory, "001_demo.sql"), append(source, []byte("\n-- modified\n")...), 0600); err != nil {
			t.Fatal(err)
		}
		_, err = Seed(ctx, tx, directory)
		if err == nil || !strings.Contains(err.Error(), "changed after application") {
			t.Fatalf("expected immutable seed error, got %v", err)
		}
	})

	t.Run("runtime login cannot change schema", func(t *testing.T) {
		tx := beginTestTx(t, ctx, conn)
		_, err := tx.Exec(ctx, "CREATE TABLE marketplace.should_not_exist (id integer)")
		requirePostgresError(t, err, "42501", "")
	})

	t.Run("readiness checks real database and schema", func(t *testing.T) {
		pool, err := database.OpenPool(ctx, appURL)
		if err != nil {
			t.Fatal(err)
		}
		defer pool.Close()
		if err := database.CheckReadiness(ctx, pool); err != nil {
			t.Fatalf("migrated database is not ready: %v", err)
		}
		missing, err := url.Parse(appURL)
		if err != nil {
			t.Fatal(err)
		}
		missing.Host = "127.0.0.1:1"
		unavailable, err := database.OpenPool(ctx, missing.String())
		if err != nil {
			t.Fatal(err)
		}
		defer unavailable.Close()
		checkCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
		defer cancel()
		if err := database.CheckReadiness(checkCtx, unavailable); !errors.Is(err, database.ErrUnavailable) {
			t.Fatalf("unavailable database returned %v", err)
		}
	})
}

const itemSQL = "INSERT INTO marketplace.order_items(order_id,offer_id,digital_key_id,unit_price_cents,product_name_snapshot,seller_name_snapshot) VALUES ($1,$2,$3,1500,'Integration product','Integration seller')"

func beginTestTx(t *testing.T, ctx context.Context, conn *pgx.Conn) pgx.Tx {
	t.Helper()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return tx
}

func purchaseFixture(t *testing.T, ctx context.Context, tx pgx.Tx) (order, key, offer, otherOffer string) {
	t.Helper()
	err := tx.QueryRow(ctx, "SELECT id::text,offer_id::text,(SELECT id::text FROM marketplace.offers WHERE id<>k.offer_id ORDER BY id LIMIT 1) FROM marketplace.digital_keys k WHERE NOT EXISTS(SELECT 1 FROM marketplace.order_items WHERE digital_key_id=k.id) ORDER BY k.id LIMIT 1").Scan(&key, &offer, &otherOffer)
	if err != nil {
		t.Fatal(err)
	}
	return insertOrder(t, ctx, tx), key, offer, otherOffer
}

func insertOrder(t *testing.T, ctx context.Context, tx pgx.Tx) string {
	t.Helper()
	var buyer, order string
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.users(email,display_name,password_hash) VALUES (gen_random_uuid()::text||'@example.test','Integration buyer','test-only-hash') RETURNING id::text").Scan(&buyer); err != nil {
		t.Fatal(err)
	}
	fingerprint := sha256.Sum256([]byte("integration-fixture"))
	if err := tx.QueryRow(ctx, "INSERT INTO marketplace.orders(user_id,idempotency_key,request_fingerprint,total_cents) VALUES ($1,gen_random_uuid(),$2,1500) RETURNING id::text", buyer, fingerprint[:]).Scan(&order); err != nil {
		t.Fatal(err)
	}
	return order
}

func requirePostgresError(t *testing.T, err error, code, constraint string) {
	t.Helper()
	var postgresError *pgconn.PgError
	if !errors.As(err, &postgresError) || postgresError.Code != code || (constraint != "" && postgresError.ConstraintName != constraint) {
		t.Fatalf("expected SQLSTATE %s constraint %s; got %v", code, constraint, err)
	}
}
