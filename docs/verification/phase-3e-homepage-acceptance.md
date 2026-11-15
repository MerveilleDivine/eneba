# Phase 3E — cross-layer homepage acceptance

Scope: verify the existing homepage as a whole, without building new purchasing routes or changing the existing databases, schema, applied seeds or deployment infrastructure.

## Accepted starting point

- Existing branch: `feature/slice-2-catalog`; draft PR #2 is not merged.
- Exact pre-3E baseline: `c31df74c0734bc11fd671443dac86b06c4b2fe58`, both PostgreSQL matrix jobs green on [run 43708054534](https://github.com/MerveilleDivine/eneba/actions/runs/43708054534).
- The original employer PDF was compared with the plan in Phase 3A. New 3E work is verification, not a promise of an implemented buyer checkout.
- Independent homepage sources are `homepage_banners`, `homepage_best_sellers` and `homepage_deals`.

## Automated 3E acceptance

1. **Database / Go / HTTP:** an integration test reads all three endpoints from the real Go handlers and a PostgreSQL pool; performs one committed, source-specific change at a time in explicitly isolated `eneba_test`; asserts only its corresponding HTTP response changes; verifies complete restoration after each mutation; reports cleanup failures. It also checks status, request ID, cache and content-type protections. Existing focused tests cover cross-seller prices, stock allocations and service-level failures.
2. **React / user journey:** a real browser loads all three Go-backed blocks together, checks the featured hero, fictional ranking and selected offer discounts; then independently fails all three endpoints, restores them one at a time, and verifies that other blocks remain in their current state without leaking backend details. A deliberately stalled Deals request checks the current six-second client timeout and recovery.
3. **Responsive/accessibility:** 320, 360, 768 and 1280px browser viewport checks, source-artwork decoding after lazy-load scroll, no horizontal overflow, reduced-motion transition, and WCAG A/AA axe scans. Repeat enlarged 200% text at 320 and 768px. Existing per-feature and catalog tests cover remaining sizing/keyboard/history cases.
4. **Reviewer-visible screenshots:** for each PostgreSQL CI matrix, full-page homepage captures at the four viewport sizes, plus enlarged-text evidence at 320 and 768px. `.github/workflows/ci.yml` uploads only `homepage-*.jpg` artifacts (retained seven days) even if a later check fails. These are **captures awaiting human inspection**, not proof that a person assessed their layout.
5. **Quality:** Prettier, gofmt, Node/Go static and unit checks, real integration, Chromium, Go race and security audits must pass at the exact new feature head in both PostgreSQL 17.12 and 18.7. Record the final link and separate failed attempts before signing off.

## Strict release boundaries

- Screenshots are provided for external reviewer inspection; automated assertions cannot certify aesthetic quality, full screen-reader compatibility or physical-device behavior.
- Real hosted cold starts and the six-second frontend timeout remain **unmeasured**, so production resilience cannot be claimed.
- Deals link to filtered catalog search, **not** a seller-offer reservation or checkout; the direct buyer journey remains separately scoped.
- The private `main` branch and historical commits still contain an archived AI conversation export. Review/redact any sensitive content before approving a public repository or rewriting history. No public release, merge, new branch or history rewrite is part of 3E.

## Independent visual and timeout-test review

The initial six screenshot artifacts from [run #43709316509](https://github.com/MerveilleDivine/eneba/actions/runs/43709316509) were downloaded and **visually inspected**, not only checked for image decoding. The 1280px default layout was legible and visually coherent; however, at 320px with 200% text the Deals cards split product names and euro amounts across individual characters, while the hero CTA and search placeholder became cramped. The 768px 200% screenshot exhibited the same narrow Deal-card text column. Passing an automated horizontal-overflow assertion did not establish readable typography.

The 3E correction uses a rem-sensitive auto-fit Deals grid, stacks images and text on narrow phone widths, keeps euro amounts unbroken, reduces overly large mobile CTA padding and leaves enough room for a shorter visual search placeholder while retaining the accessible "Search games" name. An explicit 200% text assertion checks that every Deals price occupies one text line. New screenshots must be generated and inspected again before visual acceptance.

The first timed-interception browser test also failed in both CI databases because the fixture did not hold all mount-time requests. The test now accounts for React development StrictMode's duplicate mount-time fetches and blocks all initial requests before simulating recovery. **This is a test-fixture correction, not a change to the six-second client timeout.** Real Render cold-start timing is still unmeasured.

## Additional 3E header review

A second manual inspection of the actual 768px / 200% CI screenshot found that the header's global search collapsed: the site could pass the document-width test while its input became unusable. The header now wraps into the mobile/search row at 1000px rather than 760px, so a large root font cannot squeeze the search away between brand and navigation. The 320px placeholder is slightly smaller to remain legible under 200% enlargement. Phase 3E browser tests now require a **visible search input of meaningful width** at both 320px and 768px under 200% text; the new screenshot bundle must be re-inspected before visual acceptance.
