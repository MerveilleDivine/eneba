# Slice 2 integration acceptance — D4

13 November 2026. Scope: integrated catalog browsing through React, the local Vite
same-origin proxy, the Go HTTP service, and seeded PostgreSQL. This is an engineering
verification checkpoint, **not** a claim that a public deployment is available.

## Boundaries and test environment

- GitHub Actions runs migrations and seed operations twice to check idempotence,
  then executes Go tests, browser tests, security checks, and Go race tests
  against PostgreSQL 17.12 and 18.7.
- Playwright runs actual Chromium against Vite at `127.0.0.1:5173`, with
  `/api`, `/healthz`, and `/readyz` proxied to the running Go service.
  This is a real API and real database path, not mocked catalog responses.
- `tests/browser/integration.spec.ts` verifies the following cross-layer contracts:
  1. Go liveness/readiness and catalog responses through the same-origin proxy,
     including request IDs, no-store headers, JSON content type, and nosniff.
  2. Invalid API query (400), unsupported method (405 with Allow), and unknown
     API route (404) return the documented JSON error envelopes.
  3. Available inventory determines the displayed lowest price. Deep Signal
     must show its in-stock EUR 33.04 offer, not a cheaper unavailable offer.
  4. A sold-out SKU stays discoverable and shows no purchasable price.
  5. A combined platform/region/inclusive-price query returns the same Solar
     Drift result and EUR 11.36 price in Go JSON and the browser.
  6. An empty API result renders the empty state and recovers through Clear filters.
  7. Two API pages contain all 16 active seeded SKUs without duplicates;
     browser page 2 displays the same four products as the Go response.
- Existing catalog and foundation browser tests additionally exercise tolerant
  search, URL and browser-history navigation, retries, filter inputs, responsive
  viewports (360/768/1280px), basic keyboard navigation, and unknown page routing.
- Go integration tests independently verify stock semantics, price bounds,
  isolation, invalid inputs, transaction/query budgets, and that protected
  inventory details are not in the public API projection.

The latest successful workflow run for the exact commit is the acceptance
evidence; an uncompleted or failing CI run does not satisfy this checkpoint.
No custom browser measurements or performance figures are inferred.

## Deployment and manual acceptance — still open

- No Eneba Vercel project was returned by connected account searches for the
  project name or the GitHub repository URL at the time of this review.
- No dedicated Eneba Supabase project appeared among connected projects.
  Existing unrelated application databases must not be reused.
- Render service inspection was not authorized because the connection requires
  explicit confirmation of a selected workspace. No backend deployment status
  is inferred.
- Public HTTPS routing, Vercel-to-Render API proxying, hosted `/readyz`,
  production browser data access, CORS/origin enforcement, and cookies under
  actual production domains remain untested. Authentication and cookie behavior
  require their own Slice 5 verification.
- Live accessibility evaluation, visual/device review and real network-failure
  drills have not been performed. Automated Chromium tests and responsive
  viewport checks are useful evidence but not substitutes for manual review.
- Release preparation requires deployment configuration, a dedicated database,
  approved environment credentials, and a smoke test against a real public URL.
  No production environment is provisioned or changed by D4.

## Review and next gate

Treat CI-based local integration as separate from deployed acceptance. Record
the final run IDs and results when the suite finishes. Keep D4's remaining
deployment evidence visible rather than describing the slice as publicly live.
The next engineering checkpoint is D5, the final Slice-2 architectural and
acceptance review; do not advance automatically or merge the draft PR.
