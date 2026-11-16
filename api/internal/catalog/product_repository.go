package catalog

import (
	"context"
	"errors"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/marketplace"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) GetProduct(ctx context.Context, slug string) (ProductDetails, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return ProductDetails{}, database.ClassifyReadError(err)
	}
	defer tx.Rollback(ctx)
	details, err := readProduct(ctx, tx, slug)
	if err != nil {
		return ProductDetails{}, database.ClassifyReadError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return ProductDetails{}, database.ClassifyReadError(err)
	}
	return details, nil
}

const productInfoSQL = "WITH " + marketplace.AvailablePricesCTE + `
SELECT p.id::text, left(p.slug,161), left(p.name,141), left(p.edition,81),
  p.platform, p.region, left(p.cover_url,401), prices.lowest_price_cents,
  left(p.description,5001), left(p.activation_instructions,1001)
FROM marketplace.products p
LEFT JOIN available_prices prices ON prices.product_id=p.id
WHERE p.active AND p.slug=$1`

const productOffersSQL = `SELECT o.id::text, s.id::text, left(s.name,101),
  s.rating_percent, o.price_cents, o.list_price_cents,
  ` + marketplace.AvailableOfferKeySQL + ` AS available
FROM marketplace.offers o
JOIN marketplace.sellers s ON s.id=o.seller_id
WHERE o.active AND o.product_id=$1
ORDER BY available DESC, o.price_cents ASC, o.id ASC
LIMIT $2`

// Two bounded set reads, one snapshot. Read one extra offer to reject an
// oversized source rather than silently dropping a seller the buyer selected.
func readProduct(ctx context.Context, tx pgx.Tx, slug string) (ProductDetails, error) {
	details := ProductDetails{Offers: []SellerOffer{}}
	p := &details.Product
	err := tx.QueryRow(ctx, productInfoSQL, slug).Scan(&p.ID, &p.Slug, &p.Name, &p.Edition,
		&p.Platform, &p.Region, &p.CoverURL, &p.LowestPriceCents, &p.Description, &p.ActivationInstructions)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductDetails{}, ErrProductNotFound
	}
	if err != nil {
		return ProductDetails{}, err
	}
	rows, err := tx.Query(ctx, productOffersSQL, p.ID, maxProductOffers+1)
	if err != nil {
		return ProductDetails{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var offer SellerOffer
		if err := rows.Scan(&offer.OfferID, &offer.SellerID, &offer.SellerName,
			&offer.SellerRatingPercent, &offer.PriceCents, &offer.ListPriceCents, &offer.Available); err != nil {
			return ProductDetails{}, err
		}
		details.Offers = append(details.Offers, offer)
	}
	if err := rows.Err(); err != nil {
		return ProductDetails{}, err
	}
	if len(details.Offers) > maxProductOffers {
		return ProductDetails{}, errInvalidProductData
	}
	return details, nil
}
