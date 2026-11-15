# Adopted engineering decisions

These decisions describe the implementation. The supplied blueprint remains unchanged under reference.

**Hosting decision update (14 November 2026):** the user selected Neon PostgreSQL as the proposed database host with Render Go and Vercel web. Earlier Supabase-specific paragraphs below document historical design assumptions and existing maintenance safeguards; they are not a claim that Supabase was provisioned or remains the deployment target. PostgreSQL provider compatibility, credentials/roles, SSL, endpoint identity, and cold-start behavior still require hosted verification. This checkpoint makes no deployment changes.

## One modular Go API

Checkout, key allocation, and idempotency need one PostgreSQL transaction. One deployable keeps that boundary explicit. Feature ownership gives us understandable modules without adding distributed infrastructure. Constructor wiring lives in cmd/server; shared HTTP helpers do not import feature packages.

Prefer direct code to extra layers. Isolate unavoidable complexity in stable boundaries: scripts for native tooling and database/maintenance for provisioning, Goose, and seeds. The server does not import maintenance code. Feature services will use small behavior contracts only when a real boundary needs them. Compatibility assumptions and pending checks are recorded rather than treated as proven.

## Native tools with an isolated local cluster

Use checksum-pinned project-local PostgreSQL 18.7 binaries and a checkout-owned cluster on loopback port 5433. Administrator access to the existing service was unavailable, so a separate cluster gives reproducible setup without modifying other applications' databases. The project cluster was originally created with installed 18.6 binaries; patch updates preserve its data after a local backup. The original installed service is outside this update's scope.

Go and Node are versioned local installations with verified archive checksums. This costs some checkout-local disk/cache space and avoids changing toolchains used by other projects.

The selected TypeScript version is 6.0.3 because the current TypeScript ESLint release supports versions below 6.1; the newest TypeScript 7 release is incompatible with that range. Runtime dependencies and tool versions are pinned in the lockfiles.

The root overrides minimatch to 11.0.1 only for ESLint, config-array and TypeScript-ESLint's parser infrastructure to address [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). Version 11 removes APIs, so this is a deliberate cross-major override: the current consumers use retained constructors and match methods; test:tooling verifies discovery, ignored output and actual rule execution. Linux CI repeats it. Remove these overrides when parent packages require a patched version themselves; do not run audit fix --force to downgrade the lint stack.

## Direct PostgreSQL access and one migration authority

Use pgx for explicit SQL and Goose for version tracking. Supabase supplies PostgreSQL hosting rather than application authentication or browser data access. A second migration history would create competing sources of truth.

Schema ownership and runtime access use separate logins. Local development and integration tests also have separate databases/logins. Environment-specific grants are applied by the explicit migration command after Goose, rather than embedding local role names into portable schema SQL. Before Goose starts, require matching explicit endpoints/databases (and Supabase pooler project suffixes), reject multi-host configurations, and authenticate both identities. Using different direct/pooler endpoints for owner and application is intentionally unsupported rather than inferred to be safe.

Local provisioning persists recovery credentials before resource creation because CREATE DATABASE and a filesystem write cannot share a transaction. Failures keep the ignored recovery file for inspection; successful completion publishes .env exclusively. There is no automatic adoption, destructive cleanup or hidden retry state machine.

Goose's operational ledger is explicitly qualified as public.goose_db_version. Application DDL uses the private search path, so bookkeeping must not depend on that path. A real-database run caught this boundary before the initial migration was accepted.

## Private schema and explicit maintenance

Marketplace data belongs to the unexposed marketplace schema. The dedicated hosted project's unused Data API must be disabled before deployment. Go owns authorization; Supabase Auth policies would not describe our opaque Go sessions.

Application startup does not perform maintenance. Migration/seed failures remain explicit setup failures rather than partially starting an application that silently changes data.

## Immutable fixture history

A seed_versions table records each fixture filename and SHA-256. Applied files are checked and skipped; edited versions fail. This small operational ledger prevents repeated setup from replenishing allocated or deliberately removed demo keys. It is separate from purchase idempotency and introduces no new business state.

## Blueprint clarifications

- SKU identity includes edition alongside game, platform, and region.
- Keep one unit per selected offer and the v1 order/offer uniqueness constraint.
- Preserve composite key/offer identity and unique key allocation in the database.
- The pgcrypto extension is unnecessary for the supported PostgreSQL versions' built-in gen_random_uuid. Keep pg_trgm for the planned search.
- Future migration examples do not reserve a particular numeric version.
- Development proceeds one reviewed checkpoint at a time within each slice. Passing checks alone do not constitute architectural acceptance or authorization to proceed to the next checkpoint.

