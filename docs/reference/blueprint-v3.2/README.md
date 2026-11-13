# Eneba internship — lean engineering blueprint v3.2 (future-ready, without speculative code)

**Status:** Specification only; not a completed or tested application. **Primary source:** `reference/Eneba Internship Assignment.pdf`. The received email says to submit the GitHub URL, a public deployment, the complete AI prompts and responses, and an English CV/full name by **16 November 2026** (aim for 15 November).

## North star

> **A small system where every important action is correct, traceable and easy to explain.** Do not confuse more modules or more patterns with better engineering. Work **one complete, tested vertical slice at a time**. Aim for an excellent evaluation; no design alone guarantees a particular score.

## Product

An **unofficial Eneba-inspired** digital game-key marketplace: dynamic homepage (banners, best sellers, deals), catalog with filters/sort/partial and typo-tolerant search, product page with competing sellers for the same platform+region, cart, user registration/login, transparent **simulated payment**, and authenticated delivery of **nonredeemable demo keys** with order history.

The frontend is **React + TypeScript**; backend **Go + REST** (explicitly allowed instead of PHP); database **PostgreSQL**. One deployed Go API with real, separate homepage content services and tables, *not* microservices. One simple browser-only cart: **one unit per selected offer**; it may contain several distinct offers. No quantity picker is needed by the assignment. Document that scope choice openly.

### Scope: what we exclude and what we must preserve

**Excluded from the first release:** real payments (simulated payment is expressly permitted), real/redeemable keys, seller/admin dashboards, CMS, refunds, password recovery, promotional codes, personalized recommendations, and distributed messaging. **Also deferred, but deliberately supported by a migration/contract path:** written customer reviews and buying more than one key from the same seller offer. No speculative tables, endpoints or empty feature modules are deployed. See `FUTURE_MEDIUM_FEATURES.md`. These are not individually demanded in the PDF; the evaluator decides how any omission affects scoring.

**Do not accidentally exclude what makes the core credible:** seller rating and multiple competing offers; platform, region, edition and activation notes before buying; a convincing simulated payment confirmation; a usable persistent cart; a copyable owner-only demo key after purchase; and solid responsive Eneba-inspired branding. Written customer reviews are optional, but a visible seller-trust indicator is important for comparing offers. See `SCOPE_AND_UI_ACCEPTANCE.md`.

**Conscious compromise:** no quantity picker for the first implementation. Keep cart lines shaped as `{offerId, quantity: 1}` (quantity is always 1 for now), so later multi-unit purchases extend validation rather than introduce a new API shape. The cart still supports multiple distinct offers, removal, persistence, stock/price refresh and a complete checkout. A future, small schema migration can remove the one-offer-per-order unique constraint when multi-quantity purchasing is implemented. No fake clickable buttons or phantom features. Use original/licensed artwork and display an “unofficial demo” label.

## Read and execute

1. **Original PDF** — the only source for employer requirements.
2. `DECISIONS_AND_DOMAIN.md` — minimal modules, data invariant and checkout design.
3. `SCOPE_AND_UI_ACCEPTANCE.md` — exclusions, visual quality and buyer-experience acceptance.
   `FUTURE_MEDIUM_FEATURES.md` — exact, deferred migration/contract path for reviews and multi-quantity purchases.
4. `db/migrations/001_initial.sql` — executable starting PostgreSQL DDL, not claimed as applied.
5. `ACCEPTANCE_AND_SLICES.md` — slice-by-slice delivery, acceptance and test gates.
6. `CODEX_MASTER_PROMPT.md` — prompt; implement one slice, run checks and report.
7. `SUBMISSION.md` — live deployment and full AI transcript obligations.

## Non-negotiable engineering rules

- Business logic lives in services, not HTTP handlers; SQL lives in feature repositories. Constructor injection from `main.go`; no generic repository interfaces, no huge `utils` package, no premature distributed architecture.
- **Each digital key belongs to the same seller offer as its order item. The database enforces this via a composite foreign key.** One key can be assigned to only one order item.
- No separate `sold_at` field: allocated inventory is exactly the set of keys linked to order items. Prevent divergent inventories by having only one truth.
- A checkout locks **offer rows** in deterministic order. This serializes purchases against the same offer, and a unique key constraint remains the final defensive barrier. No complex key-reservation state machine needed for demo scale.
- In a transaction, **lock the authenticated buyer row first**, check for a completed order with the same idempotency key, then lock offers in deterministic order and verify stock/prices. This serializes one buyer's simultaneous checkouts without a new idempotency table. **Create the order only after calculating the authoritative total** (no provisional or invalid price). An identical retry returns the order; a changed request with the same key is rejected.
- Store money as integer eurocents. Quote and checkout compare **each line's** expected unit price, not only the grand total. Recompute prices server-side.
- Deployed HTTPS auth is verified early; never assume localhost cookie behavior proves production works.
- All features must have observable evidence: tests + browser behavior, not generated code alone.
- Deferred features are **design notes**, not permission for Codex to create their tables, handlers, UI, or generic extension frameworks during the core slices.
- Active but sold-out products still appear in the unfiltered catalog with a clear `Sold out` state; price filters may omit products without an in-stock offer.
- Visual fidelity is built **with** each user-facing module, not left entirely to the last day. The AI transcript must capture **full prompts and responses**.

## Success path

`Home → Search/store → Product → Seller offer → Cart → Login/register → Quote → Confirm demo payment → Order → Demo key`.

If a step fails, show a specific, actionable error and preserve the cart. Keep the experience polished, keyboard usable and mobile friendly. The README of the implemented repository must explain choices and trade-offs in plain English.
