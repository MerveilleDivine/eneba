# Slice 5 authentication contract

Authentication is owned by the Go API and PostgreSQL, not by the browser or any hosted DB authentication API. The production public origin is the exact HTTPS APP_ORIGIN; local development defaults to http://127.0.0.1:5173. Every mutating auth operation requires an exactly matching Origin. Public requests use relative /api/v1/auth URLs through the existing same-origin frontend proxy.

| Endpoint                   | Request                           | Result                                      |
| -------------------------- | --------------------------------- | ------------------------------------------- |
| POST /api/v1/auth/register | JSON displayName, email, password | 201 user projection, Set-Cookie             |
| POST /api/v1/auth/login    | JSON email, password              | 200 user projection, Set-Cookie             |
| POST /api/v1/auth/logout   | No body; session cookie           | 204, clears cookie and revokes stored token |
| GET /api/v1/auth/me        | Session cookie                    | 200 user projection or 401                  |

A successful account response contains only user.id, user.email, and user.displayName. It never returns a password hash, session token, key, or session identifier in JSON.

Email is trimmed/lowercased and bounded; names reject control and bidirectional formatting characters. Passwords must be 12–128 UTF-8 bytes. A randomly salted PBKDF2-HMAC-SHA256 hash with 600,000 iterations is stored in marketplace.users; no passwords or tokens are logged. Session credentials use 32 cryptographically random bytes, delivered exclusively in an HttpOnly, SameSite=Lax, path=/ host-only cookie. HTTPS production cookies are Secure and use the __Host- prefix. Only a SHA-256 digest of the raw session credential is stored in marketplace.sessions with a seven-day absolute expiry. Signing out revokes only the presented session.

Unknown email and incorrect password produce the same 401 response; unknown account attempts run the password derivation to reduce timing leaks. A bounded per-account in-process failed-login throttle applies six failures per fifteen-minute window. Login checks for a given identity are serialized under one of 64 bounded lock stripes, preventing concurrent password attempts from bypassing the per-account failure count. Public registration is separately capped at 30 attempts per minute per application process (HTTP 429 with 60-second Retry-After) before password hashing, to limit anonymous account-creation CPU/DB abuse. Successful logins serialize on the user row, prune expired sessions owned by that user, and retain at most five active sessions per account by removing older sessions. This is not a shared distributed rate limiter, and production ingress request throttling is an additional deployment requirement. Origin checks, SameSite, and host-only cookies protect mutation endpoints; full live HTTPS cookie and CSRF verification is still required.

No cart, orders, real payment, digital-key access, or password reset flows are implemented by this slice. No new migration: users and sessions already exist in 001_initial.sql. Session expiry, account ownership, and release behavior must be verified against real PostgreSQL and the final hosted same-origin architecture.

**Deployment limitations:** Registration protection is process-local, so distributed deployment requires a shared limiter or trusted ingress controls. Expired sessions for dormant users are not globally pruned until scheduled maintenance is introduced; only per-user login cleanup is currently automatic. Confirm same-origin cookie persistence and these operational limits during the hosted release gate.
