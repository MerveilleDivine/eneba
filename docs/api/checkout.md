# Checkout purchase API — Slice 6B internal contract

**Not publicly active yet.** This handler is implemented and verified but not wired into `cmd/server` until Slice 6C connects it to the buyer checkout experience.

**POST /api/v1/checkout** requires the buyer's valid session cookie, exact configured Origin, JSON Content-Type and a stable UUID `Idempotency-Key` header.

Request example:
```json
{"lines":[{"offerId":"30000000-0000-4000-8000-000000000001","quantity":1,"expectedUnitPriceCents":1136}]}
```
Requires 1–10 unique offers, all quantity 1. Amounts are positive integer EUR cents within JavaScript's safe range.

On success: HTTP 200, `{"orderId":"<uuid>","totalCents":1136}`. **No digital key is returned.** Exact buyer/idempotency-key/payload replays return the original order, without another allocation and without price/stock revalidation. A changed payload using the same UUID returns a conflict.

Error mapping: 400 `invalid_checkout`, 401 `unauthorized`, 403 `forbidden`, 405 `method_not_allowed`, 409 `PRICE_CHANGED`, 409 `OUT_OF_STOCK`, 409 `IDEMPOTENCY_CONFLICT`, 503 `service_unavailable`, 500 `internal_error`. Unexpected errors never expose database details.

**Transaction protocol:** READ COMMITTED; buyer lock first, replay check second; offer locks in ascending UUID order, product SHARE locks, per-line prices and availability checked after locking, inventory keys selected in new statements, final server-priced total inserted with order and all key allocations in one transaction. Existing unique key and composite FK constraints remain.
