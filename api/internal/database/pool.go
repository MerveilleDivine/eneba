package database

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUnavailable   = errors.New("database unavailable")
	ErrSchemaMissing = errors.New("required schema missing")
)

func OpenPool(ctx context.Context, connectionURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(connectionURL)
	if err != nil {
		return nil, errors.New("invalid database pool configuration")
	}
	cfg.MaxConns = 5
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	return pgxpool.NewWithConfig(ctx, cfg)
}

func CheckReadiness(ctx context.Context, pool *pgxpool.Pool) error {
	var ready bool
	err := pool.QueryRow(ctx,
		"SELECT count(*) = 12 FROM pg_catalog.pg_tables WHERE schemaname = 'marketplace' "+
			"AND tablename IN ('users','sessions','products','sellers','offers','digital_keys','orders','order_items','homepage_banners','homepage_best_sellers','homepage_deals','seed_versions')",
	).Scan(&ready)
	if err != nil {
		return ErrUnavailable
	}
	if !ready {
		return ErrSchemaMissing
	}
	if _, err := pool.Exec(ctx, "SELECT 1 FROM marketplace.products LIMIT 1"); err != nil {
		return ErrUnavailable
	}
	return nil
}
