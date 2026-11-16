# Catalog API

GET /api/v1/products is public and read-only. It lists active game/platform/region/edition SKUs, including sold-out products. It does not reserve inventory or quote a future purchase price.

## Query parameters

All parameters are optional and may appear only once. Unknown parameters, invalid query encoding and unsupported values return 400. Parameters use their documented names and enum casing. Numeric values use decimal digits only: signs (including `+1` and `-0`), fractions and exponents are rejected. Promotional catalog links follow this same grammar.

| Parameter     | Accepted values and default                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| q             | Trimmed, valid UTF-8 name search, up to 100 Unicode code points; NUL is rejected. Empty means browse.         |
| platform      | steam, xbox, playstation, nintendo, other; empty means any.                                                   |
| region        | global, europe, united-states; empty means any.                                                               |
| minPriceCents | Inclusive nonnegative integer EUR cents, at most 9007199254740991.                                            |
| maxPriceCents | Same bound; cannot be lower than minPriceCents.                                                               |
| sort          | relevance, name_asc, price_asc, price_desc. Defaults to relevance with a nonempty search, otherwise name_asc. |
| page          | Positive safe integer; default 1. Values over 9007199254740991 are rejected.                                  |
| pageSize      | Integer from 1 to 50; default 24.                                                                             |

Example: `/api/v1/products?q=solar&platform=steam&region=global&sort=price_asc&page=1&pageSize=24`.

## Response

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
      "coverUrl": "/images/demo-cover.svg",
      "lowestPriceCents": 1136,
      "available": true
    }
  ],
  "page": 1,
  "pageSize": 24,
  "total": 1,
  "currency": "EUR"
}
```

The lowest price considers only active offers with at least one unallocated key. A cheaper sold-out offer cannot underprice an available one. No available offer means lowestPriceCents is null and available is false. Price bounds omit these unpriced products. Neither key codes nor private inventory identifiers appear in the projection.

Filter and ordering operate before pagination. Price orders put null prices last in either direction. Name ties use normalized name with C collation, then UUID. Empty and out-of-range pages return items as an empty array; total still describes all matching products.

Search matches names case-insensitively using PostgreSQL text matching. Percent, underscore and backslash are literal characters. One- and two-character searches use substring matching only. Longer searches also accept word_similarity scores of at least 0.4, ordered exact, prefix, substring, then typo; typo ties first use descending similarity. Explicit name/price sorting overrides relevance.

## Errors and transport

Errors use `{ "error": { "code": "invalid_query", "message": "..." } }`:

| Status | Code                | Meaning                                                                  |
| ------ | ------------------- | ------------------------------------------------------------------------ |
| 400    | invalid_query       | Invalid or ambiguous query parameters.                                   |
| 405    | method_not_allowed  | The known endpoint supports GET and HEAD; see Allow.                     |
| 503    | service_unavailable | Database connection failure, resource unavailability or request timeout. |
| 500    | internal_error      | Unexpected storage failure or invalid stored prices.                     |

Responses are JSON, use Cache-Control: no-store and include X-Request-ID. Storage errors expose no SQL or connection details. The request has a three-second deadline; cancellation propagates to PostgreSQL.

## Implementation choices

The catalog service owns validation and safe monetary projection. The SQL repository owns availability, filtering and ordering. It performs at most two set-based data reads in one read-only repeatable-read transaction; BEGIN/COMMIT are additional transaction commands. The shared snapshot keeps count and rows consistent within a response. An empty/out-of-range result needs only the count read.

Reusing one SQL predicate for both reads prevents count/page drift. Two ordinary reads also preserve totals for an empty page without complicated window-count result mapping. At the current 16-product demo scale, bounded scans are acceptable; the fuzzy function predicate is not claimed to use the existing GIN index. Optimize only after measuring representative usage. No new migration, dependency, stock cache or search service was introduced.