## Contracts grow with implemented behavior

The foundation introduced health and readiness. Slice 1 added public catalog projections and query rules; the Slice 2 draft now renders a routed catalog with a shared header. The temporary connection-check screen was replaced, so the frontend no longer makes a preliminary readiness request. Feature DTOs, business errors, authentication, and state management are introduced with their owning slices. Architecture and visual acceptance are separate from CI success.

## Frontend composition and design freedom

The app composes routing, shared layout and feature-owned UI. The header owns navigation and the location of its search slot, while the catalog owns search behavior and styling. Shared modules must not import features; lint enforces this direction. React Router supplies active-link semantics instead of manually mirroring route state. Component styling stays local so visual changes do not require changing business or transport code. The app remains a draft until visual and public deployment checks pass.

## Catalog interaction-state ownership

The catalog URL is the single source of truth for applied search and filters. The header keeps an uncommitted native input draft, without mirroring it in React state or recreating the input for every debounced query. Debounced search commits via navigation and preserves focus. External navigation (Back/Forward, filter changes, and even navigation to the same URL) cancels pending work and restores the applied URL; this uses the router location key as well as the path and search. Search-created history entries explicitly mark their origin through React Router state, instead of requiring a mutable URL-matching ref; Back/Forward and ordinary links still restore the applied query. Input-method composition never schedules a partial search, and submitting an unchanged query normalizes the displayed text. The catalog request effect cancels obsolete requests; regression tests check that stale responses cannot replace the latest view. These are behavioral invariants rather than reasons to add a global state library.

## Catalog reads and consistency

The catalog owns one validated read use case and one SQL repository, wired with concrete constructors. No interface is needed for tests because query behavior is exercised against PostgreSQL and validation is a plain function. DTOs are feature-owned read projections; there is no generic entity/repository layer.

Count and page use the same filtered SQL in a read-only repeatable-read transaction. This costs two data reads plus transaction commands, keeps their snapshot consistent and preserves totals on empty pages without elaborate window-count mapping. Availability and lowest prices come from active offers with unallocated keys, before filters/sorting/pagination. This snapshot does not reserve inventory; later quote/checkout still verifies current server prices and stock.

Integer cents must fit JavaScript's safe range at the request and projection boundaries. Search uses literal escaped ILIKE and a fixed word_similarity threshold of 0.4 for three-or-more-character queries. At demo scale, bounded set-based scans are an explicit cost; the fuzzy function is not presented as an indexed search. Query deadlines, stable ties and real database tests give us useful guarantees before adding optimization or another service.

## Catalog facets and cross-layer contract changes

The frontend URL contract owns the supported platform and region values used by search, filters, and response validation. One feature-owned label mapping supplies their human-readable names to filters and product cards; typed exhaustive mappings prevent UI labels drifting from accepted values. The backend independently validates those values, while PostgreSQL constraints prevent invalid stored SKUs. These checks protect different trust boundaries and must not be removed simply to eliminate textual repetition.

When a platform or region changes, update the PostgreSQL constraint through a new migration, Go query validation, and the frontend contract together. Browser integration tests exercise every frontend-supported platform, region and sort against the real Go API; database integration tests check that the supported platform and region values are insertable. This detects drift without introducing runtime schema fetches, generated clients, or a second migration authority. Search length, money, pagination bounds and defaults remain boundary-specific, with targeted tests for the shared invariants.

## Filter drafts and applied URL state

Catalog filters keep one local price draft for unsubmitted user input. Applied prices remain authoritative in the URL: when the applied price range changes, the draft resets to those values without remounting the filter controls. Unrelated platform, region, sorting and search changes preserve unfinished price edits; Clear all explicitly clears them even when no price range was previously applied. Invalid price input stays local until corrected, and unchanged submissions do not create redundant navigation. This avoids additional state managers, DOM synchronization effects and keyed remounts of the entire filter panel.

## Catalog results request ownership

The catalog route parses and owns the applied URL query and renders persistent filters. A results view keyed by the canonical request path owns its own loading, ready, failed and retry state. Changing the request replaces only the results view; the old view aborts its fetch and cannot write stale results. This removes the extra response-key field and the derived fallback loading state. Keep the results lifecycle local; do not add a generic fetching hook or state manager without a demonstrated need. The present error copy and filter draft synchronization remain separate review checkpoints.

## Architecture review after frontend cleanups 1–5

