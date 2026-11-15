// Package marketplace holds shared SQL product-availability semantics.
package marketplace

// AvailableOfferKeySQL expresses the single definition of available inventory
// for an offer aliased as "o". It is shared by product-price discovery and
// the seller-specific Deals projection, not a stock reservation.
const AvailableOfferKeySQL = `EXISTS (
  SELECT 1 FROM marketplace.digital_keys k
  WHERE k.offer_id = o.id AND NOT EXISTS (
    SELECT 1 FROM marketplace.order_items item WHERE item.digital_key_id = k.id
  )
)`

// AvailablePricesCTE is reused by catalog and independently ranked Best Sellers.
// Active seller offers contribute their lowest price only while stock exists.
const AvailablePricesCTE = `available_prices AS (
  SELECT o.product_id, min(o.price_cents) AS lowest_price_cents
  FROM marketplace.offers o
  WHERE o.active AND ` + AvailableOfferKeySQL + `
  GROUP BY o.product_id
)`
