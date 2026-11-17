# Homepage API

The homepage has three independently loaded sections: featured banners, best sellers and deals. They are served by the same Go API, but each reads from its own PostgreSQL source. React displays the data returned by these endpoints; the promotion lists and links are not hardcoded into the UI.

All routes support `GET` and `HEAD`. They are public, read-only and return JSON with `Cache-Control: no-store`, `X-Request-ID` and `X-Content-Type-Options: nosniff`. Other methods return 405 with an `Allow` header. Unknown or repeated query parameters are rejected with 400.

A successful request returns HTTP 200 and an `items` array, even when the array is empty. Database or deadline failures return 503; unexpected server failures return 500. Error responses never include raw SQL, keys or private account data.

## Featured banners

**`GET /api/v1/home/banners`**

Banners come from `marketplace.homepage_banners` in position order. The service reads up to 12 active candidates and returns at most three valid banners. Invalid content or destinations are skipped; a broken banner does not take down the homepage.

Example:

```json
{
  "items": [
    {
      "id": "50000000-0000-4000-8000-000000000001",
      "headline": "Discover your next world",
      "subheading": "Great games, exciting worlds and more ways to find your next favorite.",
      "imageUrl": "/images/banners/discover-world.svg",
      "linkHref": "/catalog",
      "position": 0
    }
  ]
}
```

Headlines must be nonblank and at most 120 Unicode characters; subheadings allow up to 240. Both reject control characters and invalid stored data. Image URLs must be short, same-origin paths under `/images/banners/` with `.svg` or `.webp` extensions. Links must point to `/catalog` or a validated catalog query, never external URLs. The service skips malformed records and logs only safe identifiers and reason categories.

## Best sellers

**`GET /api/v1/home/best-sellers`**

The `marketplace.homepage_best_sellers` table supplies the ranking. This project uses **seeded fictional sales counts**, not live sales analytics. The service joins active products, sorts by the stored weekly count with deterministic name/ID ties and returns at most eight products.

Each product contains the catalog's public identity fields and:

- `lowestPriceCents` — the cheapest available active seller offer, or `null` when sold out
- `available` — whether an unallocated key exists for an active offer
- `demoWeeklySales` — seeded ranking data, not a real customer purchase count

The count is used for ordering, not presented as real-world sales. The availability predicate is shared with the catalog so the homepage cannot advertise a sold-out offer at an unavailable price.

## Deals

**`GET /api/v1/home/deals`**

Deals come from `marketplace.homepage_deals` and point to **specific seller offers**. The service returns at most eight eligible offers, ordered by position and offer ID.

Each result includes its game identity, cover, seller, `offerId`, `priceCents`, `listPriceCents`, `discountPercent` and `position`. A deal is shown only when the product and offer are active, an unallocated key exists, and the list price is above the selling price.

The percentage is rounded **down** so the UI never overstates a discount. A positive discount below 1% has no misleading 0% badge. The deal price always belongs to the selected seller offer—it cannot be replaced with another seller's cheaper catalog price.

Deals are read-only. Clicking one opens the corresponding product and offer; inventory is allocated only after checkout validates the purchase.

## Frontend behavior

The three sections request their data independently, with input validation, abortable requests and bounded loading/retry states. An unavailable section can be retried without blocking the others. Game images and banner copy come from the API.

Requests never reserve stock. Prices and availability are checked again at checkout. See the [catalog](catalog.md), [product](product.md) and [checkout](checkout.md) contracts for the rest of the buying flow.