The production-facing catalog code was reviewed for change amplification, unknown dependencies, and unnecessary abstraction. Catalog query values own the frontend platform, region, and sort vocabularies, while one feature-local label mapping provides UI presentation for all three. Filter controls derive their options from those values; the API and database independently enforce the public and storage contracts. A contract update requires reviewing all three boundaries and their integration tests, not introducing a runtime metadata service.

The catalog route composes filters and a request-keyed results view. The URL holds applied state; the search input and price fields hold temporary drafts. Search navigation origin is an explicit effect dependency, avoiding a latent React Hooks lint warning. This keeps request cancellation, browser navigation and form drafts locally understandable. Remaining work is deliberately assigned to Checkpoint D (error classification/recovery) and subsequent visual and deployment acceptance. Green CI verifies automated behavior only; it does not establish live hosting or manual accessibility/device quality.

## Catalog component and visual ownership

The catalog page owns its layout, results, loading, empty/error presentation, and pagination styles. Filter/Sort owns its form-control styles; the product card owns its cover, badge, price, and card presentation. Each component imports its own CSS module; the layout does not reach into filter or card internals. Media queries and reduced-motion behaviors stay with the components they affect. Style extraction preserves the existing declarations and breakpoints rather than redesigning the storefront during an architectural cleanup.

Cover gradient variants derive deterministically from the product's stable ID instead of its position in a search or sorted list. The same product keeps its visual identity across filters, sorting, and pagination without per-product persisted state or a theme manager. Visual-device acceptance and real product artwork remain distinct from automated layout, CSS, and interaction checks.

## D3 adversarial follow-up: canonical request identity and test evidence

The query-keyed results component captures the initial query for its canonical API request.
Equivalent URL spellings retain the same component and request rather than refetching due to
a newly parsed query object. A changed canonical request still remounts and cancels the
obsolete request. The request-owner timeout and retry state machine are unchanged.

Adversarial tests now cover equivalent URLs with both pending and settled requests, a late
successful response after a timeout while a newer retry is pending, and Strict Mode effect
replay. Lifecycle fixtures align with the seeded product platform and region identities.
The browser test coordinates obsolete request delivery explicitly and distinguishes
intentional browser cancellation from unexpected route errors; fixed delays are not used
to prove the race. Full deployment and manual device acceptance remain separate evidence.

## Catalog recovery and cancellation verification (Checkpoint D3)

The catalog request lifecycle stays local to the results view and relies on a query-keyed
component identity, an abort controller, and a six-second deadline. D3 tests the behavior
under intentionally hostile ordering rather than adding another state manager or transport
abstraction. Acceptance includes A-to-B-to-A navigation with out-of-order responses, an old
request rejecting after a newer query succeeds, retries while the timed-out request rejects,
slow response-body parsing after the deadline, route departure canceling obsolete requests,
and avoiding a timeout after successful completion. The browser suite also covers late
server errors after filters change. The newest request alone may own the visible result.

This checkpoint verifies these behaviors in the automated test environment; external
network proxies, mobile browsers, accessibility review, and deployed integrations still
require their own acceptance. Retain the current request boundary unless a test exposes
an actual correctness problem.

## Catalog frontend failure classification (Checkpoint D2)

The transport boundary classifies 400 as an invalid query, 502/503 as service unavailability,
408/504 as a request/gateway timeout, unexpected HTTP or malformed JSON as unexpected, and
browser network failures as network errors. Failure while reading a successful response body
is a network error only for a TypeError; invalid JSON remains unexpected. Aborted reads
propagate cancellation rather than being misreported as network failures.

The results view owns its six-second client-side deadline. It aborts at that deadline and
shows a timeout even when the underlying transport ignores AbortSignal. Responses arriving
after the deadline cannot replace the timeout state; navigating away also aborts obsolete
requests without showing their errors. Transport classification does not own this deadline.

All failures offer Retry without losing the applied query. Rejected queries with non-default
catalog options additionally offer Reset filters. A rejected default query instead explains
that the catalog could not be opened and suggests retrying or choosing another search or
platform. The UI never shows raw HTTP bodies, backend messages, or JavaScript exceptions.
The catalog feature owns its messages and actions without a generic notification framework.

Timeout, cancellation, gateway, and response-body failure paths have focused regression
coverage. D3 remains the broader adversarial recovery and overlapping-request review.

## Catalog frontend response contract

A successful catalog response must match its requested page and page size and contain the exact number of products implied by the total. An out-of-range page can legitimately return an empty array while retaining the total. Product identifiers must be distinct within a page; prices must be positive, JavaScript-safe integer cents or null for sold-out items. The frontend accepts the supported platform and region values and only root-relative asset paths or HTTPS cover URLs. The Go API remains authoritative for catalog business rules; this boundary detects inconsistent transport data without duplicating SQL or pricing logic.

