# Adopted engineering decisions

These decisions describe the implementation. The supplied blueprint remains unchanged under reference.

## One modular Go API

Checkout, key allocation, and idempotency need one PostgreSQL transaction. One deployable keeps that boundary explicit. Feature ownership gives us understandable modules without adding distributed infrastructure. Constructor wiring lives in cmd/server; shared HTTP helpers do not import feature packages.

Prefer direct code to extra layers. Isolate unavoidable complexity in stable boundaries: scripts for native tooling and database/maintenance for provisioning, Goose, and seeds. The server does not import maintenance code. Feature services will use small behavior contracts only when a real boundary needs them. Compatibility assumptions and pending checks are recorded rather than treated as proven.

## Native tools with an isolated local cluster

Use the installed PostgreSQL 18 binaries and a checkout-owned cluster on loopback port 5433. Administrator access to the existing service was unavailable, so a separate cluster gives reproducible setup without modifying other applications' databases.

Go and Node are versioned local installations with verified archive checksums. This costs some checkout-local disk/cache space and avoids changing toolchains used by other projects.

The selected TypeScript version is 6.0.3 because the current TypeScript ESLint release supports versions below 6.1; the newest TypeScript 7 release is incompatible with that range. Runtime dependencies and tool versions are pinned in the lockfiles.

## Direct PostgreSQL access and one migration authority

Use pgx for explicit SQL and Goose for version tracking. Supabase supplies PostgreSQL hosting rather than application authentication or browser data access. A second migration history would create competing sources of truth.

Schema ownership and runtime access use separate logins. Local development and integration tests also have separate databases/logins. Environment-specific grants are applied by the explicit migration command after Goose, rather than embedding local role names into portable schema SQL.

Goose's operational ledger is explicitly qualified as public.goose_db_version. Application DDL uses the private search path, so bookkeeping must not depend on that path. A real-database run caught this boundary before the initial migration was accepted.

## Private schema and explicit maintenance

Marketplace data belongs to the unexposed marketplace schema. The dedicated hosted project's unused Data API must be disabled before deployment. Go owns authorization; Supabase Auth policies would not describe our opaque Go sessions.

Application startup does not perform maintenance. Migration/seed failures remain explicit setup failures rather than partially starting an application that silently changes data.

## Immutable fixture history

A seed_versions table records each fixture filename and SHA-256. Applied files are checked and skipped; edited versions fail. This small operational ledger prevents repeated setup from replenishing allocated or deliberately removed demo keys. It is separate from purchase idempotency and introduces no new business state.

## Blueprint clarifications

- SKU identity includes edition alongside game, platform, and region.
- Keep one unit per selected offer and the v1 order/offer uniqueness constraint.
- Preserve composite key/offer identity and unique key allocation in the database.
- The pgcrypto extension is unnecessary for the supported PostgreSQL versions' built-in gen_random_uuid. Keep pg_trgm for the planned search.
- Future migration examples do not reserve a particular numeric version.
- The user's approved cadence allows continuation through agreed slices after checks pass. The archived per-session stop instruction is not active.

## Contracts grow with implemented behavior

The foundation exposes health and readiness only. Feature DTOs, business errors, authentication, and state management are introduced with their owning slices. The initial interface contains working connection recovery rather than inactive shopping controls.

## Evidence before claims

Local checks, browser observations, remote CI, and public deployment are distinct evidence. Document pending checks rather than inferring that generated configuration has worked. Preserve complete user prompts and visible assistant responses, including user-input decisions, without hidden model reasoning or credentials.
