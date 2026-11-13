# Foundation verification

Started: 12 November 2026. Final review: 13 November 2026. Scope: foundation only; marketplace feature routes are not implemented yet.

## Local checks

- Go 1.27.4, Node 22.23.5, npm 10.9.9, PostgreSQL 18.6.
- The local database uses the installed PostgreSQL binaries and checkout-owned data on loopback port 5433. Administrator credentials for the existing service were not needed.
- Development and test databases have separate owner/application logins. Credentials are generated locally and ignored by Git.
- Initial migration applied once; the second run applied zero migrations.
- Initial fixture version applied once; the second run applied zero fixture versions.
- npm run doctor passed without displaying credentials.
- npm run verify passed: formatting, Go vet/test/build, frontend typecheck/lint, four UI tests, production build.
- npm ci --offline restored all 248 locked packages successfully from the verified local cache.
- npm run test:integration passed seven real-PostgreSQL scenarios: seeded reads, cross-offer key rejection, duplicate allocation rejection, inventory preservation, immutable seed checksums, runtime DDL denial, and readiness/unavailability.
- After isolating database maintenance, Go checks and all seven scenarios passed again. The server dependency graph contains no Goose imports; provisioning, migration, and seed complexity remains behind the maintenance command.
- Isolated Chrome checks passed at 1280px, 768px, and 360px. The page used the actual Vite proxy, Go API, and PostgreSQL, with no horizontal overflow or uncaught page errors.

## Browser evidence

Desktop and mobile screenshots were visually inspected. The shell is explicitly an unofficial early preview, with no inactive shopping controls.

- [Desktop](screenshots/foundation-1280.png)
- [Tablet](screenshots/foundation-768.png)
- [Mobile](screenshots/foundation-360.png)

Database control was performed externally while the same isolated Chrome page stayed open. With PostgreSQL stopped, liveness stayed at 200, readiness returned 503 with a generic body, and the page showed its recovery message. After restart, Check connection returned the same page to Connection established. This passed with no page reload.

- [Unavailable state](screenshots/foundation-unavailable.png)
- [Recovered state](screenshots/foundation-recovered.png)

## Issues caught before acceptance

- Goose bookkeeping initially depended on the transaction search path. Its ledger is now explicitly qualified as public.goose_db_version.
- PostgreSQL startup needed an independent hidden process on Windows. The helper waits for pg_ctl rather than the long-lived daemon.
- Startup now returns exit code zero explicitly instead of retaining pg_ctl status's previous not-running code.
- Browser startup now waits for a healthy API rather than assuming the Vite process alone proves readiness.
- The interactive browser bridge timed out. Browser verification uses isolated automated Chrome instead.
- An additional maintenance runner was unreliable inside browser subprocess jobs on this host and was removed. The database outage/recovery path was verified with external controls and a persistent browser page instead.

## Pending external evidence

- GitHub Actions is prepared for PostgreSQL 17.11/18.6 and Linux race checks; remote execution remains pending publication.
- Public Vercel/Render/Supabase deployment, HTTPS routing, and authentication cookies belong to later slices. The dedicated Supabase project still needs free-tier capacity arranged by the user.
- The current conversation is exported as a snapshot. Earlier accessible planning conversations still need importing, and the active session must be refreshed after its final response. No complete submission-history claim is made.
