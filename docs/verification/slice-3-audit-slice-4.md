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
