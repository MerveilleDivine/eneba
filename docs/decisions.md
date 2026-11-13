# Adopted engineering decisions

These decisions describe the implementation. The supplied blueprint remains unchanged under reference.

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

## Catalog frontend response contract

A successful catalog response must match its requested page and page size and contain the exact number of products implied by the total. An out-of-range page can legitimately return an empty array while retaining the total. Product identifiers must be distinct within a page; prices must be positive, JavaScript-safe integer cents or null for sold-out items. The frontend accepts the supported platform and region values and only root-relative asset paths or HTTPS cover URLs. The Go API remains authoritative for catalog business rules; this boundary detects inconsistent transport data without duplicating SQL or pricing logic.

## Evidence before claims

Local checks, browser observations, remote CI, and public deployment are distinct evidence. Document pending checks rather than inferring that generated configuration has worked. Preserve complete user prompts and visible assistant responses, including user-input decisions, without hidden model reasoning or credentials.
