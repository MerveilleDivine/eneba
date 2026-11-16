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
