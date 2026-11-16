# Eneba marketplace demo

An unofficial game marketplace built as an engineering internship project. React and TypeScript provide the interface, a single Go REST API owns business rules, and PostgreSQL owns durable data and integrity constraints.

**Current milestone: Slice 3 independent audit and Slice 4 product details/seller selection, under verification in draft PR #2.** The homepage independently loads banners, Best Sellers and Deals from Go/PostgreSQL sources. Catalog and Best Sellers open product pages with SKU identity, artwork, description and real seller offers. Offer selection uses URL identity and current server data, without reserving stock or making a purchase. See the [engineering audit and delivery record](docs/verification/slice-3-audit-slice-4.md), [product API contract](docs/api/product.md) and historical [Phase 3 record](docs/verification/slice-3-design.md) for evidence and limitations. All games, ratings and keys are fictional; keys are nonredeemable. Purchasing, physical-device/screen-reader review and public deployment remain separate work.

## Verify before committing

Run `npm run hooks:install` once in a local Git checkout to enable the versioned pre-commit hook. Every subsequent local commit runs `npm run verify` first: Prettier, gofmt, tooling checks, Go vet/tests/build and frontend type/lint/tests/build. The hook refuses unstaged tracked edits and nonignored untracked files, preventing checks on a different source snapshot from what Git will commit. Fix failures before committing rather than generating CI-only correction commits. The hook does not replace the PostgreSQL integration, Chromium, vulnerability and race checks in CI. Commits created remotely through an API do not execute local Git hooks, so final exact-head CI evidence is still mandatory.

## Run locally on Windows

Prerequisites: Git and PowerShell 5.1+. The bootstrap installs project-local PostgreSQL binaries as well as Go and Node. The setup uses an isolated checkout-owned PostgreSQL cluster on loopback port 5433. An existing PostgreSQL service on port 5432 can keep running independently.

From the repository root:

```powershell
.\scripts\bootstrap.ps1
. .\scripts\environment.ps1
npm ci
npm run db:local:start
npm run db:provision
npm run db:migrate
npm run db:seed
npm run doctor
npm run dev
```

Open **http://127.0.0.1:5173/** for the database-backed promotional homepage, or **http://127.0.0.1:5173/catalog** to browse games. The API listens on port 8080. Vite proxies /api, /healthz, and /readyz to Go. Search, filters and page selection are reflected in the catalog URL.

The bootstrap downloads Go 1.27.4, Node 22.23.5 and PostgreSQL 18.7 into ignored .tools directories and verifies the archives against release checksums. It does not replace system installations. npm 10.9.9 is bundled with this Node release. Load scripts/environment.ps1 in each new terminal to select these tools and checkout-local caches.

The first toolchain extraction can take several minutes on Windows. Native Go dependencies use the Windows DNS resolver through the environment helper.

### Local database lifecycle

```powershell
npm run db:local:status
npm run db:local:stop
npm run db:local:start
```

The first start initializes .local/postgres with generated administrator credentials saved in ignored .env.bootstrap.local. Provisioning inspects names, creates eneba_dev and eneba_test with separate owner/application logins, and saves their generated connection URLs in ignored .env. Neither command prints passwords.

Provisioning is a one-time step. It refuses existing database/role names and refuses to overwrite .env or .env.provisioning.local. Generated credentials are synced to the ignored recovery file before creating any roles. Only a successful provision publishes .env and removes the redundant recovery file. On later runs, start the cluster and run migrations and seeds as needed. No command resets inventory or drops databases.

If provisioning fails, keep .env.provisioning.local private. Inspect pg_database and pg_roles for the six named project resources using local administrator access. Complete only missing resources and database grants, then copy the preserved configuration to .env after confirming both owner/application connections work. Never rerun by adopting unrelated resources, guessing passwords or dropping existing databases. A failure to publish .env retains recovery credentials and preserves an existing .env.

The existing PostgreSQL service can also be used: skip db:local:start and configure the PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, and PGSSLMODE variables in .env.bootstrap.local for an administrator on a loopback address. The same provisioning command creates only the named Eneba databases and roles. ENEBA_POSTGRES_BIN can explicitly select alternate binaries; normal project startup requires the version in .postgres-version. For a patch update, back up both project databases first, stop the project cluster, bootstrap the verified new binaries and restart. Preserve data and credentials; do not initialize a replacement cluster.

### Commands and underlying tools

| Command                  | What it runs                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| npm run doctor           | Version, dependency, private configuration, and PostgreSQL availability checks |
| npm run dev              | Both development processes, with coordinated shutdown                          |
| npm run dev:api          | go run ./cmd/server from api                                                   |
| npm run dev:web          | Vite from web                                                                  |
| npm run db:migrate       | go run ./cmd/db migrate; Goose applies pending SQL versions                    |
| npm run db:status        | Goose migration status                                                         |
| npm run db:seed          | Transactional, checksum-verified fixture versions                              |
| npm run verify           | Formatting, Go vet/test/build, frontend typecheck/lint/test/build              |
| npm run test:integration | Real-PostgreSQL integration checks using eneba_test                            |
| npm run format           | Prettier for supported source/document files; run gofmt -w api for Go          |

The Go wrapper loads the appropriate ignored environment file and invokes Go directly. Configuration is otherwise supplied by process environment. CI runs the same database and verification commands.

## Browser checks

Run npm run test:browser for isolated Chrome checks at 1280px, 768px, and 360px, including keyboard access and real API responses. Chrome uses a temporary profile.

