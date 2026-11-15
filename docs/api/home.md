# Homepage API — implemented banners, best sellers and deals

14 November 2026. **Banner (3B), Best Sellers (3C) and Deals (3D) routes have implementations.** Review exact-head CI before claiming verified Phase 3D acceptance. The API is a single Go application with independent feature services and one PostgreSQL database.

## Shared transport rules

All three planned routes are public, read-only and independently backed by separate existing tables. Register GET/HEAD with the existing HTTP router; unsupported methods return 405 and an Allow header. No authentication or cookies are required to browse home. No endpoint returns demo key codes, order/inventory identifiers, SQL diagnostics or user data.

Responses are JSON, Cache-Control: no-store, X-Request-ID and X-Content-Type-Options: nosniff, following the current API. Success returns HTTP 200 with a stable items array, including an empty array if no eligible content exists. Do not use 404 for an empty promotion block. The existing generic error envelope is retained:

```json
{
  "error": {
    "code": "service_unavailable",
    "message": "The service is unavailable."
  }
}
```

A database/connectivity or deadline failure is 503; unexpected storage-level failures are 500. In the implemented banner service, a malformed individual content row is skipped, with a safe structured warning; invalid data does not turn other valid promotions into a 500. The handler does not expose internal error strings. Reject unknown/duplicate query parameters with 400 rather than introducing undocumented filtering or pagination. Each endpoint has a bounded server-side result limit and deterministic ordering; its UI fetches independently.

**Important:** All examples describe seeded local demo contracts; no public deployment has occurred.

## GET /api/v1/home/banners — BannerService (3B)

Source: marketplace.homepage_banners only. Scan at most **12** active candidates, in position and ID order, and return at most **three valid records** in that order. Invalid candidates are skipped with safe banner ID and fixed reason logging. An empty list is a valid no-promotion state. Immutable seed 003 has already corrected the original /store destination to /catalog and supplied the original illustrated hero asset.

```json
{
  "items": [
    {
      "id": "50000000-0000-4000-8000-000000000001",
      "headline": "Discover your next world",
      "subheading": "An unofficial marketplace with fictional games and demo keys.",
      "imageUrl": "/images/banners/discover-world.svg",
      "linkHref": "/catalog",
      "position": 0
    }
  ]
}
```

- The SVG asset in this example is committed under `web/public/images/banners/`. It is an original, static illustration with no external dependencies.
- Validate raw Unicode headline (1–120 characters) and subheading (0–240 characters), including whitespace padding; reject control characters and empty/blank-only headlines. SQL LEFT projections cap the data read from unrestricted TEXT columns at limit + 1 character, so oversized values can be rejected without transferring huge source fields. Render all copy as text, never injected markup.
- Accept only original same-origin images at /images/banners/{lowercase-name}.svg or .webp, with simple letters, digits, underscores and hyphens in a nonempty filename. The SVG/.webp extension separator must be literal, and the entire path must be at most 400 bytes.
- During Slice 3B, accept only /catalog and validated /catalog query links, up to 2,048 UTF-8 bytes raw. The / path is not a suitable destination for an “Explore games” CTA. Never accept external hosts, open redirects, /store or future /product/... routes.
- An invalid stored banner is omitted (not made clickable). The handler logs the database-generated UUID and fixed reason category with its request ID, never the untrusted URL/text. A later valid candidate may fill its slot. If all candidates are invalid, return 200 with an empty items array; storage failures still use a generic 5xx response.
- Mark purely decorative imagery alt-empty if all meaningful information is in the adjacent heading and copy; otherwise provide an accessible alternative.
- No hardcoded text or image/target mapping in React. The block must visibly update from a changed banner source row.

## GET /api/v1/home/best-sellers — BestSellerService (3C, implemented)

Source: marketplace.homepage_best_sellers. Rank its explicit **fictional** demo_weekly_sales descending, with stable normalized product name then product ID ties. Join only active marketplace.products. Return at most **eight** records. Do not rank via catalog order or invented analytics. The UI may say "Best sellers in this demo"; it must never imply real production sales.

```json
{
  "items": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "slug": "solar-drift",
      "name": "Solar Drift",
      "edition": "Standard",
      "platform": "steam",
      "region": "global",
      "coverUrl": "/images/covers/solar-drift.webp",
      "lowestPriceCents": 1136,
      "available": true,
      "demoWeeklySales": 120
    }
  ],
  "currency": "EUR"
}
```

- The product summary matches the catalog's contract except for explicit seeded ranking metadata. The backend is authoritative.
- The lowest price considers **only active offers with currently unallocated keys** and is determined independently of the demo sales count. Sold-out active games may appear with available=false and lowestPriceCents=null; they must never appear purchasable.
- The endpoint must agree with /api/v1/products for the same SKU at a stable database snapshot (including sold-out and price semantics). **Implementation:** the catalog and Best Sellers repositories use one shared available-price SQL CTE, and Best Sellers makes one bounded query (no N+1).
- Changing only homepage_best_sellers must change this ranking/selection without altering banner/deal data. Product/offers/inventory changes are domain-shared and may legitimately affect more than one block.
- The UI must not render invented review counts or fake purchase timestamps. Demo weekly counts may be included in data for transparent ranking/testability but should not be presented as real sales.

