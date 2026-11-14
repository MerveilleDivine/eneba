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
