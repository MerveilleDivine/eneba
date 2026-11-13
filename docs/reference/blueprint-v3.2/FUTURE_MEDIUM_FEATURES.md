# Deferred medium-priority features — implementation seams, not unfinished features

**Status:** Design notes only. These features are **not** part of the current submission scope. Eneba did not explicitly require them, and no available assessment rubric guarantees that excluding them is penalty-free. Preserve the ability to add them without paying for their complexity now. 

## 1. Multi-unit purchasing from one seller offer

**Why defer?** The assignment requires a cart/checkout, not a quantity picker. One unit per offer is a clear, testable simplification. The feature would introduce more stock, pricing, UX and transaction cases.

**Low-cost seam already included in v1**

- Cart state and the quote/checkout API both use a list of `{offerId, quantity}` records, with `quantity` **required to equal 1** until the feature is truly implemented.
- Quote exposes the authoritative `unitPriceCents` and `lineTotalCents`; checkout carries `expectedUnitPriceCents`. Total comes from server-verified `unitPriceCents × quantity`, though in v1 quantity=1.
- The database represents every delivered key with **one** `order_items` row. This remains valid for future quantities: ordering three keys produces three rows with the same `(order_id, offer_id)` and different unique `digital_key_id` values.
- **One explicit future migration:** drop `one_of_each_offer_per_order` on `order_items`. Do **not** drop `UNIQUE(digital_key_id)` or the `(digital_key_id, offer_id)` composite FK. Do not drop v1 uniqueness before activating the feature.

**Future implementation (only after explicit approval)**

1. Introduce migration `002_multi_quantity.sql` after deployment migration sequencing is verified; update server validation to `1 <= quantity <= configuredMax` and total cart limits.
2. In the same buyer-first / offer-locked transaction, select `quantity` **distinct** available keys for every offer. Reject whole order if any offer has fewer than required; rollback everything.
3. Create one order item per allocated key, preserve each item’s snapshot price/name, and calculate `SUM(unitPriceCents × quantity)` with overflow protection. Fingerprint must already include quantity to keep replay semantics correct.
4. Add `+/-` quantity controls, stock caps, quote refresh, order receipt grouping and clear total presentation.
5. Prove multi-user concurrent purchasing, insufficient-stock rollback, duplicate request replay, changing quantities under same key, and price changes. Run original v1 purchase tests as regression.

**Until then:** a duplicate offer or quantity != 1 is rejected server-side; no quantity controls or unsupported promise in the UI.

## 2. Written customer reviews

**Why defer?** The assignment asks for seller offer comparison, not a review-writing flow. Keep visible demo seller ratings for the core marketplace. Do not invent reviews, fake verified-buyer counts or claim seller rating comes from written reviews.

**Low-cost seam already included in v1**

- `products.id`, `orders.user_id`, `order_items.id`, and `order_items.offer_id` form a reliable path from a real demo purchase to the reviewed SKU. No extra v1 schema columns are necessary.
- The existing product page can display a reviews section later; do **not** render an empty fake section or inactive buttons now.
- Keep `sellers.rating_percent` explicitly separate from any future product-review rating. They represent different concepts.

**Future implementation (only after explicit approval)**

1. Add `product_reviews` in a **new migration** with `id`, `order_item_id UNIQUE NOT NULL REFERENCES order_items(id)`, `rating SMALLINT CHECK (rating BETWEEN 1 AND 5)`, bounded comment, timestamps. Derive reviewer through `order_items → orders.user_id`, and reviewed product through `order_items → offers.product_id`; do not duplicate mutable author/product identity unless a documented performance requirement justifies it. Decide whether users can review each purchased key once or each SKU once before finalizing the uniqueness rule.
2. Add a small reviews module **only when the feature is actually built**. Read reviews on product pages with paginated queries; create reviews for signed-in buyers only after ownership of the purchased item is verified; use parameterized SQL, text length caps and output escaping. Include edit/delete only if genuinely needed.
3. Render verified-buyer feedback and clearly distinguish product reviews from seller rating. Show honest empty states.
4. Tests: non-buyer denied, buyer cannot review another user’s order, duplicate review constraint, XSS-safe rendering, pagination and stable ordering, deleted/hidden product policy, and no leaks of private order identifiers in public review output.

**Until then:** seller demo rating is visible, but no writable reviews or phantom API endpoints.

## Not prepared upfront

Promo codes and personalized recommendations were judged **low–medium**, rather than clearly medium. They are not required and have **no advance interfaces, fields, hooks, tables or placeholder UI**. They can be independently scoped after submission if genuinely valuable. Low/very-low features also remain deferred with no provision.

## Activation rule (both features)

**Do not start either feature until** all Eneba-required core flows, tests, mobile visual checks, public deployment, documentation and complete AI transcript have passed. Then select **one** feature, introduce one dedicated vertical slice, document changed contracts/schema, add both happy and failure-path tests, run full regression and explicitly approve the result. Stop if the extension threatens the deadline or the working core.
