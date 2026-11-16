package home

import (
	"context"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/marketplace"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BestSellerRepository struct {
	pool *pgxpool.Pool
}

func NewBestSellerRepository(pool *pgxpool.Pool) *BestSellerRepository {
	return &BestSellerRepository{pool: pool}
}

// The ranking table alone selects best sellers. Inventory semantics are
// identical to catalog, via one shared CTE. One bounded query; no per-card SQL.
const bestSellerSQL = "WITH " + marketplace.AvailablePricesCTE + `
SELECT p.id::text, p.slug, p.name, p.edition, p.platform, p.region,
       p.cover_url, available_prices.lowest_price_cents, ranked.demo_weekly_sales
FROM marketplace.homepage_best_sellers ranked
JOIN marketplace.products p ON p.id = ranked.product_id AND p.active
LEFT JOIN available_prices ON available_prices.product_id = p.id
ORDER BY ranked.demo_weekly_sales DESC, lower(p.name) COLLATE "C", p.id
LIMIT $1
`

func (r *BestSellerRepository) List(ctx context.Context) ([]BestSeller, error) {
	rows, err := r.pool.Query(ctx, bestSellerSQL, maxBestSellers)
	if err != nil {
		return nil, database.ClassifyReadError(err)
	}
	defer rows.Close()
	items := make([]BestSeller, 0, maxBestSellers)
	for rows.Next() {
		var item BestSeller
		if err := rows.Scan(
			&item.ID, &item.Slug, &item.Name, &item.Edition, &item.Platform,
			&item.Region, &item.CoverURL, &item.LowestPriceCents, &item.DemoWeeklySales,
		); err != nil {
			return nil, database.ClassifyReadError(err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, database.ClassifyReadError(err)
	}
	return items, nil
}
