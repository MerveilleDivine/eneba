# Engineering decisions and invariants

## Module boundaries — only as many as needed

```text
marketplace/
  web/src/       # app router; home, catalog, product, cart, auth, checkout, orders; shared API client
  api/cmd/server # config, explicit wiring and HTTP startup
  api/internal/
    httpapi/     # routing, middleware, JSON, error mapping
    catalog/     # products, seller offers, search + quoting reads
    home/        # BannerService, BestSellerService, DealService (independent data sources)
    auth/        # users, sessions
    purchase/    # checkout + order reads + key reveal; one domain for order lifecycle
    platform/    # DB connection/config/necessary shared plumbing
  db/migrations/ # 001_initial.sql, then explicit versioned changes
  db/seeds/      # deterministic fake products, offers and NONREDEEMABLE keys
  docs/ai-history/
```

Create directories **only when the corresponding feature is built**. Keep service/repository within the feature; define interfaces only when tests or a real boundary justify them. No generic `BaseRepository`, no ORM, no elaborate event system.

## Model

- `products`: a distinct `game + platform + region + edition` SKU. Offers compared on one product page always correspond to the same SKU. Product details include clear activation instructions, platform and region compatibility. Keep 12–20 well-presented demo SKUs to concentrate effort on correctness/visual quality. More categories (gift cards, etc.) are **optional extension**, not an automatic scope increase.
- `sellers`: merchant identity and demo rating.
- `offers`: one seller price for one SKU; use `price_cents` as authoritative current price and optional `list_price_cents > price_cents` for actual deal calculations.
- `digital_keys`: each fake code belongs to exactly one offer. **No `sold_at`, no `reserved_at`, no mutable allocation flags.** A key is sold if and only if it appears in `order_items`.
- `orders`: one committed purchase per `(buyer, idempotency_key)`; commitment is atomic with its items. The unique key is on the DB table, not an in-memory map.
- `order_items`: immutable unit-price and name snapshots; one digital key per row (including in any future multi-unit purchase). `(digital_key_id, offer_id)` is a **composite FK** referencing `digital_keys(id, offer_id)`, so a key for offer A cannot be attached to a purchase of offer B. `digital_key_id` is UNIQUE. The v1 `UNIQUE(order_id, offer_id)` guard matches today’s one-unit limit and will need **one targeted versioned migration** to be dropped when quantity >1 is implemented. Never drop the key uniqueness or composite FK.
- `homepage_banners`, `homepage_best_sellers` and `homepage_deals` are separately maintained sources, queried by independent services/endpoints. They share one Postgres cluster, not one hardcoded array.

## Cart scope (purposeful simplification)

The cart stores a list of distinct `{offerId, quantity: 1}` records (max 10 distinct offers). Every line purchases one key; reject any quantity other than `1` in v1. No quantity picker. The explicit quantity field is the only forward-compatibility provision: later, relax validation and allocate one `order_items` row **per purchased key** after a small DB migration. The cart remains browser-owned; sellers/prices/stock are always verified by the server. This is a **declared scope decision**, not a hidden failure to implement a promised feature.

A cart quote is read-only and *does not reserve stock*. It returns an ordered list of available offer details, `quantity: 1`, **unit prices**, per-line totals and an overall total. On purchase, the server checks every offer, stock, and expected unit price again. Price mismatch triggers `409 PRICE_CHANGED`; no purchase or key allocation.

## Checkout algorithm — one transaction, one source of inventory truth

**Why this is simpler:** The earlier plan inserted an `orders` row as an idempotency claim *before* a server-verified total existed, but `orders.total_cents` is `NOT NULL` and must be positive. This was a real implementation contradiction. Do **not** insert a placeholder total, introduce a second checkout-attempts table, or silently relax schema constraints. Serializing checkout at the **buyer row** handles duplicate requests without either problem.

1. Validate logged-in user, Origin for unsafe methods, distinct offer IDs, max cart size, `quantity == 1` per line in v1, expected unit prices, idempotency UUID; normalize and sort offers. Compute a SHA-256 fingerprint of canonical `(offerId, quantity, expectedUnitPriceCents)` lines. Include quantity **even while fixed at 1** so later expansion preserves replay semantics.
2. `BEGIN` in PostgreSQL READ COMMITTED isolation. Lock the buyer's `users` row with `SELECT id FROM users WHERE id=$1 FOR UPDATE`. **Always acquire the buyer lock before any offer locks.** It serializes simultaneous checkouts for this user (a deliberate, acceptable trade-off at demo scale).
3. **After acquiring the buyer lock**, search `orders` for `(user_id, idempotency_key)`. If found, compare fingerprint and return the original completed order if identical; otherwise `409 IDEMPOTENCY_CONFLICT`. Never check stock or changed prices before returning a valid retry. No duplicate order is created.
4. If new: lock every selected offer row with `SELECT ... FOR UPDATE` in ascending UUID order. Verify offer and SKU are active, authoritative server prices, compatible seller offer and platform/region metadata. Compare **each** price to the quote; return `409 PRICE_CHANGED` when different.
5. Under those offer locks, select one unallocated key per offer with `NOT EXISTS (SELECT 1 FROM order_items WHERE digital_key_id=keys.id)`. Always issue a **new statement** after locks, so READ COMMITTED sees a previous buyer's committed allocation. Do not add a redundant sold flag. If any offer has no key, `ROLLBACK` and return `409 OUT_OF_STOCK`.
6. Simulate payment in process (zero real charges). Build and **validate the final total from the server-side offer prices**. Insert the `orders` row with this final total and canonical request fingerprint, then `order_items` with correct matching offer/key IDs and immutable price/name snapshots; `COMMIT`. Composite FK and unique keys are defense in depth.
7. Return `{orderId, totalCents}` without digital keys. Only the authenticated owner can reveal a demo code using `GET /api/v1/orders/{id}`. Clear cart only on confirmed success.

