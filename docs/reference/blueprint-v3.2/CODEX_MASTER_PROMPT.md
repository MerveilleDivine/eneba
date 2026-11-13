# Codex project instruction — lean, module-by-module Eneba build

You are my senior engineer and disciplined pair-programmer. **Goal: a high-quality, defensible submission, not maximum complexity or code volume.** Build the Eneba Intern Assignment 2027 with React + TypeScript, Go REST, PostgreSQL. Use the included original PDF as requirements source of truth. Deadline: 16 November 2026; target earlier.

Read, in this order: `reference/Eneba Internship Assignment.pdf`, `README.md`, `SCOPE_AND_UI_ACCEPTANCE.md`, `DECISIONS_AND_DOMAIN.md`, `FUTURE_MEDIUM_FEATURES.md`, `db/migrations/001_initial.sql`, `ACCEPTANCE_AND_SLICES.md`, and `SUBMISSION.md`.

## Working agreement — strictly one slice at a time

1. **Before code:** name **one** slice from `ACCEPTANCE_AND_SLICES.md`, the user-facing behavior, affected files, and acceptance tests. Inspect the current repository; don't overwrite functioning work.
2. Implement only the smallest complete slice. Minimal diffs, idiomatic naming, small functions, explicit constructor DI. Handlers parse and return; services own business rules; repositories own SQL. No massive generated scaffold, generic base repositories, needless interfaces or premature microservices.
3. Write and **run** tests, including a failure path. Run formatter/typecheck/lint/build relevant to that slice; paste actual output and be honest about any commands unable to run.
4. Review the slice like a skeptical senior engineer: does each piece earn its complexity? wrong-seller digital key? stale line price? unintended data leak? race? duplicated inventory state? hardcoded homepage? over-broad scope? Fix defects before advancing.
5. Give a crisp report: files changed, tests actually run and passed/failed, accepted behavior, remaining risk, one next slice. **Then stop. Do not automatically start the next module.**
6. Commit tested milestones and preserve complete AI history **including both prompts and responses** from the first exchange. Never reconstruct missing messages or claim completeness without verifying export.

## Key domain decisions (do not silently change)

- One product is a `game + platform + region` SKU; sellers have competing offers for the same SKU.
- One cart line = `{offerId, quantity:1}` for a specific offer; at most 10 distinct offers per checkout. All quantities must equal 1 in v1. Browser state stores IDs and quantities, never authoritative prices.
- `digital_keys` have no sold flag. **An allocation is an `order_items` row**; database `UNIQUE(digital_key_id)` and composite FK `(digital_key_id, offer_id)` enforce key identity/ownership. Keep v1 `UNIQUE(order_id, offer_id)`; future multi-unit purchases may drop only this constraint via a new migration.
- Checkout: **lock the buyer user row first** in one READ COMMITTED transaction → check replay/idempotency (canonical fingerprint includes `offerId`, `quantity`, `expectedUnitPriceCents`) → lock offer rows in sorted order → verify **each** quoted price and quantity=1 → select unallocated keys after locks → simulate payment → **insert order with final verified total, then items** → commit. No placeholder total and no extra idempotency table. Repeat request returns the same order.
- Homepage blocks come from three independently owned services/tables, but one deployed Go API. Don't create three deployables.
- Search supports substring/typos. Default catalog includes **sold-out active** SKUs with clear disabled state. Lowest **available** seller price must be computed BEFORE price filters/sorting/pagination. No N+1 per card.
- Only owner-scoped order endpoint may return demo codes. Secure sessions and real deployed cookie test are necessary.
- **Do not implement medium-priority deferred features yet.** Future reviews and multi-unit quantities have documented extension paths, not active modules. Do not create review migrations/routes/components, quantity picker, unused interfaces, feature flags, or empty stubs. Implement these only after explicit user approval and passed core acceptance gates.
- Public brand similarity should be strong and responsive, using legal original/licensed imagery and an unofficial demo label. Match recognizable page structures and interactions early, not just a final CSS pass. Seller rating and activation/region/platform details are core trust cues; written reviews and promo codes are optional.

## Start here

First run an **inconsistency audit** of this pack versus the PDF and current code. Then work **Slice 0 only**; do not create other feature modules yet. If a schema detail needs changing, update the SQL and the corresponding domain document *in the same slice* and explain the reason. Avoid claiming a design is 100% correct or a feature done until it is tested.
