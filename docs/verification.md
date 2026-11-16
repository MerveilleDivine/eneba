# Release verification

**Production application:** [eneba-marketplace-demo.vercel.app](https://eneba-marketplace-demo.vercel.app)  
**Merged source:** `main`, commit `ed67dfc` (16 November 2026)

This report distinguishes tests actually executed from remaining handoff requirements.

## Verified application behavior

| Area                             | Evidence                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                         | Vercel production build completed; TypeScript, ESLint, 199/199 Vitest tests across 19 files, Vite bundle                                                |
| Backend                          | Go 1.27.4 unit tests, `go vet` and build passed                                                                                                         |
| PostgreSQL integration           | Integration suite passed with isolated PostgreSQL 18.6 `eneba_test`, not production Neon                                                                |
| Concurrency                      | `go test -race -tags=integration -p 1 ./... -count=1` passed on the isolated database                                                                   |
| Dependencies                     | Vercel npm installation reported zero vulnerabilities; `govulncheck@v1.9.0` reported none                                                               |
| Hosted API                       | Render deployment `62972b1` reported LIVE; readiness 200; anonymous order access 401; quote returned server prices                                      |
| Hosted frontend                  | Vercel production deployment of merged `ed67dfc` reported READY; canonical public domain mapped to that build                                           |
| Browser layout and accessibility | 15/15 public Chromium route/viewport checks at 360, 768 and 1280 px: no horizontal overflow, JavaScript exceptions or reported Axe WCAG A/AA violations |
| Buyer journey                    | Browser-tested registration, cart, simulated purchase, private key delivery, reload and order-history navigation                                        |
| Authorization                    | Separate buyer could not read original buyer's receipt; signing out revoked access                                                                      |

The main merge only consolidated the tested application source and documentation. Simulated checkout consumes seeded nonredeemable inventory; it does not charge users.

## Scope and limitations

- The publicly deployed transaction-replay scenario was not separately stress-tested; isolated Go transaction, constraint and race tests passed.
- Automated accessibility reports do not constitute a complete manual screen-reader or device audit.
- The full GitHub Actions workflow did not pass at the final commit because earlier attempts were blocked by account runner capacity. The independent verification results above are separate.
- The cold-start loading behavior passed frontend tests; a full real sleeping-Render wake-up duration was not measured.
- The Render service remains configured to track `feature/slice-2-catalog` with auto-deploy disabled. Its deployed application source matched the frontend before the documentation-only merge. Switch the Render service to `main` before future API releases.
- The archived Codex evidence currently includes 89 authentic visible entries from 12–13 November only. Later sessions are **missing**; no dialogue was invented.
- The GitHub repository is **public**, but public visibility does not establish a complete historical secret audit. An initial current-tree pattern scan found no obvious live GitHub/OpenAI keys or private-key blocks; further history and transcript review is still advisable.
- The internship submission email has **not** been sent; the English CV was attached to an Outlook draft, and the required full agent transcript remains incomplete.

For implementation boundaries see [architecture decisions](decisions.md); for the assignment text see [assignment.pdf](assignment.pdf).
