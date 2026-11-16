//go:build integration

package auth

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/database/maintenance"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Each package owns its integration setup; tests must not depend on
// catalog tests running first to create the isolated test schema.
func authTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	app := os.Getenv("TEST_DATABASE_URL")
	owner := os.Getenv("TEST_MIGRATION_DATABASE_URL")
	for _, dsn := range []string{app, owner} {
		endpoint, err := url.Parse(dsn)
		if err != nil || endpoint.Hostname() == "" || endpoint.Path != "/eneba_test" {
			t.Fatal("auth integration requires explicit isolated eneba_test URLs")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := maintenance.Migrate(ctx, owner, app,
		filepath.Join("..", "..", "..", "db", "migrations")); err != nil {
		t.Fatalf("cannot prepare isolated auth test schema: %v", err)
	}
	pool, err := database.OpenPool(ctx, app)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
