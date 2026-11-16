# Read-only cart quote API

**Endpoint:** `POST /api/v1/cart/quote`

Retrieves current EUR prices and stock from PostgreSQL without allocating keys, creating orders or charging a buyer. The quote is public because it contains only catalog-visible data. Checkout must separately authenticate and revalidate every price and key under database locks.

## Request

```json
{"lines":[{"offerId":"30000000-0000-4000-8000-000000000001","quantity":1}]}
```

Requires 1–10 distinct offer UUIDs (case-insensitive) with quantity exactly 1. Rejects malformed UUIDs, duplicate IDs, unknown input fields, non-unit quantities, empty requests and bodies larger than 4 KiB.

## Response

```json
{
  "currency":"EUR",
  "lines":[{
    "offerId":"30000000-0000-4000-8000-000000000001",
    "quantity":1,
    "productSlug":"solar-drift",
    "productName":"Solar Drift",
    "edition":"Standard",
    "platform":"steam",
    "region":"global",
    "sellerName":"Northern Pixel",
    "sellerRatingPercent":98,
    "unitPriceCents":1136,
    "lineTotalCents":1136,
    "available":true
  }],
  "totalCents":1136
}
```

Amounts are positive integer cents within JavaScript's safe range. Lines preserve request order. For inactive/missing offers, metadata and price are null, availability false; sold-out offers may expose their currently configured unit price but are not purchasable. Any unavailable line forces `totalCents:null`, and its `lineTotalCents:null`. The frontend rechecks totals and identity to reject malformed responses.

HTTP: 200 success, 400 invalid_cart, 415 wrong content type, 405 unsupported method, 503 unavailable database, 500 unexpected error. No-store and nosniff response headers. No digital keys, password/session data or allocation identifiers.

Inventory availability means there exists a key for the offer not referenced by `order_items`. The quote uses one bounded read with a consistent statement snapshot; it does not reserve keys or guarantee future stock. Slice 6B must lock the buyer then offers and revalidate under a purchase transaction.
