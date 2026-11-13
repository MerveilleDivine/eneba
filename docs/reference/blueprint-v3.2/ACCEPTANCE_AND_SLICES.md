# Module-by-module build protocol and acceptance

## The rule that prevents AI from breaking the project

**One vertical slice per AI session.** The assistant may edit a few tightly related files, write tests, and run them, but must **stop** after reporting results and the next proposed slice. Never auto-implement five modules in one response. Git commits mark coherent working checkpoints. Do not generate empty directories or premature interfaces.

At the start of every slice provide: **(a)** exact user-visible behavior, **(b)** touched modules/files, **(c)** acceptance tests. At the end provide: **(d)** changed files, **(e)** actual commands and results, **(f)** review findings/remaining risks, **(g)** the one next slice. If any check fails, stay on the same slice and fix it.

## Ordered slices

| Slice | Scope (only this) | Pass condition |
|---|---|---|
| 0 | Repo, Go + React minimal boot, Postgres migration, versioned seeds, `/readyz` | Fresh setup works; schema runs twice safely via migration tool; seeded demo data read from DB; no app features yet |
| 1 | Catalog API: **all active SKUs**, including sold-out state, plus lowest in-stock seller price, filters/sort/search/pagination | Exact/partial/typo/short query tests; sold-out visibility; correct sorting *before* pagination; no N+1 |
| 2 | Global header + responsive catalog/product-card frontend | Real API data visible on desktop/mobile; search works from any page; loading/empty/errors; visual tokens and real navigable filters from the start |
| 3 | Three independent home-block services + homepage | Change only one home table, only that block changes; no hardcoded banners/deals/best sellers in React |
| 4 | Product detail showing multiple sellers + client cart | Compare compatible offers with prices, ratings, **region/platform/edition and activation notes**; cart contains `{offerId, quantity:1}` lines; survives refresh; no browser prices as authority; no quantity picker |
| 5 | Register/login/logout + session persistence | Private endpoints gated, cookie works via deployed same-origin `/api`, wrong password handled |
| 6 | Read-only cart quote + purchase transaction, simulated payment | **Buyer-first transaction locking and final total before order insertion**; reject quantity other than 1; line-price changes, stock shortage, same-key duplicate/retry, concurrent last key, rollback, wrong-offer key FK tests pass |
| 7 | Order list + owner-only key reveal + cart cleared only after success | End-to-end checkout delivers fake key; buyer B cannot read buyer A's order |
| 8 | Visual fidelity, accessibility, documentation and final public deployment smoke | Desktop/mobile screens polished; fresh-clone setup, public URL, README and complete AI history verified |

**Deploy early:** by slice 2 deploy frontend/API/DB and verify `/readyz`, API proxy and cookie routing setup (full auth smoke at slice 5). Deployment is not a last-day task.

## Original employer requirements mapped to evidence

| PDF requirement | Evidence |
|---|---|
| Store browse, filters, order, name search | Slice 1 API tests + slice 2 UI demo |
| Dynamic independent home blocks | Slice 3 services/DB/UI integration proof |
| Global tolerant search | Slices 1–2 search tests and navbar demo |
| Product details and offers from multiple sellers | Slice 4 seller table and browser behavior |
| Cart, simulated payment, delivery of digital key | Slices 4, 6 and 7 end-to-end demo |
| Register/sign in; protected checkout/orders | Slices 5 and 7 authorization tests |
| Eneba styling | Slice 8 screenshots, responsive/keyboard audit |
| React with TypeScript; PHP or Go backend; any DB | Build output, deployed Go API, PostgreSQL migrations |
| GitHub, live public app, **full AI conversations** | Final submission audit; transcript saved continuously |

## Critical cross-module tests (must actually run)

1. DB rejects an order item whose `offer_id` belongs to a different key's `offer_id` (`ordered_key_matches_offer` FK).
2. DB rejects duplicate use of the same digital key; **key availability derives from order_items** (no unsynchronized sold flags).
2a. Sold-out active SKU is present in default store/search results, with no purchasable price and disabled CTA; available-only price filters omit it.
3. Two users try last key simultaneously → exactly one order committed; other gets 409; no duplicate keys.
4. Same buyer retries same UUID/payload while first request is running or after timeout → same committed order; not a second purchase. **Buyer row is locked first, before offer rows.**
5. Same UUID with different cart → `409 IDEMPOTENCY_CONFLICT`.
6. Seller changes one offer price between quote and purchase, even if total is coincidentally unchanged → `409 PRICE_CHANGED` before allocating keys.
7. A failure mid-checkout rolls back entire order and all items; key remains purchasable.
8. Buyer B guessing buyer A's order ID → 404 (or documented 403); zero key leakage.
9. Catalog price filter + sort + pagination use the lowest **in-stock** seller price and stable sort, without N+1.
10. Public incognito browser: browse → search → product → cart → register/login → quote → simulate purchase → retrieve key → reload → order still exists.
11. Order insert uses **final server-verified total**; no placeholder total or temporarily inconsistent orders schema.
12. Product screen conveys platform, region, edition, activation and seller rating; key is copyable only by owner.
13. Three real app screenshots (home, catalog, product/checkout) reviewed at 360px and desktop; no inert nav links or mismatched UI labels.

## Engineering quality gates

- Go: `gofmt`, `go test ./...`, `go vet ./...`, `go build ./...`.
- React: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` (create the scripts as part of app setup).
- SQL: execute migrations and critical FK/unique/transaction tests on **real PostgreSQL**, not only mocks. Until run, DDL is a proposal.
- Security: origin checks, no SQL concatenation, passwords hashed, cookie secret not logged, owner-only keys.
- UI: accessible focus, responsive layout, no dead features, clear states. Use `SCOPE_AND_UI_ACCEPTANCE.md` from the first frontend slice; visual consistency is **not** a final-only activity.
- Always distinguish **tested**, **manually checked**, **not yet tested**. Never invent timing metrics or passing tests.

## Deferred feature activation gate (not a core slice)

Reviews and multi-unit purchases stay **out of every slice above**. After all employer requirements, deployment, mobile checks and full AI-history evidence pass, the user may explicitly approve **one** extension. Read `FUTURE_MEDIUM_FEATURES.md`; write a new dedicated slice, schema migration (if necessary), security tests, UI acceptance criteria and regression tests before coding. Adding one extension must not destabilize the tested core or delay submission.

## Scope emergency rule

Do **not** cut the purchase integrity tests, deployed sign-in proof, live URL or full AI transcript. Instead trim animations, autocomplete, additional products and visual gimmicks. No payment provider, refactors for hypothetical scale or extra design patterns while mandatory behavior remains incomplete.
