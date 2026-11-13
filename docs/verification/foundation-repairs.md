# Foundation repair verification

13 November 2026. This supplements the original foundation record; it does not replace earlier results.

## Implemented boundaries

- Migration target comparison and both credential checks happen before Goose provider initialization. Explicit endpoints/databases must match, including project identity on a shared Supabase pooler. Multi-host maintenance URLs are rejected.
- Provisioning persists and syncs ignored recovery credentials before creating roles. Failed resource creation or final configuration publication retains that file. Existing configuration and database resources are never adopted or deleted automatically.
- The server constructs its router; shared HTTP infrastructure owns JSON errors, method handling, request IDs, panic recovery and request logging. Partial responses abort on panic, including after a flush.
- Integration and browser commands discover future feature tests. Shared-database packages run serially. Browser setup waits for the proxied readiness endpoint.
- The scoped minimatch 11.0.1 override is resolved in the root lockfile. The tooling regression checks discover every TypeScript source, respect output ignores and execute a real lint rule.
- npm ci --offline restored all 249 packages with the scoped override intact; lint discovery passed again against that restored tree.
- The full frontend type/lint/test/build gate also passed after restoration. Cold lint execution was slow; diagnostic checks confirmed build/dependency directories were ignored and source files were covered. No lint configuration workaround was introduced.

## Local evidence

- Go formatting, vet, unit tests and builds passed. Frontend type checking, lint, four tests and production build passed.
- Full npm audit passed with zero vulnerabilities after the override was actually installed. An initial install left an invalid old entry; targeted npm update corrected the lockfile and installed tree before acceptance.
- Pinned govulncheck 1.9.0 passed with no vulnerabilities found. One request to the official index timed out; a retry with GODEBUG=netdns=cgo,tlsmlkem=0 completed successfully. No certificate verification was disabled.
- PostgreSQL 18.7 Windows binaries match EDB's published SHA-256, pinned in bootstrap. Installation retains server/CLI/runtime directories and licenses, excluding the bundled graphical tools. A completion marker prevents partial extraction from being used.
- Before updating, both project databases and cluster roles were backed up under ignored .local/backups. Custom-format archives passed pg_restore --list verification and a SHA-256 manifest was written. Backup contents include private role information and must stay local.
- Only the project-owned cluster on port 5433 was restarted using 18.7. Both databases retained 17 products, 58 keys and zero orders. Search GIN indexes were rebuilt. The original service on port 5432 remained reachable.
- npm run doctor authenticated to the database and confirmed server version 18.7.
- The eight real-PostgreSQL foundation scenarios passed, including the new authentication-before-migration-discovery check. Existing unique allocation, cross-offer identity and immutable seed checks remain intact.
- Browser checks passed at 1280px, 768px and 360px with readiness-gated startup and no retries.
- Fresh native setup was separately verified in an isolated 18.7 cluster on port 5434: provision, migrate twice, seed twice and both runtime logins. First migration/seed runs applied one version; repeats applied zero. The verification cluster was stopped afterward; its ignored local files remain available for inspection.

## External and remaining evidence

- GitHub Actions now targets PostgreSQL 17.12/18.7, lint discovery, advisory scans and Linux race checks. Remote execution remains pending publication; no local PostgreSQL 17 or Linux result is claimed.
- At the Slice 1 checkpoint the live user-facing VS Code conversation source was located and its snapshot refreshed. Its manifest records the exported boundary; the active final response needs the next refresh. Earlier unavailable conversations still need actual exports before submission and must not be reconstructed.
