# Hosted Slice 5 authentication acceptance — 16 November 2026

## Deployment under test

- Production frontend: `https://eneba-marketplace-demo.vercel.app` (Vercel).
- Go API: `https://eneba-marketplace-api-x48g.onrender.com` (Render, free plan).
- Database: dedicated `eneba_demo` PostgreSQL 18 on Neon, with separate API and owner roles.
- **Application source commit:** `ea1b51eed0c5b20be317c28c305a126936d3172f`, branch `feature/slice-2-catalog`. Both production deploys matched this commit.
- GitHub repository remained private. `main` was not changed.
- Verification environment: isolated ephemeral Vercel Sandbox (Frankfurt), Chrome 157, Playwright 1.58.2. Testing scripts were *not* committed.

## Actual hosted tests

**Chrome browser account lifecycle: 9/9 passed**

1. Registration through the real UI returns 201; the browser receives a `__Host-eneba_session` cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute.
2. Successful registration redirects to the account view, showing the registered address.
3. Browser cookie-store flags and host scope match the intended production domain.
4. Authentication persists after a page reload.
5. Authentication persists in a second tab.
6. Signing out redirects to sign-in; subsequent account view is anonymous.
7. An incorrect password displays the generic error instead of logging the user in.
8. The correct password restores an authenticated account.
9. Registration remains usable without horizontal overflow at a 360 px viewport.

**Independent HTTPS/API negative tests: 10/10 passed**

- Anonymous `GET /api/v1/auth/me` returned 401.
- Login with no `Origin` returned 403.
- Login with an untrusted `Origin` returned 403 and did not issue a cookie.
- Logout with an untrusted `Origin` returned 403.
- Registration with an untrusted `Origin` returned 403.
- Registration with an invalid request body and the correct `Origin` returned 400.
- Registration with the wrong media type returned 415.
- `GET` on login and register POST-only routes returned 405.

**Additional mobile browser checks: 2/2 passed**

- Registration at a 320 px viewport and 200% root text size displayed all fields and the submit button, without horizontal overflow.
- The sign-in form displayed its heading and labeled inputs at 320 px.

The latest 100 inspected Render log entries contained no unexpected warning/error-level messages. Observed HTTP statuses agreed with the test expectations.

## Implementation review and remaining limits

- Production `APP_ORIGIN` matches the *canonical* Vercel domain above. Other deployment aliases are not designated as authentication origins.
- Source review confirms logout invokes `DeleteSession` using the hash of the token. Existing Go integration tests explicitly check that a logged-out cookie cannot be reused, that a concurrent separate session remains valid, and that logout checks the Origin. **A standalone replay of an old token against the public production URL was not independently executed**: the automated tool blocked that attempt. Do not claim a hosted replay pass.
- The first hosted browser attempt was interrupted by a **test-harness mistake**, reading the response's `headers()` instead of Playwright's `allHeaders()` for `Set-Cookie`. The harness was corrected and the full nine-check live browser run passed. This did not require an application fix.
- Two clearly labeled, synthetic `@example.test` accounts and two associated active session records remain in the dedicated demo database. The test passwords were randomly generated and not retained. **Cleanup requires explicit approval for destructive database changes.** No genuine user information was submitted.
- Full production cold-start/recovery timing, physical-device and screen-reader acceptance, cross-browser checks, and an exact-head uninterrupted CI matrix are separate pending gates. The existing off-Actions record is `docs/verification/off-actions-2026-11-16.md`.

## Outcome

**Core hosted Slice 5 authentication acceptance passed: 21 browser, mobile and HTTPS/API checks.**

No application source change was required by these tests. This document records observed evidence and limitations; it does not claim that pending tests passed or authorize new features, a merge, repository publicity, or a paid hosting plan.
