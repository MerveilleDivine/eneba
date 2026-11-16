# Final submission verification — 16 November 2026

This is an evidence ledger for Eneba's internship assignment, **not** a declaration that the project has passed final acceptance. The development branch is `feature/slice-2-catalog`. At the start of this review its head was [`f0d16ed`](https://github.com/MerveilleDivine/eneba/commit/f0d16ed5ba464ee7d7d6fab9e1f7b5b7443478fd); `main` remained at `d5f85f9`. Update the revision and rerun all gates after later changes.

## Implemented in source; final release not yet accepted

- **Slices 0–5:** Go/PostgreSQL catalog, independent homepage blocks, seller offers, cart, buyer accounts and deployed-session groundwork. Earlier commits record corresponding test and hosted smoke evidence.
- **Slice 6:** Read-only live quote, buyer-locked idempotent purchase, transaction-protected key allocation, simulated checkout and retry handling. [`e3b5155`](https://github.com/MerveilleDivine/eneba/commit/e3b5155ac1d88fc34e466ae53dd552aaf43afc05) records prior local/unit/integration/browser verification, **not verification of the present head**.
- **Slice 7:** Owner-scoped order list/detail endpoints, historical receipt snapshots, private demo-key delivery, session invalidation on tab/account changes and related tests. Added in [`f0d16ed`](https://github.com/MerveilleDivine/eneba/commit/f0d16ed5ba464ee7d7d6fab9e1f7b5b7443478fd). At review time this change had not passed an exact-head backend integration/browser run.
- **Slice 8:** Frontend styling revisions exist. A visual, accessibility, live checkout and final release review is still pending.
- **Free-host loading recovery:** Read-only API screens now keep their existing skeleton/loading states while transient network, gateway and availability errors are retried silently for a bounded 90-second recovery window. The buyer's purchase mutation is not automatically replayed. Exact-head tests and an actual sleeping-Render smoke check remain pending.

## Evidence confirmed at review time

| Gate | Current evidence | Release status |
| --- | --- | --- |
| GitHub branch | Feature branch ahead of `main`, draft PR #2 open | Retain draft; do not merge automatically |
| Vercel preview | Deployment of `f0d16ed` reports **READY** | Build status only; not end-to-end acceptance |
| Production frontend | Most recent observed production deployment points to `606d3ed` | Behind the current feature head |
| GitHub Actions exact-head | Runs [#43926801580](https://github.com/MerveilleDivine/eneba/actions/runs/43926801580) and [#43926789114](https://github.com/MerveilleDivine/eneba/actions/runs/43926789114) report failure with no executed job steps in the connector | **Not passing**; account Actions capacity has been reported exhausted, but the exact cause of these runs is not independently confirmed |
| Local exact-head verify | Earlier Windows `gofmt` PATH issue was addressed by the developer; no complete `npm run verify` result for `f0d16ed` is recorded here | **Unverified** |
| Hosted Go API / database | Previous Slice 5 acceptance exists in `hosted-slice5-2026-11-16.md` | Latest order/checkout API deployment and migration state **unverified** |
| AI chat archive | `docs/ai-history/` does not exist in this branch's current tree | **Missing: blocking submission evidence** |
| Public repository | Repository remains private and older `main` history contains previously committed conversation artifacts | **Privacy review required** before visibility change |

A READY Vercel deployment, committed tests, or a prior passing revision must not be presented as proof of the complete **currently deployed** buyer flow.

## Remaining release gates

1. On the exact final feature commit, run `npm ci`, `npm run verify`, `npm run test:integration`, `npm run test:browser` and `npm run audit` using the configured isolated `eneba_test` database. Where possible, repeat Go integration race checks on Linux with `node scripts/run-go.mjs test -race -tags=integration -p 1 ./... -count=1`. Record revisions, failures and corrective reruns.
2. Confirm the Go API on Render deploys the matching code and database migrations; verify its readiness endpoint and the Vercel same-origin `/api/` rewrite over HTTPS. Do not assume the Vercel static-build result validates the Go backend.
3. In an independent/incognito **public** browser, run: home → catalog/search → seller offer → cart → register/sign in → quote → simulated purchase → order history → private demo key → reload. Check account B cannot read account A's order, logout/expired sessions cannot reveal keys, idempotent replay does not buy twice and purchased inventory is not reallocated.
4. Inspect screenshots at approximately 360px, 768px and desktop for home, catalog, product, cart/checkout and orders. Verify working controls, keyboard focus, responsiveness, contrast, copy-key fallback, empty/error states and no unnecessary internal-facing demo narration.
5. Export the **actual** Codex conversations with **both user prompts and visible assistant responses**, using `npm run history:export -- <path-to-real-rollout.jsonl>` for each real session. Verify timestamps, session coverage, manifest counts and redactions; never fabricate missing exchanges. This export requires access to the developer's local original Codex session files; it cannot be reconstructed from repository commits. Do not include credentials, tokens, raw secrets, or unrelated private data. Removing transcript files from a new branch does not remove them from Git history.
6. Reconcile README claims against verified behavior. Prepare the full name, **English CV**, completed assignment, GitHub repository URL, working public deployment URL and authentic conversation history for the submission email. Submission itself and repository visibility changes require user authorization.

## Handling remaining limitations

Keep useful, reproducible code tests (especially purchase concurrency, authorization and regression checks); passing once is not a reason to delete them. Remove only demonstrably redundant generated artifacts and obsolete working notes after checking they are not needed for engineering reproducibility or assignment evidence. Keep the branch and PR private/draft until the release and transcript-privacy checks are complete.
