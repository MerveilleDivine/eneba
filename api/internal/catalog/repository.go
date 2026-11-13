package catalog

import (
	"context"
	"errors"
	"io"
	"net"
	"strings"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, filter Filter) (Page, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Page{}, classifyReadError(err)
	}
	defer tx.Rollback(ctx)
	page, err := readPage(ctx, tx, filter)
	if err != nil {
		return Page{}, classifyReadError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Page{}, classifyReadError(err)
	}
	return page, nil
}

// Both reads share one snapshot. The same predicate defines the total and the
// page, including available inventory, search and price bounds.
const catalogSQL = `WITH available_prices AS (
  SELECT o.product_id, min(o.price_cents) AS lowest_price_cents
  FROM marketplace.offers o
  WHERE o.active AND EXISTS (
    SELECT 1 FROM marketplace.digital_keys k
    WHERE k.offer_id = o.id AND NOT EXISTS (
      SELECT 1 FROM marketplace.order_items item WHERE item.digital_key_id = k.id
    )
  )
  GROUP BY o.product_id
), catalog AS (
  SELECT p.id, p.slug, p.name, p.edition, p.platform, p.region, p.cover_url,
    prices.lowest_price_cents,
    CASE
      WHEN lower(p.name) = lower($1::text) THEN 0
      WHEN p.name ILIKE $4::text || '%' ESCAPE E'\\' THEN 1
      WHEN p.name ILIKE '%' || $4::text || '%' ESCAPE E'\\' THEN 2
      ELSE 3
    END AS match_rank,
    extensions.word_similarity($1::text, p.name) AS similarity_score
  FROM marketplace.products p
  LEFT JOIN available_prices prices ON prices.product_id = p.id
  WHERE p.active
    AND ($2::text = '' OR p.platform = $2)
    AND ($3::text = '' OR p.region = $3)
    AND ($5::bigint IS NULL OR prices.lowest_price_cents >= $5)
    AND ($6::bigint IS NULL OR prices.lowest_price_cents <= $6)
    AND (
      $1::text = ''
      OR p.name ILIKE '%' || $4::text || '%' ESCAPE E'\\'
      OR (char_length($1::text) >= 3 AND extensions.word_similarity($1::text, p.name) >= 0.4)
    )
)
`

func readPage(ctx context.Context, tx pgx.Tx, filter Filter) (Page, error) {
	order, err := sortSQL(filter.Sort)
	if err != nil {
		return Page{}, err
	}
	escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(filter.Query)
	args := []any{filter.Query, filter.Platform, filter.Region, escaped, filter.MinPriceCents, filter.MaxPriceCents}
	page := Page{Items: []Product{}, Page: filter.Page, PageSize: filter.PageSize}
	if err := tx.QueryRow(ctx, catalogSQL+"SELECT count(*) FROM catalog", args...).Scan(&page.Total); err != nil {
		return Page{}, err
	}
	offset := (filter.Page - 1) * filter.PageSize
	if offset >= page.Total {
		return page, nil
	}
	args = append(args, filter.PageSize, offset)
	rows, err := tx.Query(ctx, catalogSQL+"SELECT id::text, slug, name, edition, platform, region, cover_url, lowest_price_cents FROM catalog ORDER BY "+order+" LIMIT $7 OFFSET $8", args...)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var product Product
		if err := rows.Scan(&product.ID, &product.Slug, &product.Name, &product.Edition, &product.Platform, &product.Region, &product.CoverURL, &product.LowestPriceCents); err != nil {
			return Page{}, err
		}
		page.Items = append(page.Items, product)
	}
	return page, rows.Err()
}

func sortSQL(sort string) (string, error) {
	const stableName = `lower(name) COLLATE "C" ASC, id ASC`
	switch sort {
	case "name_asc":
		return stableName, nil
	case "price_asc":
		return "lowest_price_cents ASC NULLS LAST, " + stableName, nil
	case "price_desc":
		return "lowest_price_cents DESC NULLS LAST, " + stableName, nil
	case "relevance":
		return "match_rank ASC, CASE WHEN match_rank = 3 THEN similarity_score END DESC NULLS LAST, " + stableName, nil
	default:
		return "", ErrInvalidQuery
	}
}

func classifyReadError(err error) error {
	var connectionError *pgconn.ConnectError
	var networkError net.Error
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) || errors.As(err, &connectionError) || errors.As(err, &networkError) {
		return database.ErrUnavailable
	}
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		if strings.HasPrefix(postgresError.Code, "08") || strings.HasPrefix(postgresError.Code, "28") || strings.HasPrefix(postgresError.Code, "53") {
			return database.ErrUnavailable
		}
		switch postgresError.Code {
		case "57014", "57P01", "57P02", "57P03":
			return database.ErrUnavailable
		}
	}
	return err
}