For a manual outage check, keep the catalog open, run npm run db:local:stop, and change a filter or reload. The catalog should show a recoverable error while /readyz returns 503. Run npm run db:local:start externally and select Try again. Keep other database checks idle during this maintenance check.

Slice 2's full frontend–Go–PostgreSQL integration acceptance, evidence boundaries, and outstanding public-deployment checks are recorded in [Slice 2 integration verification](docs/verification/slice-2-integration.md).

Earlier foundation verification evidence and reviewed screenshots are recorded in docs/verification/foundation.md. The subsequent safety fixes, security update and fresh-install checks are recorded in docs/verification/foundation-repairs.md.

## Repository boundaries

- api/cmd/server constructs dependencies and owns HTTP startup/shutdown.
- api/cmd/db runs explicit provisioning, migration, status, and seed commands.
- api/internal/config validates configuration without exposing values.
- api/internal/database contains connection and readiness operations.
- api/internal/database/maintenance isolates provisioning, Goose, and fixture operations from the server's runtime dependency graph.
- api/internal/httpapi owns routing, health responses, and transport logging.
- api/internal/catalog owns catalog handlers, query policy and SQL reads; dependencies are wired explicitly in the server entry point.
- web/src/app owns route composition; web/src/shared/layout owns the global header and navigation.
- web/src/features/catalog owns typed catalog reads, URL query policy, browsing state and presentation. Catalog requests run directly; backend /readyz remains an infrastructure health endpoint, not a frontend prerequisite.
- web/src/styles contains shared visual foundations; component styles remain colocated.
- db contains application migrations and immutable fixture versions.
- docs/reference contains unchanged supplied material; docs/decisions.md records adopted choices.

Feature packages are added when used: catalog, home, auth, purchase in Go, and corresponding user-facing features in React. Handlers translate requests, services enforce rules, repositories own SQL. A feature does not need an interface merely to fit a pattern.

## Database rules

Application tables live in the private marketplace schema. The app login has data privileges and no schema-creation privileges. Owner credentials are used only by explicit maintenance commands.

Goose is the only schema history. Do not use a second Supabase migration ledger or edit an applied migration. Add the next available version; future feature notes do not reserve version 002.

Seed versions are also immutable. Repeated seeding skips applied versions, verifies their SHA-256, and never recreates deleted/allocated inventory. Add a new seed file for intentional additions. Fixtures include 16 active products, an inactive product, competing sellers, sold-out offers, and 58 nonredeemable keys.

The original integrity constraints remain: one key per order item, unique key allocation, and a composite foreign key tying the purchased key to its actual offer. Inventory has no sold flag.

## HTTP contract

| Endpoint             | Response                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| GET /healthz         | 200 with status: ok; independent of PostgreSQL                                                      |
| GET /readyz          | 200 with status: ready when required schema/data access works; otherwise 503 with status: not_ready |
| GET /api/v1/products | Public catalog with query/filter/sort/pagination; see docs/api/catalog.md                           |
| Unknown route        | 404 with error.code: not_found                                                                      |

Responses are JSON and not cached. Request IDs appear in response headers and structured logs. Readiness failures expose no database details. The browser shows a generic recovery message and supports retry.

The complete catalog parameters, safe numeric bounds, JSON projection and error contract are documented in [Catalog API](docs/api/catalog.md). For example, request /api/v1/products?q=solr or /api/v1/products?sort=price_desc&pageSize=1 through the local Vite server. Product detail, home blocks and purchase endpoints belong to their later slices.

Slice 1's local tests, browser/proxy results, design costs and pending external checks are recorded in [Catalog verification](docs/verification/catalog.md).

Development binds to loopback. APP_ENV=production binds Go to all interfaces using PORT, as required by Render. Application startup never migrates or seeds a database.

## Verification and delivery

Run npm run verify and npm run test:integration before advancing. Integration checks refuse any target database other than eneba_test. Test fixture changes roll back.

GitHub Actions repeats verification against PostgreSQL 17.12 and 18.7 and runs Go race checks on Linux. Workflow existence is not evidence of a successful remote run. npm run audit separately runs the full npm advisory check and pinned govulncheck 1.9.0; these checks require network access. npm run verify stays usable with restored dependencies offline.

npm run test:tooling verifies lint file discovery, ignore rules and actual TypeScript rule execution. The integration command discovers all Go packages serially; the browser command discovers all tests and waits for proxied readiness before starting them. Unsupported methods on known endpoints return 405 with Allow: GET, HEAD. Unexpected HTTP failures use a generic JSON error envelope; a panic after headers aborts the incomplete response.

Public deployment is still deferred. The current user-selected target is Vercel for the frontend, Render for the Go API and Neon for PostgreSQL; no cloud deployment or provider connection has been verified. Keep the marketplace schema accessible only through Go, and keep migration credentials outside the deployed application. Check provider-specific database SSL/pooling, the same-origin API proxy, public HTTPS sessions and Render cold starts in the release checkpoint. Older Supabase notes in archived blueprints describe superseded planning rather than provisioned infrastructure.

A production Dockerfile will pin the Go build environment during the early-deployment slice; local development stays native. Public same-origin API routing and real HTTPS cookie behavior must be verified before authentication is accepted.

Conversation exports are intentionally deferred until the final submission checkpoint; do not add partial transcripts during implementation. See docs/decisions.md for the reasons behind these choices.

Next slices: independent homepage blocks → product detail/cart → authentication → quote/checkout → orders/key delivery → release verification. The [Phase 3 engineering handoff](docs/verification/slice-3-design.md) and [Home API contract](docs/api/home.md) document implemented banner, Best Sellers and Deals behavior and the pending 3E checkpoint.
