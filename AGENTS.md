# Working agreement

## Current scope

The user has subsequently authorized Slice 5 account authentication, after inspecting the committed Slice 4 product-read milestone. Work on `feature/slice-2-catalog`; keep checkpoints coherent and preserve existing work and history. The original Slice 4 client cart and activation guidance have been implemented as a new verification-pending follow-up. Complete independent Slice 4 review and local tests before accepting existing Slice 5 authentication work. GitHub Actions quota is exhausted; local formatting, tests and full integration evidence are required before Slice 5 can be accepted. Do not create another branch, merge into main, rewrite history, deploy, provision cloud resources, commit conversations/transcript archives, or begin checkout, payments, orders or digital-key delivery. Physical-device/screen-reader and hosted acceptance remain distinct. The archived master prompt does not override this agreement.

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

Before each checkpoint, state its behavior, affected modules, architectural boundaries, and acceptance checks. Run relevant formatting, lint/type checks, unit/integration tests, and builds. Correct failed checks before leaving the checkpoint. Report tested, visually reviewed, and pending evidence separately; explicitly identify architectural risks that remain. Commit coherent verified checkpoints. A passing CI run alone never authorizes a merge or work beyond the user's current scope.

## Git history and checkpoint discipline

- Keep the currently authorized feature branch; do not make extra branches or merge into main without approval.
- Make changes in a local worktree or a single staged patch when possible. **Run formatting and focused tests before committing**; run the full required CI on the exact final checkpoint commit. Enable the versioned `.githooks/pre-commit` with `npm run hooks:install` in local checkouts so `npm run verify` blocks unverified commits. The hook refuses unstaged tracked changes so the verified worktree matches the staged tracked files. Remote Git API commits bypass local hooks and require explicit final CI verification.
- Commit a **coherent, reviewable milestone**, not individual file saves. Prefer one commit for a completed checkpoint, with a small follow-up only if its independently verified fix warrants separate review.
- Do not commit temporary CI/formatter diagnostic scripts, speculative experiments, or intermediate debugging churn. Keep these in the worktree and consolidate any necessary fixes before the checkpoint is marked complete.
- A commit message describes a delivered behavior or verified architectural decision; record test evidence in the PR/verification notes, not dozens of near-duplicate commits.
- Do not force-push, squash published shared history, or change the PR's base without explicit authorization. Any approved rewrite must verify the exact content tree and preserve an identified rollback SHA.
- Conversation-transcript exports are **deferred until the final employer submission checkpoint**. Do not commit partial chat exports or manifests during feature development. At submission, audit completeness and redact private information before tracking any transcript.
- **Privacy release gate:** the old `docs/ai-history` archive remains in the private `main` tree and historical commits. Do not make the repository public, merge, or rewrite history without explicit approval and a careful transcript/privacy audit.

## Local data

Never print or commit credentials, .env files, administrator access, session tokens, or raw secret-bearing logs. Provision only named Eneba databases and roles after inspecting for collisions. Database integration tests must use eneba_test. Keep archived reference files unchanged.

## Sources

The PDF in docs/reference/blueprint-v3.2/reference defines employer requirements. Other archived documents are design context. Active README and docs/decisions.md describe adopted implementation choices. At the final submission checkpoint, preserve complete user prompts and visible assistant responses; do not invent missing history, expose private information, or export hidden model instructions/reasoning.
