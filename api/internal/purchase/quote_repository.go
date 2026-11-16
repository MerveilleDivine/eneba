package purchase

import (
	"context"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/marketplace"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// One snapshot and one bounded SQL read, regardless of the number of cart lines.
// Left joins preserve unavailable/stale selections for buyer recovery.
const quoteSQL = `
SELECT requested.offer_id::text,
  p.slug, p.name, p.edition, p.platform, p.region,
  s.name, s.rating_percent,
  CASE WHEN p.id IS NOT NULL THEN o.price_cents ELSE NULL END AS unit_price_cents,
  (p.id IS NOT NULL AND ` + marketplace.AvailableOfferKeySQL + `) AS available
FROM unnest($1::uuid[]) WITH ORDINALITY AS requested(offer_id, position)
LEFT JOIN marketplace.offers o ON o.id = requested.offer_id AND o.active
LEFT JOIN marketplace.products p ON p.id = o.product_id AND p.active
LEFT JOIN marketplace.sellers s ON s.id = o.seller_id
ORDER BY requested.position
`

func (r *Repository) ReadQuote(ctx context.Context, ids []string) ([]QuoteLine, error) {
	rows, err := r.pool.Query(ctx, quoteSQL, ids)
	if err != nil {
		return nil, database.ClassifyReadError(err)
	}
	defer rows.Close()

	result := make([]QuoteLine, 0, len(ids))
	for rows.Next() {
		var line QuoteLine
		if err := rows.Scan(&line.OfferID, &line.ProductSlug, &line.ProductName,
			&line.Edition, &line.Platform, &line.Region, &line.SellerName,
			&line.SellerRatingPercent, &line.UnitPriceCents, &line.Available); err != nil {
			return nil, database.ClassifyReadError(err)
		}
		line.Quantity = 1
		result = append(result, line)
	}
	if err := rows.Err(); err != nil {
		return nil, database.ClassifyReadError(err)
	}
	return result, nil
}
