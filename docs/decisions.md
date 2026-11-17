# Architecture decisions

## One transactional application

The Go API is a modular application with catalog, home, auth and purchase features. Each feature owns HTTP translation, business policy and SQL. The entry point wires concrete dependencies. Shared interfaces exist only at real boundaries, such as the authentication store; there is no generic repository, ORM or separate inventory service. Keeping purchase and inventory in PostgreSQL gives one atomic integrity boundary with less operational complexity.

## SKU identity and money

A SKU includes game, edition, platform and region. A seller offer has its own identity and price. Public prices are integer EUR cents within JavaScript's safe range; formatting never changes authoritative amounts. The current product deliberately supports one key per seller offer per order and ten cart lines. Multi-quantity needs an explicit migration and allocation design rather than an implicit change to these rules.

## Allocation and idempotency

An order-item reference is the allocation; there is no separate sold flag to synchronize. PostgreSQL enforces unique key allocation and the composite key/offer relationship. Checkout locks the buyer first, checks matching idempotent replays, then locks offers in UUID order. It validates prices after locking and uses a new READ COMMITTED statement to observe earlier committed allocations. Every receipt and allocation commits together or rolls back.

A matching retry returns the original receipt before considering current stock or price. Transport failure does not prove purchase failure, so the client preserves the same buyer-scoped attempt and UUID. Historical order reads use purchased name/price snapshots and the already allocated key, including after removal from sale.

## Read ownership and bounded work

Authorization is part of order SQL, using the session-derived buyer; foreign and missing orders have the same response. Keys never appear in public projections or history summaries. Catalog and history count/page reads share repeatable-read snapshots. Queries are set-based and bounded, with request deadlines and sanitized errors. Demo-scale scans are preferable to speculative search infrastructure. Homepage banner, ranking and deal sources load and recover independently; deal prices always belong to the selected seller offer.

## Browser state and security

URLs own catalog filters and product/offer selections. Browser storage holds validated cart identities and buyer-scoped checkout recovery, never delivered keys or credentials. Protected order readers clear their state on session notifications, tab visibility changes and focus, abort old requests and reject late responses. A small invalidation signal crosses tabs; the server authorizes every new read.

Authentication uses hashed server-side sessions and Secure, HttpOnly, SameSite cookies in production. Mutating requests require the configured exact Origin. Same-origin Vercel rewrites preserve this model across the Render API. Process-local rate limiting fits one demo instance; horizontal deployment would require a shared ingress policy.

## Reproducible maintenance

Pinned Go, Node, npm and PostgreSQL versions plus lockfiles/checksums make the toolchain explicit. Local development uses a separate project-owned cluster and isolated development/test databases. Migration and application credentials have different responsibilities. Goose owns schema history; checksum-verified seeds own fixture history. Neither runs during server startup, and applied versions never change or restock allocated keys. Recovery credentials are persisted before provisioning creates resources.

## Presentation and delivery

Feature screens share a small set of visual tokens and product components. Original artwork is reused with explicit compact or portrait card presentation. Marketing actions lead to implemented destinations; no unsupported controls or invented promotions are shown. Payments and keys remain simulated, with one discreet project disclosure and the necessary checkout notice.

Tests cover PostgreSQL ownership, concurrency and constraints alongside frontend request lifecycles and browser behavior. The verification record separates completed checks from known limits. The public development history uses authentic visible exchanges with clear source and snapshot boundaries, not reconstructed dialogue.
