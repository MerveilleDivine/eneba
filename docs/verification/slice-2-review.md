# Slice 2 independent review and completion

14 November 2026. Scope: review the implementation through D5, repair demonstrated
defects, and finish E/F on the existing frontend branch. Hosting is deliberately
deferred; Slice 3 and merging are outside this authorization.

## Starting evidence

The clean feature branch was at `9db6e760e7cdb6e5d9417e34ee7ff3f5ab98f163`,
including the post-D5 exact-cent and Unicode-search fixes. Both
[push](https://github.com/MerveilleDivine/eneba/actions/runs/43604811948) and
[PR](https://github.com/MerveilleDivine/eneba/actions/runs/43604817738) checks
succeeded for that commit. PR #1 had already been merged externally. New changes
therefore need a follow-up draft PR from the same feature branch. This review
does not authorize another merge.

## Architecture assessment

The feature boundaries are appropriate for this application. Catalog query parsing
owns canonical URL knowledge; the API client hides transport and response validation;
the results component owns request deadlines, retries and obsolete-response suppression.
Temporary search and price drafts have explicit, distinct owners. Concrete Go
handler/service/repository wiring keeps HTTP, policy and SQL separate. Two set-based
reads share a database snapshot, and only public fields cross the boundary.

Keep those choices. The native search input and its small set of refs preserve
composition and newer drafts across debounced navigation. The keyed request subtree
is useful; its boundary was slightly too wide. Shared layout accepts feature content
without importing the feature. Repeated facet validation at different trust boundaries
is deliberate; adding a schema generator or metadata endpoint would add complexity
without eliminating the need to validate.

## Demonstrated defects and corrections

| Finding                                                          | Impact and cause                                                                                                                                   | Minimal correction                                                                                          | Regression evidence                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Medium: sort focus is lost in `CatalogPage.tsx`                  | Every sort change remounted the select inside the request-keyed subtree, dropping focus to the body and interrupting keyboard use.                 | Keep the heading and sort control outside that subtree; request data, count and retry state stay inside it. | A component test failed before the repair; a real-browser test also checks retained focus and a subsequent keyboard selection. |
| Low: a replacement cover is never attempted in `ProductCard.tsx` | A permanent failure boolean hid all subsequent URLs for a mounted card. Current query remounting usually concealed this reusable-component defect. | Remember the failed URL rather than disabling images for the card's lifetime.                               | A rerender test failed before the repair and checks that a different URL is attempted.                                         |

The full existing frontend suite was exercised alongside these regressions; only
the two added defect tests failed before the corrections. No API contract, business
rule, runtime dependency, SQL query or schema change was needed for these repairs.

## Visual and accessibility review (E)

The known shared-cover acceptance gap is replaced with sixteen original generated
illustrations. [Asset provenance](../assets/README.md) includes every prompt and
checksum. WebP covers are 432×576 and 27,118–57,352 bytes each; there is no image
service or new runtime dependency. Seed 002 updates the known placeholder URLs
without editing seed 001, replacing customized covers or touching inventory.

Chromium reproduced three additional keyboard gaps before correction: pagination
lost focus with its initiating link, Clear all removed its focused button, and
invalid prices neither focused nor described the field needing correction. The
small corrections use existing component refs and a callback to a persistent
heading. Retry and result-reset links use the same focus destination. Modified
link clicks do not steal focus. The skip link has a focusable main target.

Axe identified a label-in-name mismatch in the shared brand link across all page
states. Adding punctuation alone did not resolve it because the decorative letter
mark also participates in the visible-text comparison. Removing the unnecessary
ARIA name override lets the rendered brand supply its own accessible name.

Screenshot review at 360/768/1280 confirmed the existing purple/lime direction,
readable card titles and prices, clear sold-out treatment, intact controls and no
horizontal clipping. The artwork now renders in its original colors. Wrapped
badges exposed uneven price alignment; a flex column aligns price areas without
fixed heights. Control borders now share an explicit, stronger color; the search
button uses an inset focus outline that is not clipped by its container. Layout,
temporary drafts, navigation structure and product-card scope stay unchanged.

The browser-control bridge was unavailable on this machine. Repository Playwright
checks and direct inspection of their screenshots provide local browser/visual
evidence; physical-device, screen-reader and user acceptance remain distinct.

## Deliberately unchanged and bounded risks

- Do not extract a generic request hook or lift request state merely to shorten a file.
  The catalog has one request owner, explicit cleanup and adversarial race tests.
- Keep integer EUR cents and the exact display conversion already fixed after D5.
- Keep independent filter drafts across unrelated navigation and canonical-equivalent
  URLs without avoidable refetching.
- Catalog scans are bounded by the current demo data scale; no speculative search
  service, caching layer or indexes are justified by this review.
- Backend-only D4 integration evidence remains valid for unchanged behavior. The final
  pipeline still must cover Slice 0/1 and both supported PostgreSQL versions.
- Accessibility automation cannot prove complete screen-reader or physical-device
  usability. Public HTTPS routing and authentication cookies remain future gates.

## Verification record

Audit repair checkpoint: frontend type checking, linting, all 96 unit tests and the
production build passed locally on Windows. The focused Chromium sorting regression
passed (1/1) through the real Vite/Go/PostgreSQL stack, without retries. Formatting
and `git diff --check` passed. The existing suite now contains 94 pre-existing tests,
including the post-D5 fixes, plus the two new regressions.

Adversarial reread: changing a sort still resets page 1; the count and retry lifecycle
remain keyed by the canonical request; equivalent URLs retain their in-flight request;
no request state was lifted into the page. A failure for one image URL cannot suppress
a different URL. Decorative images remain empty-alt because the adjacent heading
already identifies each game. No broad state or component rewrite was introduced.

E and F results are recorded here as their checks complete. A pending
run is never reported as passing. Final CI links belong to the follow-up PR so the
evidence can refer to its exact final source commit without creating a documentation
commit loop.

E checkpoint: Windows frontend type checking, linting, 96 unit tests and the
production build passed. All 15 focused Chromium checks passed without retries:
eight whole-page WCAG A/AA scans (three viewports and five states), five keyboard
journeys, the sorting regression and the sixteen-cover integration check.
The PostgreSQL 18.7 maintenance package passed, including nine real-database
scenarios and the new seed/purchase/custom-cover regression. Seed application
reported one new version, then zero. No catalog API or schema migration changed.

Reviewed local screenshots: [desktop](screenshots/slice-2-1280.jpg),
[tablet](screenshots/slice-2-768.jpg), [mobile](screenshots/slice-2-360.jpg).
All visible covers were decoded before full-page capture. These are agent-reviewed
Chromium screenshots, not physical-device testing or user sign-off.

E adversarial review kept the new focus behavior local to explicit user actions;
typing and unrelated filter changes never receive automatic focus. Result links
retain ordinary modified-click behavior. The request key, deadline and obsolete
result guards are unchanged. Image space is reserved, broken-image text survives,
and no card links imply an unimplemented product route. Axe is test-only; the
production application gained no dependency. The new seed is independently
versioned and its application to existing allocated inventory is tested inside a
rollback transaction. Existing source documents and applied seed checksums remain
unchanged.

## Checkpoint F — final local-stack integration acceptance

14 November 2026. F extends D4's already-proven cross-layer contracts rather than
duplicating the catalog business tests. The new real-Chromium acceptance cases exercise
offline navigation and retry with persistent filters and keyboard focus, modified
pagination links opening a new tab without stealing focus, and 200% text at 360px and
1280px without horizontal clipping or unreadable filter controls.

### Findings corrected during final acceptance

1. At commit `a728f8a`, both PostgreSQL CI jobs stopped at Prettier because the
   new `tests/browser/acceptance.spec.ts` did not match repository formatting.
   Commit `b361881` formatted the test without removing or weakening assertions.
2. The next matrix run
   [43615614823](https://github.com/MerveilleDivine/eneba/actions/runs/43615614823)
   reached the browser suite: 48 tests passed in each job, but a 360px/200%-text
   assertion exposed a clipped Platform selector label. This was a genuine mobile
   usability defect, not a test-infrastructure failure. Commit `7cb8a0a` adjusted
   narrow-screen filter panel and control horizontal spacing; the test remains intact.

### Complete code verification

The exact code commit `7cb8a0aeeea8bff34130298ab9e523711eef7815` passed
[Engineering checks run 43615986341](https://github.com/MerveilleDivine/eneba/actions/runs/43615986341)
on both PostgreSQL 17.12 and 18.7.

- Formatting, tooling tests, Go vet/tests/build, frontend typecheck/lint/build passed.
- All 96 frontend unit tests passed on each database matrix job.
- All 49 real-Chromium browser tests passed on each job, including the new F journeys,
  earlier catalog/URL/keyboard tests, accessibility scans, and Go API integration.
- Database integration tests passed in both jobs, including earlier Slice 0/1 contracts.
- npm and Go dependency audits reported no detected vulnerabilities.
- Go race checks passed for both database versions.
- Database provisioning, migration, and immutable seeding completed before verification;
  the workflow also checks repeated migration/seed application.

This is automated verification of the local CI stack, not a public-hosted acceptance
claim. Check the current exact-head PR checks after any subsequent documentation-only
commit; the successful code-commit run is linked above. The authoritative live
release gate remains [draft PR #2](https://github.com/MerveilleDivine/eneba/pull/2).

### Final adversarial review and boundaries

The F repairs are confined to an acceptance test's formatting and a narrow-screen
CSS media rule. The production change does not alter API contracts, React query
ownership, request cancellation, money handling, database schema, seed history,
inventory allocation, or authentication. The responsive override is applied only
at the existing 610px breakpoint and preserves the enlarged-text assertion.
Automated success is still not proof of physical-device or screen-reader usability.

The global header, catalog search, and URL parsing remain separate responsibilities.
The root route currently redirects to `/catalog`; Slice 3 must replace that route
deliberately without breaking catalog deep links, Back/Forward, search navigation,
or the shared layout. Product cards remain informational until later product/offer
slices; homepage blocks must not invent purchases or popularity data.

**Pending outside Slice 2's automated acceptance:** user visual sign-off, physical
mobile/tablet checks, hands-on screen-reader review, hosted HTTPS/proxy verification,
and production infrastructure. Public deployment was expressly deferred. Do not
treat this checkpoint as authority to merge, deploy, or start Slice 3 without review.

## Independent adversarial follow-up after checkpoint F

14 November 2026. Re-review of the successfully verified Slice 2F head
`9a711533b27fc2da79dda5f243986302fb4f9cf7` focused on accessibility
accuracy, minimum supported viewport width and text enlargement. No Slice 3
implementation, production database provisioning, or merge was performed.

### Defects and regression coverage

1. **Price-validation ARIA accuracy:** submitting an invalid price marked both
   inputs as invalid even when only one contained malformed text. The filter
   now derives each field's invalid status separately; a reversed numeric
   range correctly marks both endpoints. A new focused component regression
   checks descriptions, field-specific ARIA, correction focus and the absence
   of an unintended query update. Draft ownership and URL state remain intact.
2. **Minimum-width enlarged-text overflow:** the existing 200% text tests
   covered 360px/1280px but missed 320px. Extending the real-browser matrix to
   320px/768px reproduced horizontal overflow at 320px on both PostgreSQL
   versions; 50 other browser tests passed in each job. The first detailed
   diagnostic identified a demo-strip span beyond the right viewport edge
   and pagination extending beyond both sides. Header disclosure and
   pagination now wrap naturally, without concealing overflow. A second run
   found remaining excess document width despite no element box outside
   the viewport; the 320px heading needed a smaller responsive minimum
   font size to keep its unbroken title within the page. The narrow-screen
   typography adjustment removed the remaining overflow.

These are user-interface and acceptance-test changes only. API, Go business
rules, database constraints/seeds, query canonicalization, request lifecycle,
and navigation/focus ownership were not modified. Assertions were preserved;
diagnostic information now distinguishes overflowing element boxes from
overflowing intrinsic content if a new regression occurs.

### Verified follow-up result

The exact follow-up code head
`af28e764906453455a5f35dd201588be43b6643e` passed
[Engineering checks 43618332800](https://github.com/MerveilleDivine/eneba/actions/runs/43618332800)
on PostgreSQL **17.12 and 18.7**:

- Formatting, tooling checks, frontend typecheck/lint/build, Go vet/tests/build passed.
- **97 frontend unit tests** and **51 real Chromium browser tests** passed
  for each matrix job, including 200% text at 320, 360, 768 and 1280px.
- The real-PostgreSQL integration suites and Go race checks passed.
- npm and Go security audits reported no detected vulnerabilities.

This review does not imply physical-device or screen-reader testing. The
public deployment and production-domain HTTPS/proxy/cookie checks remain
separate release and authentication gates. Verify the final branch-head CI
after this documentation commit before approving a merge.
