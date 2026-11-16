package purchase

import (
	"context"
	"errors"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5"
)

type lockedOffer struct {
	offerID, productName, sellerName string
	price                            int64
	keyID                            string
}

// CommitPurchase owns the complete transactional integrity boundary. Every
// writer takes the buyer row lock before any offer lock; otherwise idempotent
// retries and last-key allocations could race.
func (r *Repository) CommitPurchase(ctx context.Context, buyerID, idempotencyKey string, lines []PurchaseRequestLine, hash [32]byte) (PurchaseResult, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return PurchaseResult{}, database.ClassifyReadError(err)
	}
	defer tx.Rollback(ctx)

	var lockedBuyer string
	err = tx.QueryRow(ctx, `SELECT id::text FROM marketplace.users WHERE id=$1::uuid FOR UPDATE`, buyerID).Scan(&lockedBuyer)
	if errors.Is(err, pgx.ErrNoRows) {
		return PurchaseResult{}, ErrBuyerNotFound
	}
	if err != nil {
		return PurchaseResult{}, database.ClassifyReadError(err)
	}

	var existing PurchaseResult
	var previousHash []byte
	err = tx.QueryRow(ctx, `SELECT id::text,request_fingerprint,total_cents FROM marketplace.orders
  WHERE user_id=$1::uuid AND idempotency_key=$2::uuid`, buyerID, idempotencyKey).
		Scan(&existing.OrderID, &previousHash, &existing.TotalCents)
	if err == nil {
		if !matchingFingerprint(hash[:], previousHash) {
			return PurchaseResult{}, ErrIdempotencyConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return PurchaseResult{}, database.ClassifyReadError(err)
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return PurchaseResult{}, database.ClassifyReadError(err)
	}

	locked := make([]lockedOffer, 0, len(lines))
	var total int64
	// All offer IDs were sorted before this method was called.
	for _, line := range lines {
		var offer lockedOffer
		offer.offerID = line.OfferID
		err = tx.QueryRow(ctx, `
   SELECT o.price_cents,p.name,s.name
   FROM marketplace.offers o
   JOIN marketplace.products p ON p.id=o.product_id
   JOIN marketplace.sellers s ON s.id=o.seller_id
   WHERE o.id=$1::uuid AND o.active AND p.active
   FOR UPDATE OF o FOR SHARE OF p`, line.OfferID).Scan(&offer.price, &offer.productName, &offer.sellerName)
		if errors.Is(err, pgx.ErrNoRows) {
			return PurchaseResult{}, ErrOutOfStock
		}
		if err != nil {
			return PurchaseResult{}, database.ClassifyReadError(err)
		}
		if !priceSafe(offer.price) {
			return PurchaseResult{}, ErrInvalidCheckout
		}
		if offer.price != line.ExpectedUnitPriceCents {
			return PurchaseResult{}, ErrPriceChanged
		}
		if offer.price > maxSafeCents-total {
			return PurchaseResult{}, ErrInvalidCheckout
		}
		total += offer.price
		locked = append(locked, offer)
	}
	// Issue a NEW statement after all offer locks have been acquired, so the
	// READ COMMITTED snapshot sees any previous buyer's committed allocation.
	for i := range locked {
		err = tx.QueryRow(ctx, `
   SELECT k.id::text FROM marketplace.digital_keys k
   WHERE k.offer_id=$1::uuid AND NOT EXISTS (
    SELECT 1 FROM marketplace.order_items item WHERE item.digital_key_id=k.id
   )
   ORDER BY k.id LIMIT 1`, locked[i].offerID).Scan(&locked[i].keyID)
		if errors.Is(err, pgx.ErrNoRows) {
			return PurchaseResult{}, ErrOutOfStock
		}
		if err != nil {
			return PurchaseResult{}, database.ClassifyReadError(err)
		}
	}

	var orderID string
	err = tx.QueryRow(ctx, `
  INSERT INTO marketplace.orders(user_id,idempotency_key,request_fingerprint,total_cents)
  VALUES($1::uuid,$2::uuid,$3,$4) RETURNING id::text`, buyerID, idempotencyKey, hash[:], total).Scan(&orderID)
	if err != nil {
		return PurchaseResult{}, database.ClassifyReadError(err)
	}
	for _, item := range locked {
		_, err = tx.Exec(ctx, `
   INSERT INTO marketplace.order_items(order_id,offer_id,digital_key_id,unit_price_cents,product_name_snapshot,seller_name_snapshot)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6)`,
			orderID, item.offerID, item.keyID, item.price, item.productName, item.sellerName)
		if err != nil {
			return PurchaseResult{}, database.ClassifyReadError(err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return PurchaseResult{}, database.ClassifyReadError(err)
	}
	return PurchaseResult{OrderID: orderID, TotalCents: total}, nil
}