## Slice 2 final architectural review (Checkpoint D5)

Reviewed catalog URL and draft-state ownership, API/request lifecycle, feature and shared-module
boundaries, Go handler/service/repository separation, PostgreSQL inventory and price projections,
CSS module ownership, API-to-browser acceptance, and automated accessibility/responsive checks.
The feature's URL remains the authority for applied controls; query-keyed results own fetch/retry
and timeout state; temporary search and price drafts stay local. Shared layout does not import
catalog feature code. Handler validation and database constraints deliberately repeat policy at
different trust boundaries; they are not accidental duplication.

The review found no demonstrated need for global state, generalized fetching, a new repository
interface, service decomposition, or a cross-layer DTO generator. It consolidated a duplicate
`resultsToolbar` CSS block and a duplicate `filterHeading` block without changing their
effective style. The prior D3 canonical-request, cancellation, retry, and fixture defects already
have dedicated regression coverage. D4 confirms real PostgreSQL inventory and search values
through Go, the same-origin development proxy, and Chromium.

Remaining user-experience and delivery limitations are explicit: product-card navigation,
seller offers, authentication, cart and checkout are later slices, not inert placeholder controls.
The reusable seed cover treatment is an interim catalog visual; original/licensed artwork and
hands-on mobile and accessibility review remain separate visual acceptance. A public HTTPS
frontend/API/database deployment was not made; the user deferred it. This prevents declaring
Slice 2 fully released even with passing automated checks. Any future contract extension must
update API, schema, and frontend compatibility checks together.

## Pre-merge catalog correctness review

The final Slice 2 review verified and corrected two boundary inconsistencies. Monetary
display previously divided safe integer cents by 100, losing cent precision near the
supported maximum. It now uses BigInt for the whole-euro/fraction split and the same
locale formatter for separators and currency symbols; accepted cents remain exact.
The header search formerly used HTML maxlength=100, which counts UTF-16 code units
instead of the 100 Unicode code points accepted by the frontend URL parser and Go
API. Search now caps code points without splitting surrogate pairs and waits until
composition ends before enforcing that limit. Regression tests cover both boundaries.

No other application feature was added during this review. Automated acceptance
remains distinct from visual/device review and public hosting. Product-card detail
navigation, purchasing and authentication remain later vertical slices; do not
introduce inert UI controls to imply otherwise.

## Evidence before claims

Local checks, browser observations, remote CI, and public deployment are distinct evidence. Document pending checks rather than inferring that generated configuration has worked. Preserve complete user prompts and visible assistant responses, including user-input decisions, without hidden model reasoning or credentials.

## Slice 2 independent audit and visual completion (14 November)

Keep the established URL/draft/request ownership and concrete backend wiring. The
audit demonstrated two small lifecycle defects: sorting remounted its own focused
control, and a cover failure disabled all subsequent image URLs. Persistent controls
now sit outside the canonical-request key; image failure belongs to a URL. Request
state, retry state and the six-second deadline remain inside the keyed results.

Keyboard recovery focuses the persistent results heading before pagination, retry
or result-reset actions remove their initiating control. Modified links retain
ordinary browser behavior. Clearing filters focuses the first filter; price errors
are associated with the inputs and focus the field needing correction. The skip
target is programmatically focusable without entering the normal tab order. The
brand link takes its accessible name from its content instead of repeating it in
an ARIA override. No global focus manager or navigation state was introduced.

Sixteen original generated covers replace the interim shared cover. Their prompts,
checksums and export settings are recorded in `docs/assets/`. New immutable seed
002 changes known fixture covers only, preserving customized artwork and all
purchases and inventory. It does not change migration 001 or seed 001. The API
continues supplying URLs; the frontend contains no fixture-to-asset mapping.
WebP exports and lazy loading bound the artwork cost without adding an image
service or build dependency. Card information uses flex layout to align prices
when badges wrap; control borders share one contrast-conscious design token.

