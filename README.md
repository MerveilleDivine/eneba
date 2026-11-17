# Eneba Marketplace

I built a digital game marketplace inspired by Eneba, with a React storefront, a Go API and a PostgreSQL database. You can explore games, compare prices from different sellers, create an account and place an order to receive a digital key.

My focus was the whole buying experience, not just the product pages. A seller's offer has its own price and stock, checkout checks both again, and the database prevents the same key from being sold twice.

**[Explore the live site](https://eneba-marketplace-demo.vercel.app)** · [Architecture](docs/decisions.md) · [API reference](docs/api/)

> This is an independent project, not affiliated with Eneba. Checkout is simulated and the delivered keys are not redeemable.

![Eneba Marketplace homepage, showing featured games and the storefront](docs/screenshots/homepage.jpg)

[See the catalog screenshot](docs/screenshots/catalog.jpg)

## What you can do

- **Find games:** Browse the catalog, search by name (including partial matches and common typos), and filter by platform, region or price.
- **Explore the storefront:** See featured games, best sellers and deals. Each section receives its content independently from the API.
- **Compare offers:** Check a game's edition, platform and region, then choose a specific seller and price.
- **Buy a game:** Save offers to your cart, sign in, review current prices and complete a simulated purchase.
- **Keep your purchases:** Return to your order history to view receipts and access the keys issued to your account.

The layout works on mobile and desktop, with keyboard navigation, useful empty states and loading screens that handle slower API responses.

## Tech stack

| Part     | Built with                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React, TypeScript, Vite, CSS Modules                    |
| Backend  | Go, REST, pgx                                           |
| Database | PostgreSQL, Goose migrations and versioned seed data    |
| Hosting  | Vercel (web), Render (API), Neon (database)             |
| Testing  | Vitest, Playwright, Axe, Go tests and the race detector |

The application is split into three main areas: `web/` for the storefront, `api/` for the Go service and `db/` for the schema and sample data.

## A few decisions behind the build

**Prices belong to the server.** The cart stores offer IDs, not trusted prices. The API checks the latest price and available inventory before completing an order.

**Purchases are atomic.** A PostgreSQL transaction creates the order and allocates its keys together. Database constraints prevent two buyers from receiving the same key. An idempotency key makes a retried checkout safe.

**Orders are private.** Accounts use server-side sessions and secure cookies. Order queries are scoped to the signed-in buyer, and delivered keys never go into browser storage.

**The homepage is data-driven.** Banners, best sellers and deals come from separate backend queries. A slow section doesn't stop the rest of the page from working.

I kept the architecture deliberately straightforward: one Go API, clear feature boundaries and PostgreSQL as the source of truth. The [architecture notes](docs/decisions.md) cover the trade-offs in more detail.

## Run it locally

The setup scripts currently target **Windows PowerShell**. They install the pinned development tools and set up a dedicated local PostgreSQL cluster.

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

Open **http://127.0.0.1:5173**.

Run `db:provision` **only once** for a new local database. On later starts, load the environment, start PostgreSQL and run `npm run dev`. If you already have PostgreSQL installed, you can instead configure isolated local roles and connections using [`.env.example`](.env.example). Never use a production database for local setup or integration tests.

## Run the checks

```sh
npm ci
npm run verify
npm run test:integration
npm run test:browser
npm run audit
```

The integration suite needs a separate `eneba_test` database. Browser tests need Chromium and a running application. For the PostgreSQL concurrency checks on Linux with CGO enabled:

```sh
node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1
```

I kept the meaningful tests in the repository. The [verification record](docs/verification.md) distinguishes tests that ran from checks that still have limitations.

## More about the project

- [API reference](docs/api/) — routes, request rules and response shapes
- [Architecture decisions](docs/decisions.md) — data model, checkout, security and trade-offs
- [Verification](docs/verification.md) — test results and deployment checks
- [Artwork credits](docs/assets/README.md) — where the cover art came from
- [Development conversations](docs/ai-history/README.md) — original AI-assisted development history and what was preserved
- [Original assignment](docs/assignment.pdf) — the brief that started the project

The live app uses Vercel, Render and Neon. The API never runs migrations or reloads seed data on startup; those are separate maintenance steps.
