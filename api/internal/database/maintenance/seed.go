package maintenance

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Seed executes each immutable fixture version once. Existing versions are
// checked for edits instead of being rerun and accidentally replenishing stock.
func Seed(ctx context.Context, tx pgx.Tx, directory string) (int, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return 0, err
	}
	applied := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		source, err := os.ReadFile(filepath.Join(directory, entry.Name()))
		if err != nil {
			return 0, err
		}
		checksum := sha256.Sum256(source)
		var previous []byte
		err = tx.QueryRow(ctx, "SELECT checksum FROM marketplace.seed_versions WHERE version = $1", entry.Name()).Scan(&previous)
		if err == nil {
			if string(previous) != string(checksum[:]) {
				return 0, fmt.Errorf("seed %s changed after application; add a new version instead", entry.Name())
			}
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
		if _, err := tx.Exec(ctx, string(source)); err != nil {
			return 0, fmt.Errorf("apply seed %s: %w", entry.Name(), err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO marketplace.seed_versions(version, checksum) VALUES ($1,$2)", entry.Name(), checksum[:]); err != nil {
			return 0, err
		}
		applied++
	}
	return applied, nil
}

func SeedDatabase(ctx context.Context, connectionURL, directory string) (int, error) {
	conn, err := pgx.Connect(ctx, connectionURL)
	if err != nil {
		return 0, err
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	// Serialize explicit fixture commands; this lock is unrelated to checkout.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(1366280530)"); err != nil {
		return 0, err
	}
	applied, err := Seed(ctx, tx, directory)
	if err != nil {
		return 0, err
	}
	return applied, tx.Commit(ctx)
}
