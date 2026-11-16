# Phase 3D — independent hardening and release gates

The Phase 3D CI acceptance result (`b5d874c`, run `43705098566`) is not proof of public deployment, physical-device acceptance or complete seller-offer navigation. Hardening is intentionally confined to the existing `feature/slice-2-catalog` branch and draft PR #2.

## Hardening acceptance

- Isolated PostgreSQL integration restores captured price, active flag, ranking, nullable original price and affected product text; cleanup failures fail the test rather than disappearing silently.
- Verify ten stock-eligible deals are reduced to eight correctly ordered offers; an overlong first product name must be omitted and the next eligible offer backfill the page.
- A Deal card retains game title, platform and region through a real catalog link. Its seller-specific price is informational; the catalog link does not select a seller offer or promise checkout.
- A narrow shared hook owns retry-focus transfer in both Deals and Best Sellers. Their request lifecycles, SQL ownership, and different card layouts remain separate.
- The browser verifies actual source artwork decodes and the layout doesn't overflow at 320, 360, 768 and 1280 pixels with 200% text. Automated axe scans and keyboard checks remain in CI.
- CI must pass formatting, static analysis, builds, unit, integration, Go race, audit and Chromium tests on PostgreSQL 17.12 and 18.7 at the exact hardening head. Publish run evidence to the PR.

## Unresolved release blockers

- **Privacy:** `main` still contains a previously exported development conversation under `docs/ai-history`, and that export remains in history. Keep the repository private. Explicitly approve and review a redaction/publication strategy before public release. Do not force-push as an incidental hardening step.
- **Offer route:** a catalog search is not a seller-specific product-detail/offer route. Direct selection, pricing revalidation, and checkout belong to future approved slices.
- **Hosting:** no real Render/Neon/Vercel wake-up timing evidence exists; the six-second client request timeout may not accommodate cold starts. Test with actual hosted infrastructure before altering global timeouts or claiming resilience.
- **Visual/manual:** the browser checks asset decoding and geometry, but a human must still inspect actual images, card density and screen-reader/device behavior. CI cannot sign those off.

No new migrations, seed modifications, product/purchase routes, new branches, deployments or merges are included in this hardening checkpoint.
