# Scope risk and buyer-experience acceptance — v3.2

## Employer language vs engineering interpretation

The original PDF requires: store filters/sort/name search; separately backend-sourced homepage blocks; global typo/partial search; multi-seller product offers; cart, simulated or test payment, digital key; register/login and protected orders; and **Eneba-like colors, typography, spacing and components**. It explicitly allows choosing limited scope and says a few thoroughly developed features beat shallow breadth. **No detailed scoring weights are provided.**

### Excluded without contradicting an explicit feature requirement

- Real payment provider (simulation expressly permitted); real keys (unsafe for a public demo)
- Seller dashboard, CMS/admin, refunds, password recovery, promo code engine, personalized recommendations and distributed messaging.
- **Deferred medium-priority features:** written customer reviews and a quantity picker/multiple keys per chosen offer. They are intentionally **not built in v1**; their limited migration/contract path is recorded in `FUTURE_MEDIUM_FEATURES.md` and no unused code is added.
- Current cart buys **exactly one** unit from each of up to 10 distinct offers; its data contract includes `quantity: 1` and rejects other quantities. Only expand after the core has passed all mandatory checks.

**Do not mistake excluded written reviews for removing seller trust.** Show each seller's demo `rating_percent`, price and availability on the product page.

### High-value buyer experience that should NOT be cut

- Clear edition, **platform**, **region** and **activation instructions** before add-to-cart. These are necessary buyer trust cues and cheap to model as product fields.
- Distinct sellers' current prices and availability; one chosen **offer ID**, not just product ID, gets added to cart.
- Real cart controls: remove line, navigate to offer, subtotal, server quote, stale-price and sold-out recovery, persist across reloads.
- Clear demo checkout action and order review (no real money); after successful purchase, order receipt with copyable **fake** code visible only to the buyer.
- Visible distinction between discounted and regular price **only when list price actually exists and is higher**. No deceptive crossed-out prices.
- All active products are browsable, even sold out; show stock status and disable buying. Price filters may exclude sold-out products.
- Mobile and keyboard usable throughout; no dead links, fake buttons, unimplemented categories or placeholder checkout flows.

## Visual quality contract (apply from first frontend module)

Build a recognizable but non-impersonating Eneba-inspired experience. Do not copy copyrighted UI artwork, brand-specific logos or scrape game covers without permission. Use original/licensed visuals and add an unobtrusive unofficial-internship-demo notice.

| Surface | Required observable behavior |
| --- | --- |
| Global header | Brand-like purple palette, prominent working search on **every page**, working user auth/cart nav, logical responsive menu |
| Homepage | Strong promotional banner, independently fetched best sellers and deals, consistent product cards, working view-all/catalog links |
| Catalog | Dense but readable game-card grid, title, image, platform/region badges, from-price, functional filters/sort/search, useful empty/loading/error/sold-out state |
| Product page | Cover, descriptive text, **edition/platform/region/activation** details, several competing seller offers with name/rating/price/stock, accessible choose-offer CTA |
| Cart | Persistent selected offer lines, remove option, quote refresh, explicit demo checkout CTA; stable price presentation in EUR cents |
| Confirmation | Explicitly labelled simulated payment, order summary, success/retry states, owner-only code reveal and copy-key action |

Create shared design tokens for spacing, font scale, surfaces, accents, focus, cards, buttons; do not add a UI framework just to claim design quality. Ensure responsive behavior at ~360px mobile, ~768px tablet and ~1280px desktop. Validate contrast, keyboard focus, button states and no horizontal scrolling. Capture at least home, catalog, product and checkout screenshots during manual verification. The quality of real interaction and consistency matter more than animations.

### Scope triage if deadline pressure arrives

Priority 0 (do not cut): mandatory functional flow, authentication, seller choice, real database-backed homepage, correct prices/stock/keys, strong enough visual fidelity, public deployment, full AI transcript.

Priority 1 (high-value, small effort): platform/region/activation clarity, seller trust rating, intuitive cart recovery, readable order receipt, clear sold-out state, good seeded data.

Priority 2 (optional): user reviews and multi-unit purchase are **planned extension candidates**; promo codes, password reset, personalized recommendations, fancy animations, advanced filtering categories and admin tooling remain unplanned unless explicitly reprioritized. No Priority 2 work is allowed before all core acceptance gates pass.

**The evaluator, not the plan, decides the score.** Track acceptance evidence and make omissions explicit in the finished project README rather than claiming guaranteed zero mark impact. **Do not show disabled "Reviews", "+", or "-" UI controls until those features really work.**
