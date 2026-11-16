# Slice 6 — Simulated checkout and atomic purchase plan

**Status:** Slice 6A quotes, 6B atomic purchasing, and 6C buyer checkout UI are implemented and verified against isolated PostgreSQL and Chromium. Slice 6D full release tests are recorded in [Slice 6 verification](../verification/slice-6c-6d-2026-11-16.md); hosted acceptance is tracked separately. See [6A evidence](../verification/slice-6a-2026-11-16.md) and [6B evidence](../verification/slice-6b-2026-11-16.md).
**Branch:** `feature/slice-2-catalog`. No new branch, merge, schema rewrite or paid service.
**Buyer experience:** Authentic marketplace checkout with exactly one discreet, checkout-specific "Simulated purchase — no payment is taken" notice. Avoid implementation notes and repeated "fictional/demo/slice" language on store pages.

## 1. User-visible behavior

1. From the persistent cart, the buyer selects **Proceed to checkout**. Empty, stale, missing or sold-out offers provide understandable recovery choices; no placeholder action is shown.
2. Guest buyers can see current prices. Completing checkout requires registration or sign-in while preserving cart contents.
3. The checkout page obtains a fresh, read-only server quote; it shows each selected game and seller, platform, region, edition, quantity 1, authoritative unit price and EUR total. The quote **does not reserve stock**.
4. The buyer confirms a simulated payment. The UI never asks for a real payment card, makes a charge, or exposes digital-key codes.
5. Successful purchase shows an order reference and total. Clear the purchased cart lines **only after confirmed success**. A failed or timed-out purchase leaves the cart intact and offers retry/requote.
6. Key reveal, order history and ownership-scoped order details belong to **Slice 7**, not this checkpoint.

## 2. API contracts

- `POST /api/v1/cart/quote`: validates 1–10 distinct `{offerId, quantity:1}` lines, fetches active SKU and seller offers, and reads current price/stock without reserving it. Response includes line identity, server `unitPriceCents`, availability and a validated EUR total when all lines are purchasable. Unknown, duplicate, malformed, excessive or non-unit quantities receive safe, explicit errors.
- `POST /api/v1/checkout`: requires session cookie, exact allowed Origin, UUID `Idempotency-Key`, and canonical lines `{offerId, quantity:1, expectedUnitPriceCents}` from the quote. All money stays in positive safe-integer cents.
- Success returns only `{orderId,totalCents}`; never a digital key. Request and response schemas must be documented and tested together.
- Consistent, safe errors: `401` unauthenticated, `403` forbidden origin, `400` invalid cart/idempotency key, `409 PRICE_CHANGED`, `409 OUT_OF_STOCK`, `409 IDEMPOTENCY_CONFLICT`, `503` temporarily unavailable. Do not leak SQL errors or credentials.

## 3. Transaction and idempotency

Use the existing `marketplace.orders`, `order_items`, `offers`, `digital_keys` and `users` tables. **No new migration is required for the agreed one-unit scope.**

1. Validate input before starting a transaction. Canonicalize/sort distinct offer IDs. Hash `(offerId,quantity,expectedUnitPriceCents)` lines into a SHA-256 fingerprint.
2. Start a PostgreSQL **READ COMMITTED** transaction. Lock the **buyer row first** with `SELECT ... FOR UPDATE`.
3. **After** acquiring the buyer lock, search for `(user_id,idempotency_key)`. Identical replay returns the original committed order **without rechecking current stock/prices**. Different payload with the same key returns `409 IDEMPOTENCY_CONFLICT`.
4. For a new checkout, lock each offer row `FOR UPDATE` in ascending UUID order. Check active offer/SKU, seller association and **every individual** authoritative unit price. Even compensating price changes that leave the total unchanged cause `PRICE_CHANGED`.
5. In a new statement after offer locking, locate one unallocated key per selected offer via `NOT EXISTS (SELECT 1 FROM marketplace.order_items WHERE digital_key_id=key.id)`. No `sold` or `reserved` flag; the order item is the stock ledger.
6. Compute and validate the **final server-priced positive total** before inserting an order. Insert that final-total order, immutable order-item price/name snapshots and matching offer/key IDs in the same transaction, then commit.
7. On any error, rollback the entire purchase. Preserve the database's unique `digital_key_id` and composite `(digital_key_id,offer_id)` foreign-key protection.

The client holds one idempotency UUID for an in-flight checkout attempt, including network retries or reload recovery, and does not generate a new UUID until the attempt is resolved or the cart/quote is explicitly changed. Do not persist secret credentials in browser storage.

## 4. Implementation checkpoints

### 6A — Read-only cart quote
- Own the contract in the purchase domain; keep HTTP handler thin, service rules explicit and SQL in a feature repository.
- Add focused quote validation and real PostgreSQL read integration tests.
- Wire a typed frontend quote reader into existing cart/checkout presentation, with loading, retry, stale and sold-out states.

### 6B — Atomic purchase transaction
- Add purchase service/repository, explicit HTTP route and wiring in `api/cmd/server/main.go`.
- Write and execute concurrency/idempotency/rollback/constraint tests on an isolated PostgreSQL test database, never Neon production.
- Avoid a generic repository, payment service abstraction, side-effecting provider or placeholder order total.

### 6C — Buyer checkout and confirmation
- Build `web/src/features/checkout/` only when the backend contract is verified.
- Preserve cart and return destination through sign-in, refresh server quote and show correct seller identity.
- Provide one clear **Place order** action, simulated-payment notice, progress/recovery, and order reference on success.

### 6D — Independent weakness review and hosted acceptance
- Run pinned Prettier, ESLint, TypeScript/Vite, Go format/vet/build/test, database integration and race tests outside the exhausted GitHub Actions quota.
- Browser tests: desktop/mobile/keyboard, guest login, quote refresh, canceled/stale reads, successful purchase, 409 recovery, timeout retry, no double submission, no key leakage, cart preserved on failure.
- Test concurrent buyers for the final key, same buyer simultaneous identical retries, same UUID with changed cart, per-line price changes, mid-transaction rollback, wrong-offer composite FK and duplicate-key rejection.
- Verify real Vercel → Render → Neon integration and record exact deployed commit, failures and remaining limits before a coherent checkpoint commit.

## Non-goals and release gate

No real payment or card form, no multi-quantity selector, no written reviews, no key reveal (Slice 7), no new paid infrastructure and no merge into `main`.

**Slice 6 is done only when:** real PostgreSQL tests demonstrate single allocation under contention, idempotent replay, preserved prices/inventory under failure, and the public browser can go cart → quote → simulated purchase → order confirmation with clean recovery and no developer-facing narration.