**Concurrency rationale:** Two checkouts by the same buyer serialize on their user row: identical retries get the same committed order even if stock is now empty; different carts are processed sequentially. Different buyers lock different user rows, then contend only on shared offer rows, which are locked in deterministic order. Offer locks ensure the last key can be sold only once. Keep every checkout writer on this protocol; unique constraints still protect against unexpected writers. There is no external provider side-effect to reconcile.

**Failure handling:** request timeout after commit → exact retry sees original. Failed transaction → no order/keys committed; a retry may genuinely reattempt. Stale quote → 409 and refresh without losing cart. Another buyer requesting last key → one succeeds, one gets stock conflict. Every error rolls back; never commit incomplete orders.

## Practical API (minimal)

| Route | Purpose |
| --- | --- |
| `GET /healthz`, `GET /readyz` | Server and database health |
| `GET /api/v1/home/banners` | Independent BannerService/table |
| `GET /api/v1/home/best-sellers` | Independent BestSellerService/table |
| `GET /api/v1/home/deals` | Independent DealService/table |
| `GET /api/v1/products?q=&platform=&region=&sort=&page=` | Catalog, safe filters, typo-tolerant search |
| `GET /api/v1/products/{slug}` | Product and competing offers; NO key codes |
| `POST /api/v1/auth/register`, `/login`, `/logout`, `GET /api/v1/auth/me` | Sessions |
| `POST /api/v1/cart/quote` | Read-only server price/stock snapshot |
| `POST /api/v1/checkout` | Atomic simulated purchase; `Idempotency-Key` UUID |
| `GET /api/v1/orders`, `GET /api/v1/orders/{id}` | Own orders and demo key reveal |

Example quote input: `{"lines":[{"offerId":"11111111-1111-4111-8111-111111111111","quantity":1}]}`. Reject duplicate offer IDs and `quantity != 1` in v1.

Example quote output: `{"lines":[{"offerId":"11111111-1111-4111-8111-111111111111","quantity":1,"unitPriceCents":1299,"lineTotalCents":1299,"available":true}],"totalCents":1299}`. The quote is a snapshot, not a reservation.

Checkout input: `{"lines":[{"offerId":"11111111-1111-4111-8111-111111111111","quantity":1,"expectedUnitPriceCents":1299}]}` with a stable `Idempotency-Key` header for retries. Reject duplicates, quantities other than 1 in v1, and invalid prices. Keep the API DTO contract in code and README in sync. Use JSON numeric cents and JS safe-integer validation for external values.

## Deferred medium-priority extension seams

- **Multi-quantity:** API and browser cart carry `quantity` fixed to 1 now; expand validation, server quote and transactional key selection later. Store each purchased key as its own `order_items` row; remove only `one_of_each_offer_per_order` in a **new migration** after multi-unit tests. Totals become the sum of server-price × quantity; guard overflow and stock races. No new inventory service or quantity column now.
- **Written customer reviews:** stable product IDs and authenticated purchase ownership already exist. Later, create a small product-review table keyed by an actual purchased `order_item_id` and implement a focused read/write module. Derive the product and author from the purchased order item and its parent order instead of duplicating identities in a second source of truth. Seller `rating_percent` is demo seller metadata and must not be presented as a calculated product-review score. No review tables, routes, buttons or components now.
- **Not provisioned:** promo codes and personalized recommendations (low–medium rather than medium risk), along with low-risk excluded features. Do not add empty strategy interfaces, discount columns, personalization fields or extension points.

See `FUTURE_MEDIUM_FEATURES.md` for exact migration steps, tests and activation criteria.

## Search/catalog correctness, not performance theater

Use `pg_trgm` plus escaped `ILIKE` with partial matches; for 1–2-character searches handle substring explicitly. Rank exact > prefix > substring > typo; stable name/ID tie-break. Filter/sort using allowlists, not interpolated user SQL. Show **all active products** in an unfiltered catalog, including products whose offers are sold out; those show a disabled `Sold out` state. Compute **lowest price among active, in-stock offers** before price filtering/sorting and before pagination; sort null-price/sold-out products last. In-stock price filters naturally omit products without an available offer. Avoid N+1. Benchmark only after actual correctness and real usage.

## Privacy/UX/deployment

Server-side hashed password (bcrypt is fine), random opaque HTTP-only session cookie with stored hash, authenticated order ownership checks, parameterized SQL and bounded input. Use same-origin `/api` frontend rewrite to Go API; verify cookie/Origin interaction on the public site, not just local. Favor responsive layout, good typography, useful images, clear loading/empty/error states, and keyboard navigation. Deploy a vertical slice early so infrastructure surprises are not a final-day discovery.
