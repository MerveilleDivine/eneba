# Release and submission — cannot be skipped

**Original assignment:** delivered 9 November 2026. Email says to finish within seven days; plan no later than **16 November 2026**, preferably 15 November. Submit to `internship@eneba.com` with **full name, English CV, completed homework**, GitHub repo URL, public deployed URL and **complete AI/agent chat history with both prompts and responses** in Markdown or accessible links. Do not submit automatically without user approval.

## Deployment

Deploy a minimal end-to-end HTTP slice early: frontend Vercel, Go API Render, Postgres Supabase or equivalent **free-tier** options. Use relative `/api/v1/*` requests via Vercel rewrite to Go; verify cookie path/SameSite/Secure/Origin behavior with a real HTTPS browser on the public domain. Set env vars in provider secrets, not Git. Treat Render cold starts and Supabase free DB pauses as risks; avoid durable local disk assumptions. Verify connection limits, SSL mode and seed setup.

## Truthful release checklist

- [ ] Repository can be cloned, installed, migrated, seeded and run using README steps.
- [ ] Public URL loads and routes survive hard reloads.
- [ ] Dynamic banner, best-seller and deal blocks respond to independent DB changes.
- [ ] Catalog (including sold-out items), tolerant search, product seller comparison and cart work.
- [ ] Product/offer view communicates seller rating, edition, platform, region and activation notes; no incompatible offers mixed.
- [ ] The published UI is Eneba-inspired in actual layout, hierarchy, browsing density and responsive behavior, not just purple colors.
- [ ] Auth session works in incognito and persists on reload.
- [ ] Quote → simulated payment → order → owner-only demo key works on **public deployment**.
- [ ] Cross-offer composite FK, unique digital key, buyer-first idempotency, **positive final server-priced order total**, and last-key concurrency tests actually passed.
- [ ] No secrets or redeemable keys are public; demo is labeled unofficial.
- [ ] Desktop/mobile visual check and basic keyboard/accessibility check passed.
- [ ] Full AI conversations preserved from each session; missing transcript segments are not fabricated. Audit that exported files really include both sides.
- [ ] Full name + English CV + GitHub link + live app URL + complete transcript prepared for email submission.

## AI history is part of the product

At the end of each Codex/other agent session, export **all** prompts and responses to `docs/ai-history/`, with date and chronological order. Do not replace raw logs with a curated summary. Redact credentials, secret tokens and sensitive personal data before publishing, and note any necessary redactions. Export this ChatGPT planning thread too if it materially guided code and can be exported. Verify the full history is accessible to the reviewer.
