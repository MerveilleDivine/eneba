# Slice 3 — readiness, architecture and acceptance plan

14 November 2026. **Scope: Phase 3.0/3A design and Phase 3B banner implementation handoff.** The 3.0 baseline below describes the historical pre-implementation state; the 3B record at the end describes what has since changed. The archived Blueprint v3.2 remains immutable, and the original employer PDF has precedence over interpretations. Do not present proposed endpoints or data structures below as deployed or tested.

## Phase 3.0 — actual starting state

- Existing branch: feature/slice-2-catalog, draft PR #2 open and unmerged.
- Starting remote head: 126ae42b09c7d9a382e5706befccd2f9beeacd35. Both PostgreSQL 17.12 and 18.7 jobs passed on [CI run 43618705963](https://github.com/MerveilleDivine/eneba/actions/runs/43618705963): 97 frontend unit tests, 51 Chromium checks, PostgreSQL integration, auditing and Go race checks.
- The feature branch and main have diverged; no rebase, branch creation or merge is authorized. The remote GitHub snapshot cannot attest to uncommitted changes in a user's local checkout.
- Current frontend: React Router root redirects to /catalog. The live routes are /catalog and not-found. The shared header has a working search from other pages; the brand points to /catalog. Product cards are informational until product details arrive in Slice 4.
- Current backend: one Go application, real PostgreSQL catalog read with stock-aware lowest-price semantics, /healthz, /readyz, and /api/v1/products. No homepage HTTP handlers or home feature package exists.
- Existing database schema already contains independent marketplace.homepage_banners, marketplace.homepage_best_sellers and marketplace.homepage_deals tables. Seed 001 supplies one banner, four fictional weekly best sellers and three selected offers with list-price discounts. Seed 002 adds sixteen original WebP catalog covers. Existing migrations and applied seed files are immutable.
- Two concrete future data corrections: seed 001's banner currently links to /store, which is not a route, and its /images/demo-cover.svg placeholder is not an adequate dedicated hero image. Create an immutable seed 003 in 3B **only after** the final banner artwork and route are defined; do not edit seeds 001/002 or replenish inventory.
- The active README now records Neon PostgreSQL, Render Go and Vercel frontend as the proposed production hosts, but no hosting resources have been provisioned or verified. Some historical decision notes still refer to Supabase; those are not current deployment instructions. Hosted HTTPS/cookies and cold starts remain future release gates.

**3.0 conclusion:** the prerequisites for architectural design are present. We need neither three deployables nor an additional schema migration for the already-created home tables. Existing code and the latest verified baseline are preserved. No claim is made about a public deployment, physical-device testing, or a fresh local run during this documentation-only checkpoint.

## Phase 3A — source of truth and measurable outcome

The employer's original two-page PDF is stored at docs/reference/blueprint-v3.2/reference/Eneba Internship Assignment.pdf. On 14 November, its embedded text was independently extracted from the binary PDF and checked against the archived ACCEPTANCE_AND_SLICES.md, DECISIONS_AND_DOMAIN.md and SCOPE_AND_UI_ACCEPTANCE.md. The PDF says each homepage block gets content from its **own backend service or database**; three services in one Go API and three existing tables is our stricter design choice, not a requirement for three separately deployed applications. The PDF also says the page should match Eneba's styling, and explicitly makes a public URL, GitHub link and full prompts/responses conversation history mandatory submission deliverables. The employer's seven-day deadline is relative to receipt; the received email's 16 November date remains the practical submission target. The adopted implementation interpretation is:

- Show three independently backend-sourced homepage blocks: banners, best sellers, deals.
- Each owns a separate backend service, query and public GET endpoint, backed by its respective table. They share one PostgreSQL database and one Go process. Changing one source table must affect only its block's content.
- Render attractive, original/licensed artwork with the existing purple/lime design system and the unofficial-demo disclosure. No scraped game assets or real/redeemable keys.
- Use correct product identity: game, edition, platform and region. Best sellers are ordered by **explicitly fictional seeded demo weekly sales**, never inferred from unrelated catalog sorting or claimed to be live retail sales.
- Deals are identified by **seller offer**, not by the game's minimum catalog price. Show a discount only when list_price_cents > price_cents, the offer and product are active and genuine unallocated inventory is available.
- Preserve shared search, working catalog navigation, responsive layouts, keyboard access, partial failure recovery, reliable prices and the ability to explain the architecture.
- The PDF's embedded buyer-journey diagram was separately inspected: **Homepage or Search → Product page → Cart → Checkout (sign-in required) → Payment → Order and key**, with Eneba-style presentation throughout. Slice 3 supplies the homepage entry point only; subsequent slices must complete those actual routes and never imply a functioning purchase flow prematurely.

The complete API proposal and edge cases live in [Home API contract](../api/home.md). Do not build them from this document until 3B is authorized.

## Architectural decisions to implement incrementally

**Go module ownership:** create api/internal/home only in 3B; organize three focused services/queries and lean handlers under that feature. Keep real SQL in feature repositories, domain selection and input/output policy in services, and HTTP translation in handlers. Construct dependencies in api/cmd/server/main.go. Continue to use net/http routing helpers, pgx and the existing pool; do not add an ORM, generic repository, CMS, separate servers, unneeded interfaces, or circular package imports.

**Stock and pricing:** use the same inventory truth as catalog: a demo key is available if it is not referenced by marketplace.order_items. The best-seller projection must agree with catalog lowest **in-stock active-offer** price and sold-out state. Deal price is instead the selected **offer's** authoritative price, with list-price comparison tied to that same offer. Avoid a second contradictory business rule. A narrow reuse boundary may be extracted once a genuine second consumer is implemented; do not build a large shared query framework merely to eliminate a few SQL lines. Cross-feature PostgreSQL assertions must catch semantic drift.

**Independent data access:** each endpoint is queried separately and has its own bounded result count and deterministic ordering. No N+1 query per displayed card, no hardcoded React fixture arrays or fake offer IDs, and no mixing source-table updates in one endpoint. Each read must be safe during concurrent inventory allocation; a coherent SQL snapshot is sufficient for the scope, with transactional consistency when multiple statements require it.

**React ownership:** compose HomePage from independently loaded sections owned by web/src/features/home. Share design tokens and the existing layout. When a second real consumer of product-card presentation exists, extract only the minimal presentation boundary required so home does not depend on catalog page/request state. Keep money formatting and stock badges consistent with the established catalog representation. Do not add Redux/TanStack Query or a global fetch abstraction without a demonstrated requirement.

**Navigation:** replace the root redirect with a genuine / route at 3B. Keep /catalog and its canonical query parsing intact. The global search must submit from the homepage to /catalog?q=..., preserving existing history, Unicode and keyboard behavior. Repoint the brand/Home navigation to / while leaving catalog navigation available. Prior to Slice 4, do **not** create fake /product routes, buy buttons or other inert actions. Links from cards/deals must target a meaningful existing catalog view; the banner destination must be allowlisted and proven to resolve.

**Failure isolation:** a failed deals fetch must not blank banners or best sellers. Each block has purposeful loading, empty, error and retry states; aborted/obsolete responses cannot overwrite new state. Use generic safe failure copy, no leaked DB detail, and accessible announcements/focus. Keep the current six-second catalog timeout unchanged during 3A; the Render free-tier wake-up flow must be verified and adjusted with deployment evidence later rather than guessing a cold-start duration.

**Security and assets:** do not return keys, sensitive IDs, raw server errors or private inventory details. Validate internal promotional destinations and image URL schemes; prefer original same-origin assets with reserved dimensions and responsive loading. Treat editable DB banner text as untrusted content rendered as text, never HTML.

## Checkpoint sequence and stop gates

### 3B — Banner vertical slice

- Small Banner repository/service/handler with GET /api/v1/home/banners; actual active records ordered by position, bounded and validated.
- New immutable demo seed with corrected internal link and dedicated, original hero artwork. No changes to original seed history.
- Homepage route, banner layout, header Home and Browse navigation and working global search; only finished sections are rendered.
- Test response shape, limits, ordering and empty/failure cases. For repository-level tests, read and change a banner through the **same** rolled-back test transaction. For actual HTTP change-propagation tests, temporarily **commit** a change only in isolated `eneba_test`, read it through the independently connected API, and restore the original fixture with deterministic cleanup; an uncommitted row update cannot be observed by a different pooled HTTP connection. Test the isolation of other sections once their endpoints exist.
- Stop, audit architectural and accessibility weaknesses, run relevant tests, commit and obtain approval before 3C.

### 3C — Best-sellers vertical slice

- Separate ranked product read and service using homepage_best_sellers; active product filter, deterministic count/name/id ordering and stock-aware price projection.
- Render reuse of product cards, sold-out semantics and demo-sales disclosure; links to working catalog destinations.
- Test active/inactive, duplicate/tie, ranking changes, sold-out, price consistency with catalog and bounded non-N+1 reads; one section fails without affecting banner.
- Stop and independently review/verify before 3D.

### 3D — Deals vertical slice

- Separate offer-based query/service from homepage_deals; only active products/offers with positive current prices, higher list prices and unallocated keys can be presented as live deals.
- Display the selected offer's seller, current/list price and accurately computed integer discount percentage; never substitute a different seller's lower catalog price.
- Test invalid discount, exhausted stock, changed price, inactive offer, ordering, duplicate SKU behavior and independently updated deals source. Use exact EUR cents.
- Stop and independently review/verify before 3E.

### 3E — Cross-layer acceptance

- Verify independently updated database source tables using controlled committed fixture changes inside `eneba_test` with explicit restoration, while transaction-scoped repository tests may roll back when the same transaction is used. Check isolated 503/timeout/malformed-response behavior; real React → Go → PostgreSQL browser journeys; catalog and header regressions.
- Run 320/360/768/1280px desktop/tablet/mobile checks, 200% text, keyboard, reduced-motion and automated WCAG A/AA scans; inspect actual hero crop and card density.
- Run formatting, frontend type/lint/unit/build, Go vet/unit/build, real PostgreSQL integration, browser tests and race/audit checks on both supported PostgreSQL CI versions. Record concrete failures and corrections; repeat on the exact final head.
- Document actual verification, reviewer-visible screenshots, pending physical-device/screen-reader evidence and public deployment limitations. Keep PR draft/unmerged unless explicitly approved.

## 3A approval criteria

- [x] Existing code/seed/schema boundaries and preflight CI baseline inspected.
- [x] Three independent content sources, endpoint ownership and exact public data contracts designed.
- [x] Product price vs seller-offer deal price semantics distinguished and testable.
- [x] Unimplemented product/cart/auth/checkout links and inactive UI explicitly excluded.
- [x] Independent failure handling, deep-link/search behavior and mobile-accessibility acceptance specified.
- [x] Concrete 3B–3E tests and stop gates documented without speculative source files.
- [x] Employer PDF direct check: both pages' embedded text was extracted from the original binary PDF, and the embedded buyer-journey figure was decoded and inspected. Homepage ownership, technology allowance, styling, sign-in/purchase flow and mandatory deliverables match the adopted plan. Whole PDF pages were not rasterized here; the independent UI visual sign-off remains part of 3E.
- [ ] Approval to begin 3B (outside current authorization).

This document is design evidence, not a claim that new routes, services, images, seeds or browser behavior exist.

## Independent pre-3B entry review

14 November 2026; **read-only repository audit and PDF source comparison, followed by documentation of the entry gate.** No homepage handlers, routes, React UI, assets or fixture changes are authorized by this review.

- **Original employer PDF:** directly extracted both pages from `docs/reference/blueprint-v3.2/reference/Eneba Internship Assignment.pdf`. The homepage must assemble multiple blocks whose data comes from their own backend service **or** database; no promotional content is hardcoded into React. Go/REST and React/TypeScript are allowed. The assignment also requires catalog/search/product/seller choice, cart and simulated checkout, account protection, Eneba-like styling, a free-tier public URL, GitHub link and **full prompts and responses**. The separate buyer-flow illustration is accounted for in the design above. The document asks for completion within seven days of receipt; submission scheduling follows the actual individual invitation, not a public job-listing deadline.
- **Existing schema:** the three homepage tables already exist in migration 001. Banner position is nonnegative/unique; its active flag determines visibility. No new migration or generic persistence framework is warranted for 3B.
- **Immutable seed constraint:** `db/seeds/001_demo.sql` still contains known fixture banner `50000000-0000-4000-8000-000000000001` linking to `/store` and `/images/demo-cover.svg`. The seed runner checks SHA-256 and never reapplies applied versions. At 3B create only the next available new version, updating that **known unchanged row** when it still has the old link and/or placeholder. Preserve any customized content and never alter existing seed files or inventory.
- **Navigation:** root currently redirects to `/catalog`; header brand also points there. 3B changes only the root to the real homepage and adds purposeful Home navigation; `/catalog`, canonical query URLs, keyboard behavior, search and not-found routes remain functional. Do not render inactive best-seller/deal sections or fictitious product-detail/buy buttons before their checkpoints.
- **Banner trust boundary:** DB text is untrusted; render escaped text, enforce finite headline/subheading lengths and a strict **parsed** allowlist for real internal destinations (`/`, `/catalog` and validated `/catalog?...`). Reject protocol-relative, absolute, encoded-bypass, control-character, unknown route and `/store` links. Image URLs require safe paths and an actual committed original/licensed asset. Invalid stored content must fail closed and generate generic client errors, not broken/unsafe clickable links or raw SQL detail.
- **3B tests:** valid/empty/inactive/invalid banners, stable position sorting and bounded reads; unsupported query/method and 503/500 error envelopes; test-only DB content changes; frontend loading/retry/timeout, header search from Home, navigation/history, accessibility and 320–1280px 200%-text layout. Independent cross-service changes can only be fully demonstrated at 3E after 3C and 3D exist. Do not weaken existing catalog tests.
- **Submission risk distinct from 3B:** `docs/ai-history/README.md` explicitly records that earlier planning chats remain to be imported. A successful banner feature does **not** satisfy the mandatory full AI-chat export or public deployment requirement. Track those as release blockers and never claim them complete until inspected.
- **Operational state:** the user-selected Vercel/Render/Neon hosting is still unprovisioned and deliberately excluded from 3B preflight. Provider-specific SSL, database roles, pool limits, Render cold starts, HTTPS cookies and deployed paths are separate release tests. No `main` merge, new branch or cloud change is part of this audit.

**Entry decision:** 3B architecture is ready for implementation with the above explicitly scoped tasks. Its success is not preapproved: implement the banner-only vertical slice, run tests and an independent weakness review, and stop before 3C.

## Phase 3B — implementation and independent review

14 November 2026. The banner-only vertical slice was implemented on feature/slice-2-catalog, with no main merge, new branch, deployment or 3C/3D work.

**Backend:** The api/internal/home package owns BannerRepository, BannerService and BannerHandler. Its repository issues one bounded PostgreSQL SELECT against homepage_banners, filtering active rows, ordering by position/id and initially limiting to three. The focused 3B hardening below now reads up to 12 bounded candidates and returns three validated banners. The service validates source text limits, internal destinations, image URLs and positions. The handler uses GET /api/v1/home/banners, a three-second context and the existing structured HTTP error envelope. Catalog query validation is reused for safe catalog links. The second live read consumer justified consolidating error classification into database.ClassifyReadError. No ORM, generic repository interface or second deployment was introduced.

**Data:** Seed 001 remains immutable. New immutable seed 003_home_banner.sql updates only the known placeholder link and image of the known fixture row and preserves customized values. It never writes keys, stock, offers or orders. The original illustrated asset is web/public/images/banners/discover-world.svg, served as decorative imagery behind backend-sourced text.

**Frontend:** Root / is the actual homepage, while /catalog retains deep links and canonical query behavior. The shared header provides Home, Browse games and global search. Banners independently fetch and validate their API data, cancel obsolete requests and expose loading, empty, failed, retry and success states. Retrying preserves focus without stealing it on initial load. Success, error and empty states have an h1. An unsourced marketing teaser was removed after review rather than violating backend-content ownership.

**Verified initial implementation:** [GitHub Actions 43628686080](https://github.com/MerveilleDivine/eneba/actions/runs/43628686080) passed PostgreSQL 17.12 and 18.7 with 101 frontend unit tests, 60 real-browser tests, real-database integration, audits and Go race checks. Earlier failures correctly exposed outdated root-redirect assertions, an incorrect retry-test locator and 320px/200%-text overflow; these were fixed without weakening assertions.

**Adversarial follow-up:** Focus after Retry, a common database read-error owner, source-only homepage content, extra bounded/ranked real-PostgreSQL fixture checks and non-clipped CTA browser assertions were implemented after that initial green run. They require a new successful exact-head CI verification; do not use the earlier green result to certify subsequent commits.

**Outstanding outside 3B:** manual visual/device and screen-reader sign-off, hosted HTTPS/proxy/Render wake-up, mandatory complete chat-history exports, public deployment and the 3C best-seller/3D deals services. Do not merge or begin 3C without further authorization.

## Focused 3B hardening after independent review

15 November 2026. Following a new independent read-only audit, the user authorized
**3B hardening only**. No 3C services, deployment, branch creation or merge are
included in this checkpoint.

- **Raw field bounds:** Previously, checks were applied to trimmed banner text;
  huge whitespace-padded values could pass. Go and TypeScript now validate raw
  headline/subheading lengths and reject control characters. PostgreSQL reads
  only at most limit + 1 characters for each text field, so unlimited stored
  text is neither fully transferred nor accidentally returned.
- **Destinations and artwork:** Banner calls to action now permit only working
  catalog routes and catalog query links, with an exact 2,048-byte raw URL
  limit. Backend and frontend image-path validation allow the same approved
  flat, same-origin SVG/WebP names, not traversal, unexpected filenames or
  external URL schemes.
- **Availability and observability:** The repository scans 12 active candidates
  in stable order; the service returns up to three validated banners. Invalid
  records are skipped without taking down other promotions. The handler logs
  only the rejected banner UUID, fixed reason category and request ID, without
  leaking untrusted text or destinations. The capped candidate read means
  later valid banners beyond the first 12 may remain undiscovered; this is a
  deliberate bound, not a claim of exhaustive scanning.
- **Tests:** Added boundary-input cases in Go and TypeScript; database integration
  now verifies invalid-row isolation, safe log details and large stored text
  rejection while restoring original fixtures. Chromium checks multi-banner
  rendering at 320px/200% text, CTA clipping, data-driven navigation and a
  deliberately delayed banner response.

**Verification gate:** Run repository formatting, Go/frontend unit/type/lint,
real-PostgreSQL integration, Chromium, race and dependency/security checks
against the **exact final commit** on PostgreSQL 17.12 and 18.7 before calling
this checkpoint complete. Record failed attempts separately from the final
verified head. Manual physical-device and screen-reader checks remain release
tasks, not CI claims.
