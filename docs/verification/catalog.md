# Slice 1 catalog verification

13 November 2026. Scope: the public catalog API. The storefront remains the connection shell; catalog/header UI follows in Slice 2.

## Implementation and reasoning

- One catalog package owns handlers, query validation, safe EUR-cent projection and SQL reads. The server constructs concrete dependencies and registers routes. No runtime dependency, schema migration or edited seed was introduced.
- Two set-based data reads share a read-only repeatable-read transaction. One shared SQL predicate defines both total and rows; available prices are calculated before filtering, ordering and pagination. Empty pages retain totals without complex result mapping.
- Available inventory remains an unallocated digital_keys row, determined through order_items. There is no stock flag, cache, reservation or second allocation authority.
- Search uses escaped literal ILIKE and word_similarity at 0.4 for queries of at least three characters. Fixed SQL ordering fragments avoid accepting SQL syntax from clients. Unpriced products remain searchable and price sorts put them last.
- Query inputs and returned cents are bounded. HTTP has a three-second catalog deadline, propagates cancellation and returns generic storage errors. The detailed public contract is in [Catalog API](../api/catalog.md).

## Local checks

| Gate                      | Evidence                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run verify            | Formatting, tooling discovery, Go vet/tests/build, frontend types/lint, four frontend tests and production build passed.                                                                                                                 |
| npm run test:integration  | All discovered packages passed against isolated PostgreSQL 18.7 eneba_test. Twelve catalog scenario groups and the eight foundation database scenarios passed.                                                                           |
| Query budget              | Actual pgx tracing observed two data queries for both one-item and full pages; invalid parameters issued zero data queries. Empty/out-of-range results use only the count query.                                                         |
| Catalog data rules        | Default results contain all 16 active SKUs. Lunar Legacy remains visible without a price; Deep Signal uses its available 3304-cent offer, excluding the unavailable cheaper one.                                                         |
| Search and pagination     | Exact/partial/short/typo searches, literal percent/underscore/backslash/apostrophe, relevance classes, normalized-name/UUID ties, combined inclusive bounds and ordering before pagination passed.                                       |
| Monetary safety           | Boundary unit tests and a PostgreSQL fixture confirmed that an unsafe BIGINT price cannot reach JSON.                                                                                                                                    |
| Cancellation and failures | A real table lock caused a generic 503 after about three seconds. After unlocking, the next request succeeded and no connection remained acquired. Unreachable-database and unexpected-pool-failure responses leaked no private details. |
| Browser/proxy             | Four Playwright tests passed without retries: actual browser JavaScript fetched typo and sold-out results through Vite, plus shell checks at 1280/768/360px. No uncaught page errors were observed.                                      |
| Dependency review         | Pinned govulncheck 1.9.0 passed after adding catalog. Full npm audit was clean at the foundation checkpoint and dependency versions remain unchanged in Slice 1.                                                                         |
| Runtime boundary          | go list -deps ./cmd/server confirmed that neither maintenance nor Goose enters the server graph.                                                                                                                                         |

Extra product/offer/key/order fixtures live inside rollback transactions. The foundation suite also confirms the fixture data and allocation constraints remain intact afterward. The browser reads the separate development database.

Final HTTP review additionally corrected response recording after invalid status-code panics and marks handled 5xx responses as failures. The focused HTTP unit suite passed after those changes; it covers pre-header recovery, partial-response aborts and flushed responses.

## Source preservation and pending evidence

Applied SQL, immutable seeds, source references and Go dependency files remain unchanged. The verified user-facing VS Code conversation source was refreshed as a snapshot; its manifest records entry counts, timestamps and redactions. Visible messages are checked against that source up to the snapshot timestamp. Internal approval/agent logs are excluded. The active final response needs the next refresh; missing earlier conversations are not reconstructed.

GitHub Actions is prepared for PostgreSQL 17.12/18.7 and now includes integration tests in Linux race checks. Remote execution, local PostgreSQL 17, public deployment and HTTPS behavior remain pending. No remote or cross-version success is inferred from generated workflow configuration.