## GET /api/v1/home/deals — DealService (3D, implemented)

Source: marketplace.homepage_deals, joined to the **specific seller offer** and its product and seller. Stable ascending position order (offer ID as tie-breaker); at most **eight** eligible offers. A deal is eligible only when the product and offer are active, offer.price_cents > 0, offer.list_price_cents > offer.price_cents, and at least one digital key belonging to that offer is unallocated. Keep the seller and offer identity intact.

```json
{
  "items": [
    {
      "offerId": "30000000-0000-4000-8000-000000000003",
      "productId": "10000000-0000-4000-8000-000000000002",
      "slug": "the-last-outpost",
      "name": "The Last Outpost",
      "edition": "Standard",
      "platform": "xbox",
      "region": "europe",
      "coverUrl": "/images/covers/the-last-outpost.webp",
      "sellerName": "Purple Lantern",
      "priceCents": 1273,
      "listPriceCents": 1873,
      "discountPercent": 32,
      "position": 0
    }
  ],
  "currency": "EUR"
}
```

- These price figures come from the selected seeded seller offer. Never substitute the catalog's lowest other-seller price; that would advertise the wrong offer.
- Calculate exact EUR cents using safe integer bounds. For a percentage badge use floor(100 × (listPriceCents - priceCents) / listPriceCents) with overflow-safe arithmetic, never round up and overstate savings; omit a 0% badge if the discount is positive but below 1%.
- Inactive products/offers, no inventory, absent/equal/lower list prices and invalid records must not display as an active discount. Empty eligibility yields items:[], not fabricated fallback deals.
- Read up to 32 eligible database candidates ordered by position and offer ID; validate bounded raw SKU/seller copy and same-origin covers in the service, omit malformed rows with safe reason codes, and return at most eight valid deals. A deal with a valid list price but less than 1% savings retains both exact prices without a misleading 0% badge.
- No purchase control or stock-reserving action belongs in this endpoint. The game/deal may link to a meaningful existing catalog search in Slice 3; the eventual seller-specific product/offer destination belongs to Slice 4.
- Pricing remains a nonlocking read snapshot, not a reserved quote. Checkout in Slice 6 must independently revalidate price and inventory.

## Client-side contract checks

All three clients must validate untrusted response shape and bounds, treat malformed JSON as a recoverable unexpected failure, and avoid revealing server response bodies. Fetch each route separately, with an AbortSignal and an explicit timeout/obsolete-response guard; request state belongs to the section, not a global homepage loading barrier. Retry only the affected section and preserve other sections.

Maintain standard loading/skeleton, empty, error, success and retry states, plus accessible status/focus announcements. If one endpoint fails or is delayed, the other blocks remain navigable. Only change current frontend timeout policies after targeted evidence about Render cold starts; no speculative provider behavior is part of this contract.

## Cross-boundary acceptance (real PostgreSQL and Chromium)

1. Every endpoint uses its own source table and service. To test HTTP data propagation, make a controlled **committed** change to one source table only inside the isolated `eneba_test` database, GET the corresponding API through its own pool connection, verify the other endpoints remain unchanged, then restore the fixture deterministically. Repository-level tests may instead mutate and read within the **same** transaction and roll back. An HTTP request on a separate connection cannot observe uncommitted data.
2. Banners: inactive excluded; position stable; malformed text/URL/image data omitted with sanitized diagnostics; later valid candidates remain available; returned list limited to three from 12 bounded candidates; asset exists and is original/licensed; link really navigates.
3. Best sellers: seeded counts produce ordering; ties deterministic; inactive excluded; sold-out and available prices agree with catalog; no keys disclosed; no per-card database requests.
4. Deals: only eligible offers; seller-specific price/list price; correct discount rounding; no stock/false sales badge; seller, edition, platform and region are not mixed across SKUs.
5. HTTP: GET/HEAD, 405 Allow, invalid query, 200 empty, 503 connectivity, 500 internal, no-store, request ID and no leaked SQL.
6. Browser: independently fail each endpoint (including timeout, cancellation and malformed JSON), retry one without remounting successful blocks, preserve the global search and browser history.
7. Responsive/accessibility: test 320, 360, 768 and 1280px, 200% text, keyboard navigation, axe A/AA, reduced motion and source-driven artwork. Don't accept a screenshot alone as evidence of behavior.
8. Full CI at the exact final commit with PostgreSQL 17.12/18.7, real database integration, frontend checks, browser suite and Go race/audit checks. Explicitly record any manual/hosted checks that remain pending.

**Historical boundary:** this began as the 3A proposal. Banner was implemented in 3B, Best Sellers in 3C, and seller-offer Deals in 3D. No new migration or seed was required for Deals because the offer-based table and three demo entries already existed. The domain's shared offer-stock existence predicate is reused by catalog/Best Sellers and Deals. Neither a homepage listing nor a catalog search selects or reserves the seller-specific offer for purchase.
