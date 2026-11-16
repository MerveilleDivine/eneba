# Slice 5 — authentication verification record

## Starting point
Existing feature branch feature/slice-2-catalog, head 487e690c707ad3689fb764dc4799f62fd1e52bfe on 16 November 2026. Previous product details and seller-selection work is committed but not yet accepted as complete Slice 4: no client cart. The latest GitHub Actions runs for that head failed without usable test-step results while the Actions quota was exhausted. This is not proof of test failure or success.

## Scope
Introduce Go-owned authentication through existing marketplace.users/sessions, register/login/logout/me, exact Origin checks, secure cookie flags, hashed random opaque tokens, password KDF, and basic sign-in/registration/account UI. Auth does not handle cart, checkout, order access or secret-key delivery. No new branch, history rewrite, merge, provisioning, deployment, or transcript export.

## Verification boundary
The remote-code editor has access to GitHub files, but not the user's checkout, project-pinned Go 1.27.4 or installed React/Playwright/PostgreSQL dependencies. Static review and the tests added in code are NOT evidence that the full local pipeline ran.

**Before acceptance:** run npm run format and inspect every formatting change; npm run verify; npm run test:integration on the isolated eneba_test DB; npm run test:browser; npm run audit; the Go race integration suite; manually test HTTPS cookie, session survival on hard reload, sign-in after wrong password, registration duplication, logout/revocation, keyboard flow, 320/360/768/1280 layouts and 200% font scaling. Record actual output and fix findings before declaring Slice 5 verified.

## Remaining release gates
Complete client cart (unfinished Slice 4); quote and atomic simulated checkout (Slice 6), owner-only order/key delivery (Slice 7); hosting/proxy/cookie/Origin measurements, public URL, complete audited conversations and formal handoff (Slice 8). Never describe a protected frontend account route alone as proof of server-side order ownership.

## Independent security and integration review — 16 November

A separate review of the already-committed Slice 5 implementation identified
three meaningful weaknesses and added focused corrective cases:

1. Go display-name normalization had the same BOM-only invisible-name mismatch
   previously found in content services. Normalization now trims BOM with
   whitespace and rejects dangerous embedded BOM/directional-format controls;
   the frontend public-account parser agrees with those rules.
2. When the per-account failed-login map reached capacity, it stopped updating
   the failure count of *existing* identities. A saturated limiter could thereby
   allow unlimited password checks for an already-tracked account. The limiter
   now updates existing entries at capacity and fails closed for new identities.
3. Login, registration and sign-out used incomplete POST deadlines: a delayed
   response body could hang after the fetch call returned, and sign-out had no
   deadline. They now share one ten-second cancellation/race boundary that
   returns a clear unavailable state even if an asynchronous request ignores
   cancellation. No leaked credentials are exposed in errors.

Added Go tests for the saturated limiter, invisible names, and production
__Host- cookie flags; PostgreSQL/HTTP tests for foreign/missing Origin on all
mutation routes; frontend transport tests for response rejection and bounded
request timeouts; and a Chromium path covering register → persist through reload
→ logout → rejected password → login, plus 320px/200%-text layout.

**Evidence boundary:** these tests were committed for execution; the assistant
could not execute the project-pinned local toolchain, PostgreSQL or Chromium
from its current container. GitHub Actions quota was exhausted, so no CI pass
is claimed. The authenticated order/checkout routes are still intentionally
unimplemented. Do not treat this checkpoint as production security approval.
