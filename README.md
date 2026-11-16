# Eneba Marketplace

A full-stack digital game marketplace built for the Eneba Software Engineer Internship assignment. Browse games, compare seller offers, create an account, complete a simulated purchase, and retrieve a nonredeemable digital key from your own order history.

**[Live application](https://eneba-marketplace-demo.vercel.app)** · **[Original assignment](docs/assignment.pdf)** · **[Verification results](docs/verification.md)**

This is an independent project and is not affiliated with Eneba. No real payments or redeemable game keys are used.

## What works

- Database-driven banners, best sellers and deals, loaded independently.
- Search, sorting, filters and pagination across real PostgreSQL catalog records.
- Game details, edition/platform/region information and competing seller offers.
- Persistent cart, registration, sign-in and authenticated buyer sessions.
- Server-priced checkout with transactional inventory allocation and idempotent retries.
- Buyer-only order receipts and key delivery; other accounts cannot retrieve an order's key.
- Responsive pages, keyboard interaction and animated skeletons during slow API responses.

## Stack

- **Frontend:** React, TypeScript, Vite, CSS Modules; deployed on Vercel.
- **Backend:** Go REST API using pgx and SQL; deployed on Render.
- **Database:** PostgreSQL on Neon, with Goose migrations and checksum-verified seed data.
- **Tests:** Vitest, Playwright, Axe, Go unit/integration tests and the Go race detector.

Application source lives in `web/` and `api/`. Versioned schema and demo data live in `db/`. The `scripts/` directory contains local setup, verification and maintenance commands.

## Run locally

The checked-in bootstrap scripts target Windows PowerShell. They install pinned development tools under ignored directories and provision an isolated local PostgreSQL cluster.

From the repository root:

```powershell
.\scripts\bootstrap.ps1
. .\scripts\environment.ps1
npm ci
npm run db:local:start
npm run db:provision
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://127.0.0.1:5173`. Provisioning is a **one-time** operation. On later runs, start PostgreSQL, load the environment helper and run `npm run dev`; never provision over an existing database.

If you use an existing PostgreSQL installation instead, configure isolated owner/application roles and follow [`.env.example`](.env.example). Secrets belong in ignored local environment files, never in frontend variables or committed files.

## Verify

```sh
npm ci
npm run verify
npm run test:integration
npm run test:browser
npm run audit
```

The integration suite requires the separate `eneba_test` database. Browser tests require a Chromium/Chrome installation. To test transaction races on Linux with CGO and a C compiler:

```sh
node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1
```

See [verification evidence](docs/verification.md) for exact executed results and remaining limitations. GitHub Actions may report failed runs when the account's runner allowance is exhausted; those runs are not evidence of application test failures or passes.

## Design and security

- Money is represented in integer EUR cents. The API calculates and validates prices, stock and totals.
- Orders allocate keys in one PostgreSQL transaction. Uniqueness and foreign-key constraints protect each allocation.
- Checkout checks an idempotent replay before current stock, and locks the buyer before seller offers in deterministic order.
- Session cookies are `HttpOnly`, `Secure` and `SameSite` in production; mutating requests validate their origin.
- Order detail SQL is scoped to the authenticated buyer. Key responses are not cached and keys are never stored in browser persistence.
- Read-only pages retry transient API failures quietly with bounded loading skeletons. Checkout mutations are never automatically repeated without their idempotency safeguards.

## Supporting documents

- [API contracts](docs/api/) — request and response behavior.
- [Architecture decisions](docs/decisions.md) — important design choices and trade-offs.
- [Artwork provenance](docs/assets/README.md) — original illustrations and asset manifest.
- [Verification evidence](docs/verification.md) — unit, database, browser and hosted checks.
- [AI conversation records](docs/ai-history/README.md) - original public conversation, source information and snapshot coverage.

The [original project conversation](https://chatgpt.com/s/cx_6afb756ca4f481919259b760b8a85bcb) is publicly readable without signing in. The history index records source provenance, independently checked message counts and the snapshot cutoff.

## Hosting

Vercel serves the browser app and proxies `/api` requests to Render. Neon provides persistent PostgreSQL storage. API startup never migrates or seeds production data.

**Deployment maintenance:** the running Render service was last verified with the matching application source, but its automatic deployment setting is disabled and its configured Git branch is still `feature/slice-2-catalog`. For future backend changes made on `main`, change the Render service branch to `main` in its dashboard before deploying. This repository does not contain production credentials.
