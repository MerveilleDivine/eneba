# Orders and delivery

`GET /api/v1/orders` requires a valid buyer session. Optional `page` and
`pageSize` default to 1 and 20; page size is at most 50. Unknown, repeated and
invalid query parameters return 400. Results are ordered by creation time and
UUID descending and contain `{items,page,pageSize,total}`. Each summary has
`id`, `createdAt`, `totalCents`, `currency: "EUR"` and `itemCount`; no keys.

`GET /api/v1/orders/{orderId}` returns the owner's persisted receipt with
`id`, `createdAt`, `totalCents`, `currency` and `items`. Each item contains
`id`, `productName`, `sellerName`, `unitPriceCents` and `keyCode`.
Names and prices are purchase-time snapshots. A delivered code is the key
already allocated to that order item, including after an offer is removed.

The server derives the buyer from the session, never a request parameter.
Anonymous/expired sessions receive 401; foreign and nonexistent orders receive
the same 404. Malformed identifiers return 400. Reads support HEAD and return
`Cache-Control: private, no-store` and `Vary: Cookie`. Database failures are
sanitized. Keys are nonredeemable and must not be logged, cached or placed in URLs.
