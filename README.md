# Eneba marketplace

An independent internship project: discover games, compare sellers, purchase with simulated payments and retrieve nonredeemable keys from your account.

**[Open the application](https://eneba-marketplace-demo.vercel.app)** | **[Completed feature branch](https://github.com/MerveilleDivine/eneba/tree/feature/slice-2-catalog)**

## Features

- Independently loaded featured banners, best sellers and seller-specific deals.
- Typo-tolerant search, platform/region/price filters, sorting and stable pagination.
- Product details, activation guidance, competing offers and persistent seller selections.
- Persistent cart, registration, sign-in and secure server-side sessions.
- Server-priced checkout with atomic inventory allocation and safe idempotent retries.
- Buyer-only order history, historical receipts and key delivery with accessible copy controls.
- Responsive layouts, keyboard navigation and recoverable loading/error states.

All game artwork is original; see [asset provenance](docs/assets/README.md). Payments are simulated and keys cannot be redeemed. The project is not affiliated with Eneba.

## Technology and structure

React, TypeScript and Vite provide the frontend. A Go REST API uses pgx and direct SQL against PostgreSQL. Vercel hosts the frontend, Render hosts the API, and Neon hosts the database. Same-origin rewrites carry browser requests and authentication cookies to Go.

| Directory        | Responsibility                                                                |
| ---------------- | ----------------------------------------------------------------------------- |
| api              | Server entry points and feature-owned handlers, services and SQL repositories |
| web/src/features | Colocated screens, requests, state and tests for each feature                 |
| web/src/shared   | Shared product identity, HTTP read lifecycle, formatting and layout           |
| db               | Goose migrations and immutable, checksum-verified seeds                       |
| scripts          | Reproducible tooling and explicit database maintenance                        |
| docs             | API contracts, consequential decisions, verification and source references    |

The server constructs concrete dependencies. Business code does not import maintenance tooling. [Architecture decisions](docs/decisions.md) explain these boundaries and their costs.

## Run locally on Windows

Prerequisites: Git and PowerShell 5.1+. Run from the repository root:

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

Open **http://127.0.0.1:5173**. Vite proxies API requests to Go on port 8080.

Bootstrap downloads and checksum-verifies Go 1.27.4, Node 22.23.5 (npm 10.9.9) and PostgreSQL 18.7 into ignored project directories. Load the environment helper in every new terminal. The project-owned database cluster listens on loopback port 5433; an existing system PostgreSQL service on port 5432 remains independent.

Provisioning runs **once**. It creates eneba_dev and eneba_test with separate migration/application credentials, saving private configuration in ignored .env files. Later sessions only need the cluster start and development commands. Use npm run db:local:status or npm run db:local:stop to manage this cluster.

Provisioning refuses existing resource names or configuration instead of adopting them. If it fails, preserve the ignored .env.provisioning.local recovery file, inspect the named resources and complete only missing resources before publishing .env. Never drop a database or guess a replacement password to retry.

For an existing native PostgreSQL installation, provide administrator PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE and PGSSLMODE in ignored .env.bootstrap.local, then run provisioning without starting the project cluster. The [environment example](.env.example) documents application settings; never put database credentials in browser variables.

## Verification

```powershell
npm run hooks:install
npm run verify
npm run test:integration
npm run test:browser
npm run audit
```

verify checks Prettier, Go formatting/vet/tests/build, tooling boundaries and frontend types/lint/tests/build. Integration tests require the isolated eneba_test database and run packages serially. Browser tests start fresh applications and wait for proxied readiness; install Chrome if it is unavailable. Network access is needed for dependency audits.

Run transaction race checks on Linux with a C compiler:

```sh
node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1
```

The pre-commit hook verifies the complete staged snapshot. [Final verification](docs/verification/final-submission.md) distinguishes local, Linux, browser and hosted results, exact revisions and pending checks. GitHub Actions remains pending because account capacity is unavailable; workflow configuration alone is not a passing run.

## Data and security

Application tables live in the marketplace schema. Only Go accesses them; schema-owner credentials stay out of the running API. Startup never migrates or seeds. Run npm run db:migrate and npm run db:seed explicitly. Applied versions are immutable, and repeated seeds never replenish allocated inventory.

Amounts use integer EUR cents. Checkout locks the buyer before sorted offers, resolves idempotent replays before stock checks, validates current server prices and commits every order item together. Unique key allocation and the composite offer/key foreign key protect inventory independently of application code.

Order queries scope ownership in SQL and use purchased name/price snapshots. Keys are returned only to the purchasing session with no-store responses. The browser keeps keys in memory and clears protected views on account changes or when a tab returns. Logs contain request IDs and generic failures, never keys or credentials.

[API contracts](docs/api/) cover catalog, home, authentication, quotes, checkout and orders.

## Deployment and limitations

Vercel serves the SPA and forwards API requests through web/vercel.json. Render builds and runs the Go API from the same feature branch. Production requires APP_ENV=production, APP_ORIGIN set to the canonical HTTPS frontend, DATABASE_URL for the restricted application role and PORT supplied by the host. Run approved database maintenance separately using owner credentials.

This is a bounded internship marketplace: one key per offer per order, at most ten cart lines, EUR only and no real payment processing. Free hosting can have cold starts. Authentication rate limits are process-local; a larger deployment would need shared ingress limits. Automated accessibility checks complement keyboard/responsive inspection and do not certify screen-reader or physical-device coverage.

The [AI assistance record](docs/ai-history/README.md) includes authentic available conversations, source coverage and documented redactions. Original assignment documents remain unchanged under docs/reference/.
