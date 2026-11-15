// Package marketplace holds shared SQL product-availability semantics.
package marketplace

// AvailablePricesCTE is reused by catalog and independently ranked homepage
// sections. Active seller offers count only when an unallocated key exists.
// It is a read projection, never an inventory reservation.
const AvailablePricesCTE = `available_prices AS (
  SELECT o.product_id, min(o.price_cents) AS lowest_price_cents
  FROM marketplace.offers o
  WHERE o.active AND EXISTS (
    SELECT 1 FROM marketplace.digital_keys k
    WHERE k.offer_id = o.id AND NOT EXISTS (
      SELECT 1 FROM marketplace.order_items item WHERE item.digital_key_id = k.id
    )
  )
  GROUP BY o.product_id
)`