`@axe-core/playwright` 4.14.0 is a pinned test-only dependency, compatible with the
project's Node 22.23.5 and existing Playwright. It provides repeatable scans of
catalog states and viewports using the
[documented Playwright integration](https://playwright.dev/docs/accessibility-testing).
No rules or elements are excluded. Keyboard behavior and screenshot review remain
separate evidence; automated scans do not certify complete accessibility.

The user explicitly deferred hosting and authorized completing E/F in this review.
Continue on the existing feature branch, keep a follow-up draft PR, and stop after
Slice 2. Do not merge, create another development branch, change deployment
infrastructure or begin Slice 3 without further authorization.

## Slice 3A — adopted homepage boundaries (design, not implementation)

The independently sourced homepage follows archived Blueprint v3.2, not a hardcoded promotional catalog response. Three existing tables (homepage_banners, homepage_best_sellers and homepage_deals) each own their content and one public GET endpoint. Three small services belong to the future home feature within the **same Go application and pgx pool**, not three deployables. Service, repository and handler boundaries follow the existing catalog pattern. Do not create unused interfaces, abstractions, or folders during 3A.

The best-seller rank comes from explicitly **fictional** seeded demo_weekly_sales. Its product card availability and lowest in-stock seller price must match the catalog. A deal refers to one selected seller offer; its savings must be calculated against **that same offer's** higher list price, never against a different seller's lowest catalog price. Stock allocation stays defined solely by order_items references to digital_keys. A single small shared read boundary may be introduced only when an actual implementation demonstrates a need; correctness tests are mandatory either way.

At 3B, / becomes the real homepage, /catalog remains a deep-link-safe catalog, and global search continues to navigate into its canonical query state. The header brand and explicit Home navigation may then point to /. Until Slice 4 there are no product-detail purchase destinations or fake buy actions; all displayed links must lead to existing useful routes. Banner destinations require a strict safe internal-route policy. Use a new immutable seed for the old /store banner link and original artwork; never revise applied seed 001/002.

The three sections independently load and recover from failures. Their public transport and payload rules, ordering, finite limits, source-update tests and the stop gates for 3B–3E are in [Home API](api/home.md) and [Phase 3 design](verification/slice-3-design.md). The user has authorized **3.0 and 3A only** at this stage. No homepage feature code, data migration, frontend route, deployment infrastructure or main merge was changed by this decision record.

## Slice 3B — implemented banner ownership

The promotional homepage is one vertical slice backed by marketplace.homepage_banners. The Go banner repository owns one bounded SQL query; the service owns source and URL validation; the handler owns GET/HEAD and safe public failures. It stays within the existing Go process and PostgreSQL database. Catalog and banners now share database.ClassifyReadError for identical network/connection semantics without duplicated classifiers.

The root path is the real homepage, the brand/Home link points to it, and /catalog plus global search retain their behavior. Banner text, illustration URL and destination originate from the API. The original hardcoded marketing teaser was deliberately removed: every promotional homepage block must have its own source. Static interaction labels and failure messages are interface copy, not fake promotional data.

Seed 003 conditionally corrects the original /store fixture link and placeholder illustration without rewriting previous seeds or customizing users' banners. The committed hero asset is an original static SVG. Unsafe links fail closed; valid catalog query links are checked by the catalog owner. Retry preserves keyboard focus on its loading state and returns focus to the resulting heading.

Best sellers, deals, cart, product details, authentication, checkout, production hosting and merges remain outside 3B.

## Slice 3C — independent best-seller ranking, shared availability semantics

The source for Best Sellers is **only** `marketplace.homepage_best_sellers`, joined to active products and the shared available-price projection. A separate BestSellerService/Repository/Handler inside the existing Go API preserves independent ownership and bounded reads. Ranking uses seeded fictional weekly counts with stable normalized name and product-ID ties, never the catalog's sort order or invented production analytics.

The canonical lowest active, unallocated-key offer price predicate previously embedded in catalog SQL is now a single reused CTE in `api/internal/marketplace`. The catalog service's validated EUR-cent/availability projection is reused by Best Sellers instead of reimplementing its stock and money rules. This sharing arises from two concrete consumers, not a speculative framework.

React independently fetches and retries Best Sellers, while the banner stays available if ranking fails. Existing ProductCard presentation is reused without creating unsupported product pages or purchase actions. The UI explicitly labels the fictional demo ranking and navigates to valid catalog searches. No schema, fixtures, supplier offer data, buyer state or deployment change was required.


## Phase 3D — seller-offer Deals are not catalog prices

The homepage Deals section is keyed by homepage_deals.offer_id and joins that exact active seller offer and product. Its current/list price and rounded-down discount belong exclusively to that offer; the lowest catalog price is a different product-level read projection and must not be reused here. Eligible offers require an unallocated key for their own offer ID, with the stock-existence SQL predicate shared by catalog/Best Sellers and Deals. Seller-specific text, cover paths and safe cent bounds are independently validated. The section loads independently, does not reveal key codes, and links to catalog search without pretending to select an offer. No migrations, inventory refills, extra server processes, global state or placeholder checkout actions were introduced. Verify the current feature branch in CI before treating this implementation as accepted.
