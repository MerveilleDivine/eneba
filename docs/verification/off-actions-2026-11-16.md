# Off-Actions verification — 16 November 2026

This record covers the Eneba Slice 4–5 review performed outside GitHub Actions after
the repository's Actions quota was exhausted.

## Source and isolation

- Parent branch commit: `583692f499c1c63041d4abb16f6c2a8eb30a84f3`.
- A short-lived, private Vercel Sandbox ran the tests without a deployment.
- Authenticated GitHub source files were checked against their Git blob IDs before transfer.
- The corrected files staged for this checkpoint were checked against the sandbox's
  `git hash-object` output: all 18 source-file hashes matched.
- Conversation archives, employer reference documents, and secrets were not transferred.
- A separate temporary PostgreSQL server and isolated Eneba databases were used.
- The sandbox was ephemeral; its credentials and database are not production resources.

## Runtime

- Ubuntu 26.04; 2 vCPU and 4 GB RAM.
- Go 1.27.4; Node.js 22.23.5; npm 10.9.9.
- PostgreSQL 18.6 (not the exact CI matrix versions).
- Google Chrome 157; project-pinned Playwright and frontend packages.

## Executed verification

- `npm ci`: passed.
- `npm run verify`: passed after fixing source formatting; all 13 Vitest files
  passed. This completed run preceded the isolated-auth-test setup correction.
- `npm run audit`: passed; npm audit found zero vulnerabilities and
  `govulncheck` reported no vulnerabilities.
- `npm run db:provision`, `npm run db:migrate`, `npm run db:seed`: passed.
- `npm run test:integration`: passed after each package was made responsible
  for its own `eneba_test` schema setup.
- `node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1`:
  passed, including the authentication and PostgreSQL cases.
- Browser acceptance: 50/50 catalog, accessibility and browsing tests passed;
  16/16 authentication, product and cart tests passed; 35/35 homepage, deals,
  foundation and cross-layer integration tests passed. Total: **101/101**
  passed across three isolated Chrome invocations.

## Defects found and corrected

1. Prettier reported 13 files and Go formatting reported one file.
   The formatter output was applied to the working snapshot.
2. Authentication integration tests depended on catalog tests running first
   to migrate `eneba_test`. An auth-owned integration setup helper now applies
   the migrations safely before opening the test pool.
3. Playwright's immediate radio `.check()` expectation raced URL-driven
   React selection. The affected tests now click and assert the resulting
   selection and navigation, retaining behavior verification.
4. A mocked auth outage assumed exactly one initial request. Development
   StrictMode can issue additional reads; the mock now remains unavailable
   until the explicit retry, making the recovery scenario deterministic.

## Important limitations

The first uninterrupted browser run encountered a local web-server shutdown
after 68 passing tests; 33 subsequent connection failures were environmental.
All 101 cases subsequently passed when the suite was split into three runs.

One early full frontend unit run had two intermittent failures, which passed
when rerun. A later full `npm run verify` succeeded. A final attempted rerun
stopped at formatting of two temporary, **untracked** sandbox verification
configuration files; neither file exists in the committed GitHub tree. Because
the sandbox later expired, a final full `npm run verify` on this exact proposed
commit was not completed. Do not claim an exact-head all-in-one CI pass.

The PostgreSQL 17.12 and 18.7 matrix, public HTTPS cookie/proxy behavior,
physical-device and screen-reader acceptance, and the deployment cold-start
measurements remain unverified. No merger, public repository conversion,
hosting, payment flow or key delivery is authorized by this record.

## Reproduce without GitHub Actions

Use a disposable Linux environment with the repository's pinned toolchains,
Chrome/Playwright and a private PostgreSQL test instance. Provision only the
named Eneba databases and roles, then run:

```bash
npm ci
npm run db:provision
npm run db:migrate
npm run db:seed
npm run verify
npm run audit
npm run test:integration
node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1
npx playwright test tests/browser/acceptance.spec.ts tests/browser/accessibility.spec.ts tests/browser/best-sellers.spec.ts tests/browser/catalog.spec.ts
npx playwright test tests/browser/auth.spec.ts tests/browser/cart.spec.ts tests/browser/product.spec.ts
npx playwright test tests/browser/deals.spec.ts tests/browser/foundation.spec.ts tests/browser/home.spec.ts tests/browser/homepage-acceptance.spec.ts tests/browser/integration.spec.ts
```

Skip `db:provision` when the isolated project databases have already been
provisioned. Reuse only the project-specific credentials stored in ignored
local files. Record the exact source commit, exit codes and database version
for every run; any failure blocks release until investigated.
