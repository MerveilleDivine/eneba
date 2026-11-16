# Final release verification — 16 November 2026

This document records **executed evidence**, with the exact deployment sources, rather than a proposal or a checklist marked complete without running it.

## Deployed versions

- Public website: https://eneba-marketplace-demo.vercel.app
- Vercel **production** deployment: `dpl_HZvidXEpX2ST1b5psEixmLzqzTay`, `62972b1`, READY; canonical public-domain alias verified.
- Render API: https://eneba-marketplace-api-x48g.onrender.com, deployment `dep-dbtlcggm7kps73a1nbi0`, `62972b1`, LIVE. The Go API and browser production bundles were deployed from the **same application revision**.
- Subsequent source commit `bec24ec` restores an authentic transcript snapshot and changes documentation only; it does not alter application source or migrations.
- Existing `db/migrations/001_initial.sql` is unchanged by Slices 6–8. Render readiness returned 200 using the already-provisioned Neon database.

## Executed gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Frontend TypeScript, ESLint, Vitest, Vite | **PASS** | Vercel production build from `62972b1`; **199/199 tests in 19 files**, successful production bundle |
| Frontend npm dependency check | **PASS at deployment** | Vercel `npm ci` reported **0 vulnerabilities** in the installed npm dependency set |
| Go unit packages, vet, build | **PASS** | Full Go source copied from the reviewed commit; Go 1.27.4; `go test ./... -count=1`, `go vet ./...`, `go build ./...` |
| Go + PostgreSQL integration | **PASS** | Isolated PostgreSQL **18.6** `eneba_test`; separate migration-owner and application roles; `go test -tags=integration -p 1 ./... -count=1` |
| Go race detector + PostgreSQL integration | **PASS** | Same isolated database, CGO/GCC enabled; `go test -race -tags=integration -p 1 ./... -count=1`; includes purchase package |
| Go vulnerability scan | **PASS** | `govulncheck@v1.9.0 ./...`: **No vulnerabilities found** |
| Public API readiness and privacy | **PASS** | HTTPS `/readyz` 200; unauthenticated order list and detail 401 with no-store headers; read-only server cart quote returned actual stock/prices |
| Public browsing, accessibility and layout | **PASS** | Real Chromium on production at **360 / 768 / 1280 px**, **5 routes each** (home/catalog/product/cart/orders), 15/15; zero browser errors, zero horizontal overflow, zero reported Axe WCAG 2A/2AA/2.1A/2.1AA violations |
| Public purchase and order security | **PASS** | Chromium with generated test accounts: cart → registration → simulated purchase → private key → reload → order history; buyer B denied buyer A receipt; sign-out revokes access |
| Continuous loading | **PASS at component/unit level** | Silent retry / delayed-read tests in frontend unit suite; real asleep-Render wake-up **not timed or independently measured** |
| Real checkout idempotency replay on public site | **Not separately executed** | Earlier isolated transaction tests included; no claim of a public replay or multi-buyer concurrency stress test |
| Complete Codex history | **Partial** | Authentic restored snapshot: **89 visible entries**, 12 Nov 13:07 UTC–13 Nov 11:50 UTC; later sessions not available through GitHub |
| Repository publication and application email | **Not completed** | GitHub repository is still **private**; no reviewer invitation or submission email was sent |

## Security and reproducibility notes

The Go API scopes order/key SQL by authenticated buyer, and sends owner receipts with `private, no-store`. Public browser tests verified cross-buyer isolation and revocation. Checkout uses server prices and PostgreSQL atomic inventory allocation. No actual money is charged; delivered keys are nonredeemable.

The browser tests and scripts were executed in an **isolated disposable verification environment**. PostgreSQL integration/race tests did not connect to Neon production. The public browser smoke created synthetic demo buyer accounts and completed a simulated purchase, so it did consume demo inventory once.

Automated accessibility checks cannot replace full manual assistive-technology audits. They were run against the publicly deployed pages, not just mocked components. Screenshots for homepage/catalog at the three viewport widths were captured in the isolated verifier; they were not committed as generated build artifacts.

The tracked feature tree does not contain `.env`, `node_modules`, local databases or browser-generated build directories. A basic pattern check of the restored Codex snapshot found no obvious credentials, but **this is not a complete security audit of every historical Git object or all missing conversations**. Before changing repository visibility, inspect historical commits and review the actual original transcript exports for accidental secrets.

## Submission handoff

The application is functional on its public URL and has passed the executed engineering gates. **Submission is not complete:** a full authentic Codex conversation export is still required by the assignment (not fabricated from commits), and the repository must be made accessible to reviewers after privacy review. Include the applicant's full name, English CV, repository URL, production URL and complete required chat history in the email to `internship@eneba.com`. Do not claim that a partial snapshot is complete.

Preserve useful automated tests (especially the purchase concurrency and ownership regressions) and maintain the branch history. This record is kept as final technical evidence rather than including generated transcripts, logs or screenshots inside application source.
