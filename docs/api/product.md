# Product details and seller offers

`GET /api/v1/products/{slug}` (also HEAD) returns an active SKU and its active
seller offers. Canonical slugs contain lowercase ASCII words/digits separated by
single hyphens, at most 160 bytes. Invalid slugs and any query parameters return
400; unknown/inactive products return 404. Unsupported methods return 405 with
`Allow: GET, HEAD`. The public UI's `offerId` query belongs to navigation and is
never sent to this endpoint.

```json
{
  "product": {
    "id": "10000000-0000-4000-8000-000000000003",
    "slug": "neon-circuit",
    "name": "Neon Circuit",
    "edition": "Deluxe",
    "platform": "playstation",
    "region": "united-states",
    "coverUrl": "/images/covers/neon-circuit.webp",
    "lowestPriceCents": 1410,
    "available": true,
    "description": "A fictional game used to demonstrate the marketplace. No redeemable game license is sold."
  },
  "offers": [
    {
      "offerId": "30000000-0000-4000-8000-000000000005",
      "sellerId": "20000000-0000-4000-8000-000000000001",
      "sellerName": "Northern Pixel",
      "sellerRatingPercent": 98,
      "priceCents": 1410,
      "listPriceCents": null,
      "available": true
    },
    {
      "offerId": "30000000-0000-4000-8000-000000000006",
      "sellerId": "20000000-0000-4000-8000-000000000002",
      "sellerName": "Orbit Games",
      "sellerRatingPercent": 96,
      "priceCents": 1660,
      "listPriceCents": 2260,
      "available": true
    }
  ],
  "currency": "EUR"
}
```

Identity includes edition, platform and region. `offerId` identifies one seller's
offer for that SKU; it is neither a product ID nor a key ID. Positive integer EUR
cents stay within JavaScript's safe-integer range. A nullable list price, when
present, must be higher than the current price. Seller ratings are integer 0–100
and fictional demo data.

An offer is available only if active and containing a key absent from
`order_items`; catalog, homepage and product reads share this SQL predicate.
Active sold-out offers remain visible, ordered after available offers. Each group
orders by price ascending and offer UUID for deterministic ties. `lowestPriceCents`
is the minimum available offer price, or null when none are available. Zero offers
returns `offers: []`; inactive offers are absent. No stock quantities, keys,
allocation IDs, private seller fields or purchase state are returned.

The repository makes at most two set-based data queries inside one read-only
repeatable-read transaction. Missing products use one; malformed requests use
none. [PostgreSQL's snapshot guarantee](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-REPEATABLE-READ)
keeps identity/From-price and seller prices consistent during concurrent changes.
There is no reservation or lock on inventory. Every new request reads a fresh
snapshot.

The curated demo allows at most **50 active offers per SKU**. The query reads 51
to detect overflow and returns a generic 500 rather than silently dropping a
requested seller. Add offer pagination before expanding this limit. Text is read
with one character beyond each bound, then validated without silent truncation:
name 140, edition 80, seller 100, description 5,000 Unicode characters; cover URL
400 bytes. Labels reject blank, control and bidirectional-formatting copy;
descriptions allow line breaks/tabs. Stored invalid prices/metadata fail closed.

A three-second server deadline bounds reads and pool waits. Connection errors and
timeouts return generic 503; unexpected source/query failures return generic 500.
Responses use JSON, no-store, nosniff and request IDs. Neither responses nor feature
logs include SQL or credentials.

The UI uses `/products/{slug}?offerId={uuid}`. A plain product link selects nothing.
A valid offer identity selects only the matching returned offer. Missing, inactive,
foreign-product or malformed offer links produce a recoverable notice without a
cheapest-seller fallback. A matching sold-out offer is shown checked and disabled;
its price never becomes an available selection. Available radio choices update
URL history. Refresh/new tabs preserve identity and read current server data;
selection changes alone reuse the page's snapshot. Future purchasing must revalidate
stock and price transactionally; this slice performs no purchase or reservation.
