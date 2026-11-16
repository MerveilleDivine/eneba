package home

import (
	"context"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/marketplace"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DealRepository struct {
	pool *pgxpool.Pool
}

func NewDealRepository(pool *pgxpool.Pool) *DealRepository {
	return &DealRepository{pool: pool}
}

// The ranking comes only from homepage_deals; prices, seller and stock come
// from that exact offer. Truncated text includes a +1 rejection sentinel.
// A single bounded SQL statement supplies the full section (no N+1 reads).
const dealSQL = `
SELECT d.offer_id::text, p.id::text,
	LEFT(p.slug, $3), LEFT(p.name, $4), LEFT(p.edition, $5),
	p.platform, p.region, LEFT(p.cover_url, $6), LEFT(s.name, $7),
	o.price_cents, o.list_price_cents, d.position
FROM marketplace.homepage_deals d
JOIN marketplace.offers o ON o.id = d.offer_id AND o.active
JOIN marketplace.products p ON p.id = o.product_id AND p.active
JOIN marketplace.sellers s ON s.id = o.seller_id
WHERE o.price_cents BETWEEN 1 AND $2
  AND o.list_price_cents > o.price_cents
  AND o.list_price_cents <= $2
  AND ` + marketplace.AvailableOfferKeySQL + `
ORDER BY d.position ASC, d.offer_id ASC
LIMIT $1
`

func (r *DealRepository) List(ctx context.Context) ([]Deal, error) {
	rows, err := r.pool.Query(ctx, dealSQL, dealCandidateLimit, maxDealSafeCents,
		maxDealSlug+1, maxDealName+1, maxDealEdition+1, maxDealCover+1, maxDealSeller+1)
	if err != nil {
		return nil, database.ClassifyReadError(err)
	}
	defer rows.Close()
	items := make([]Deal, 0, maxDeals)
	for rows.Next() {
		var item Deal
		if err := rows.Scan(&item.OfferID, &item.ProductID, &item.Slug,
			&item.Name, &item.Edition, &item.Platform, &item.Region,
			&item.CoverURL, &item.SellerName, &item.PriceCents,
			&item.ListPriceCents, &item.Position); err != nil {
			return nil, database.ClassifyReadError(err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, database.ClassifyReadError(err)
	}
	return items, nil
}
