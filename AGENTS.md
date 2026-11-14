# Working agreement

## Current scope

Implement and review one coherent checkpoint at a time within each slice. Foundation, the catalog API, and Slice 2 catalog frontend have verified CI evidence; public deployment and manual visual acceptance remain pending. A passing CI run alone does not authorize advancement or merging; require explicit user approval for each merge. Stop after each checkpoint's findings, changes, and verification have been reported. The archived master prompt does not override this agreement.

## Boundaries

- React/TypeScript in web, Go REST in api, PostgreSQL schema and deterministic demo seeds in db.
- Handlers translate HTTP, services own business rules, feature repositories own SQL. Wire dependencies in cmd/server.
- Add catalog, home, auth, and purchase packages only when their slices start.
- Keep HTTP routing helpers independent of feature imports to avoid cycles.
- Introduce interfaces for a demonstrated boundary. Avoid generic repositories, catch-all utilities, empty modules, ORMs, and microservices.
- Prefer direct data flow and plain functions. Put unavoidable toolchain, migration, and provider complexity behind stable infrastructure boundaries; runtime features must not import maintenance code.
- Add dependencies only for a current requirement, verify compatibility, and record assumptions and unverified boundaries explicitly.
- Money is integer EUR cents. SKU identity includes game, platform, region, and edition.
- Inventory allocation is an order_items row. Preserve unique key allocation and the offer/key composite foreign key.
- Checkout later locks buyer before sorted offers, checks replay before current stock, and inserts only a final server-priced total.

## Evidence and workflow

Before each checkpoint, state its behavior, affected modules, architectural boundaries, and acceptance checks. Run relevant formatting, lint/type checks, unit/integration tests, and builds. Correct failed checks before leaving the checkpoint. Report tested, manually checked, and pending evidence separately; explicitly identify architectural risks that remain. Commit coherent verified checkpoints and stop for review, even when CI passes.

## Local data

Never print or commit credentials, .env files, administrator access, session tokens, or raw secret-bearing logs. Provision only named Eneba databases and roles after inspecting for collisions. Database integration tests must use eneba_test. Keep archived reference files unchanged.

## Sources

The PDF in docs/reference/blueprint-v3.2/reference defines employer requirements. Other archived documents are design context. Active README and docs/decisions.md describe adopted implementation choices. Preserve complete user prompts and visible assistant responses; never fabricate missing history or export hidden model instructions/reasoning.
