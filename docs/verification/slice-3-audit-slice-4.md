# Independent homepage audit and product-detail delivery

15 November 2026. Authorized scope: audit Slice 3B–3E, correct demonstrated
weaknesses, and deliver Slice 4 product details and seller-offer selection.
Cart, authentication, checkout, keys, deployment and main merges are excluded.
No conversation exports are part of this checkpoint.

## Baseline and integration

Remote head `318d61da5442d423f2150fb79e998b646d568d6a` passed both PostgreSQL
17.12/18.7 jobs in [push CI](https://github.com/MerveilleDivine/eneba/actions/runs/43710784307)
and [PR CI](https://github.com/MerveilleDivine/eneba/actions/runs/43710789344).
The local branch contained three separate catalog checkpoints. The user authorized
finishing the existing merge. A checksum-verified ignored backup preserved all
36 conflict/worktree/ancestor copies; resolutions adopted the later verified
implementations. The resolved code initially matched the remote tree exactly.
Both histories are preserved, without a rebase or force push. Conversation files
remain outside the resulting feature tree, with earlier private history unchanged.

## Independent findings

| Finding                                                   | Cause and effect                                                                                                                                                                      | Correction and regression                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: browser-invalid numeric banner destinations       | Go's signed integer parser accepted `+1` and `-0`; the browser requires decimal digits. A stored banner could pass the server and make the browser reject its entire banner response. | Use unsigned decimal parsing in the catalog query owner, also used by promotional link validation. Failing Go catalog/banner regressions and real HTTP banner omission cases cover both spellings. |
| Medium: visually blank banner headline passes Go          | Go whitespace trimming excludes the BOM character that JavaScript trims. A BOM-only headline passed the service and poisoned a response containing other valid banners.               | Match the browser's required-copy whitespace behavior after raw length validation. A failing Go regression, browser-parser case and real PostgreSQL/HTTP omission case cover it.                   |
| Low: silent banner fixture cleanup errors                 | Three cleanup callbacks discarded errors, hiding a possible contaminated test database after a failed run.                                                                            | Report restoration failures using fresh bounded contexts and retain source-specific cleanup.                                                                                                       |
| Maintenance improvement: duplicated retry focus lifecycle | The banner repeated the helper already used by Best Sellers and Deals.                                                                                                                | Reuse the existing feature-owned helper; keep requests and state independent. Existing keyboard/retry browser acceptance protects behavior.                                                        |

The independent source tables/services, shared availability SQL, seller-specific
Deals prices, floored safe-integer savings, and independent request lifecycles are
appropriate. Keep concrete constructor wiring, set-based reads and the canonical
catalog query owner. No new deployable, repository interface, cache or schema
generator is justified. Unique database positions make strict client ordering
checks valid; they are not a tie-ordering defect.

### Additional verification findings

- **Low: cover URL normalization bypass.** A root-relative value containing a
  newline, tab or carriage return passed validation, but browsers strip those
  controls and interpret it as a protocol-relative external URL. This is a URL
  policy defect, not script execution. Reject raw controls before classifying
  the URL. Three regressions prove normalization and fail before the repair;
  this canonical validator also protects Best Sellers.
- **Medium: incomplete staged snapshot.** Verification saw untracked helpers
  that Git would omit from a commit. The existing gate checked only unstaged
  tracked edits. Reject nonignored untracked files too. An isolated Git fixture
  reproduces acceptance before the repair and checks clean staging plus both
  rejection paths. Its verifier stub never replaces real project verification.
- **Low: enlarged phone heading.** The 320px/200% screenshot split the ordinary
  word “discovering” across lines even though overflow and axe checks passed.
  Narrow-screen section-title sizing and a browser text-range assertion protect
  readable headings without concealing overflow.

The blank-copy regression also reproduced for a BOM-only Deals seller name.
Banner and Deal validation now share a private homepage text validator, keeping
raw size limits and the existing Deal bidi checks. The invalid seller is omitted
before it can invalidate the browser's entire section.

## Slice 4 plan and acceptance

1. **Audit checkpoint:** verify the corrections locally, inspect homepage screenshots
   and complete the non-rewriting feature merge before product work.
2. **Product read and selection slice:** add `GET /api/v1/products/{slug}` and
   `/products/:slug`, with a real catalog entry point. Keep HTTP translation,
   service validation and SQL in the catalog backend feature. Read identity and
   active seller offers in at most two set-based queries in one read-only
   repeatable-read transaction; reuse the authoritative offer-stock predicate.
   Apply the existing three-second server deadline and generic errors.
3. **Complete entry paths:** homepage Best Sellers and Deals open the same product
   route. Deals retain their exact `offerId`; they must not silently select another
   seller. URL state owns selection; prices and availability come only from Go.
   Browser history, refresh and new tabs preserve product/offer identity. Catalog
   return navigation retains its valid search/filter context when available.
4. **Final acceptance:** invalid/inactive/missing products; sold-out, invalid,
   foreign-product and inactive offers; empty lists; integer EUR prices; timeout,
   cancellation, retries and late responses; keyboard/focus and axe; manually
   inspected 320/360/768/1280 and enlarged-text screenshots. Run full local gates
   and inspect final exact-head CI on both PostgreSQL versions, including race
   and dependency checks.

The product response contains public SKU identity, description, artwork and active
offers with distinct offer/seller identifiers, rating, current/list prices and
availability. It contains no keys, allocation identifiers or invented stock.
The curated demo has three sellers; a documented finite offer-read guard must fail
closed rather than silently drop a requested seller. Larger catalogs would need
offer pagination before that guard is raised.

Shared frontend code will be extracted only for real catalog/home/product consumers:
the public product summary, SKU facets, exact EUR formatting, product links and the
existing keyed read lifecycle. Selection and product failure behavior stay feature
owned. No global state, storage of frontend prices, reservation or purchase action
is introduced.

## Evidence

The added catalog/banner/Deal, URL-policy, incomplete-commit and heading regressions
failed before corrections. Catalog/home unit tests, all three tooling tests and
113 frontend tests pass after repairs; frontend types and lint pass. The full
PostgreSQL integration suite passed after the initial validation changes. Eighteen
homepage Chromium checks passed without retries, followed by the repaired 320px
enlarged-text check. Actual desktop, tablet/enlarged-text and phone/enlarged-text
images were inspected; the corrected phone title stays readable without splitting
its ordinary final word. Local build/checkpoint and exact-head CI evidence follow
below when observed. Physical devices, screen readers and hosted timings remain
unverified.

Audit checkpoint `9905d23` passed the full local verification hook. Remote runs
[43808895459](https://github.com/MerveilleDivine/eneba/actions/runs/43808895459) and
[43808889083](https://github.com/MerveilleDivine/eneba/actions/runs/43808889083)
failed the new 320px enlarged-word check on Linux (84/85 browser cases passed).
They are not accepted CI runs. The initial heading size fit Windows' font metrics
but still split the word with Linux's system font; the narrow heading size was
reduced further, keeping the same assertion. All prior format/type/lint/build,
unit, tooling, audit and PostgreSQL integration steps in those runs passed. Race
steps were skipped after the browser failure. Reverification follows on the
integrated checkpoint.

## First product checkpoint

Implemented the two-read catalog-owned product API and `/products/:slug`, with
catalog and Best Sellers entry points. Product labels/details, current available
From-price, active seller offers, safe integer prices, stock and ratings come from
PostgreSQL. No default seller is chosen. URL selection preserves the exact offer,
including disabled sold-out selections and recoverable invalid/foreign/missing
links. Catalog return context survives normal navigation and reload.

Shared summary/facet/money/card modules remove existing home-to-catalog
presentation dependencies. One captured-identity read hook now owns the previous
catalog/home timeout, cancellation and retry mechanics; product uses the same
boundary. Existing catalog adversarial tests remain passing. Removed the unused
homepage link styling after the shared card took responsibility for navigation
and keyboard focus.

Local evidence before the checkpoint: 139 frontend tests plus three new product
navigation/late-response/deadline tests pass; types, lint and production build pass.
Real PostgreSQL product tests cover exact seller identity, unavailable cheaper
offers, inactive/missing products, allocations, empty offers, bounded reads,
literal public-field allowlists, cancellation, generic failures and the actual
three-second pool-wait deadline. A committed concurrent price mutation between
the two production repository reads proves snapshot consistency; fresh requests
see the new price and bounded cleanup restores both original prices.

The first targeted browser run passed 12/13 checks; its failure was a test's wrong
Solar Drift seller assumption, corrected from the immutable seed. The subsequent
12 product/homepage checks passed without retries, including filter return context,
keyboard focus, unavailable/invalid links, retry, axe and viewport/200%-text home
checks. All eight Best Sellers checks also passed. Deals-specific entry and final
visual/full-pipeline acceptance remain in the next checkpoint.

## Client cart and activation completion — 16 November

The initial product checkpoint intentionally stopped at seller selection; the
original Slice 4 blueprint also requires a client cart and activation notes.
This corrective follow-up implements both before declaring Slice 4 accepted.

- The same Go product endpoint now reads and validates the SKU's stored activation
  instructions (1,000-character bound, no blank/BOM-only or bidi-spoofed copy).
  React renders those instructions alongside edition, region and platform.
- The selected **available** seller offer has a real Add to cart action. The
  browser persists at most ten unique lines with one unit each and a product-slug
  navigation hint. No browser-persisted prices, keys, stock or seller data.
- /cart independently reloads Go-backed prices/availability on every visit,
  presents selected offer identity, lets buyers remove missing or sold-out
  lines, and shows an estimated subtotal only if every line is valid and
  available. No automatic cheapest-offer replacement or fake checkout CTA.
- Added storage parser/mutation unit tests and product→cart→refresh→remove
  Chromium acceptance checks, including a sold-out refusal and corrupt storage
  fallback. These are test *cases*, not a claim that they passed.
- The prior Slice 5 authentication checkpoint is preserved on the feature branch
  but remains **verification-pending**; this cart checkpoint is a scope-order
  correction, not authorization for simulated purchasing.

### Verification status

Exact-head GitHub Actions cannot currently run because the user reported an
exhausted quota. The assistant's execution container does not contain this
project's private local checkout, pinned Go/Node installations, npm packages or
PostgreSQL test cluster. Do not call Slice 4 acceptance verified solely from
remote source inspection. Finish with local `npm run format`, `npm run verify`,
`npm run test:integration`, `npm run test:browser`, `npm run audit`, Go
race tests and screenshot review at all agreed viewport/text-size combinations.
After verification, audit Slice 5 separately; no production deployment or merge.

### Independent Slice 4 pre-deployment review (16 November)

- A module-level cart snapshot could remain stale if an external browser tab edited localStorage while no cart listeners were mounted. The next subscriber now reconciles the persisted snapshot even without a storage event; added tests for remount and remote-tab update/removal.
- Browser acceptance previously checked sold-out selections, but not a **previously added** offer becoming sold out. Added explicit mocked API recovery tests: saved sold-out offers remain removable, never count as available, and display no available subtotal. A 503 response likewise cannot produce a fabricated subtotal or leak the response body.
- Rechecked the contract: product details expose stored activation notes, edition/platform/region, and distinct seller ratings. Cart storage is constrained to verified IDs, a slug navigation hint and quantity one; prices and keys are never browser-authoritative. Production quote and purchase transaction must still revalidate every offer in later slices.

**Approval status: source-reviewed and fixed, but not locally verified.** Before public hosting, run real Go/PostgreSQL integration, Vitest, Chromium/Playwright at 320/360/768/1280 including 200% text, local formatting/lint/type/build, and a deployment smoke test through a same-origin reverse proxy. No positive test result is asserted for this commit.
