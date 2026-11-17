# Release verification

**Production:** [eneba-marketplace-demo.vercel.app](https://eneba-marketplace-demo.vercel.app)

**Application revision covered by these checks:** `04b0e7ff970094cdb475f1f35d5d3c59402dba9a`

**Verification review:** 16 November 2026. This record separates live checks from earlier test results. Later documentation and copy changes are not included in these historical test results.

## Freshly verified in the final review

| Area         | Result                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository   | Public [MerveilleDivine/eneba](https://github.com/MerveilleDivine/eneba), default branch `main`; anonymous HTTP 200.                                                                                                                    |
| Frontend     | Vercel production `dpl_HtEnmrkjaz6DCV77odLSaFJcWtrH` is READY at application revision `04b0e7ff970094cdb475f1f35d5d3c59402dba9a`, with the canonical public alias. Website HTTP 200.                                                    |
| Backend      | Render `dep-dbtlcggm7kps73a1nbi0` is LIVE at `62972b1b4529c3390cae4ed3a97abe3cfb14977f`. Its complete `api/` tree matches the application revision: `358e75c3f0cd1ab67bc70aca8564fbcf549e90ff`. No backend redeployment was needed.     |
| Public API   | Proxied `/readyz` returned 200 with status `ready`; anonymous `/api/v1/orders` returned 401.                                                                                                                                            |
| Database     | Read-only Neon metadata confirmed PostgreSQL 18.7, required tables, Goose version 1 and all four seed checksums matching the repository. No production data was changed.                                                                |
| Constraints  | Production metadata confirmed unique allocated keys, the matching offer/key composite foreign key and buyer/idempotency uniqueness.                                                                                                     |
| Conversation | The [public conversation](https://chatgpt.com/s/cx_6afb756ca4f481919259b760b8a85bcb) opened anonymously in Chrome with the project title, original prompt and final handoff exchanges. See [source and coverage](ai-history/README.md). |

## Previously verified application evidence

These are recorded results from the application handoff, not new runs in this documentation review.

| Area                      | Recorded result                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                  | Vercel build: TypeScript, ESLint, 199/199 Vitest tests across 19 files and production bundle. Format checkpoint `d73b256` also passed full Prettier and 3/3 tooling tests.       |
| Backend                   | Go 1.27.4 unit tests, vet and build passed. The deployed API source is unchanged.                                                                                                |
| Integration               | Passed against isolated PostgreSQL 18.6 `eneba_test`, never production Neon.                                                                                                     |
| Concurrency               | Linux `go test -race -tags=integration -p 1 ./... -count=1` passed against the isolated database.                                                                                |
| Dependencies              | Recorded Vercel npm installation reported zero vulnerabilities; `govulncheck@v1.9.0` reported none.                                                                              |
| Browser and accessibility | 15/15 public Chromium route/viewport checks at 360, 768 and 1280 px, with no horizontal overflow, JavaScript exceptions or reported Axe WCAG A/AA violations.                    |
| Purchase and ownership    | Browser-tested registration, cart, simulated purchase, private key delivery, reload and history. A second buyer could not read the first buyer's receipt; logout revoked access. |

## Limits and handoff

- Final documentation checks passed: Prettier on the changed Markdown, all 3 tooling tests and Git whitespace validation. This checkpoint contains no application changes.
- The full application suite was **not rerun** during this documentation review; the completed tests are recorded in the earlier evidence above.
- The final GitHub Actions run was not completed after runner-capacity failures. No passing final Actions run or new PostgreSQL 17 compatibility result is claimed.
- Production replay/concurrency stress tests were not executed. Transaction tests use isolated databases. Hosted purchases and allocations were preserved.
- Automated accessibility results are not a complete manual screen-reader, physical-device, 320 px or enlarged-text audit. No new full visual review is claimed here.
- Real sleeping-Render wake-up duration was not measured; cold-start loading behavior has frontend test coverage.
- Render still tracks `feature/slice-2-catalog` with auto-deploy disabled. Connected tools cannot update that setting. **Before the next backend release, select `main` in the existing service's dashboard.** The running API matches the reviewed source.
- The repository was already public. The recorded bounded scan covered 861 reachable Git blobs across 122 commits, finding no common provider-token or private-key markers; PostgreSQL password patterns were in test fixtures. This is not a comprehensive history/privacy audit. Repository visibility and Git history were not changed.
- The [history index](ai-history/README.md) records the 213-entry inspected snapshot and the public conversation link. The shared link is a snapshot, not a claim that every later exchange is included.

See [architecture decisions](decisions.md) and the [original assignment](assignment.pdf).
