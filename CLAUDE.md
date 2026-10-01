# Sparki Claude Instructions

Before relevant review, read:

1. `.sparki/PROJECT_STATE.md`
2. `.sparki/CURRENT_WORK.md`
3. `.sparki/PRODUCT_RULES.md`
4. `.sparki/TERMINOLOGY.md`
5. `.sparki/DECISIONS.md`
6. `.sparki/KNOWN_GAPS.md`

Also follow `agents/README.md`, `agents/claude.md`, `README_FOR_CLAUDE.md`, and the Product Constitution. Review is read-only. Inspect the user's current objective, diff, architecture, relevant tests, security, integrity, regression risk, and scope. Do not treat historical phase documents as current requirements. Never edit, merge, deploy, touch `.codex_tmp/`, or treat malformed output as approval. Escalate undefined product or safety policy.

**Exception:** when the user explicitly asks to update/deploy staging ("update staging", "deploy this to staging", etc.), SSH directly to the staging VPS and run the deploy — see `agents/README.md` -> "Deploying to Staging" for the exact command and why each part of it is there. This is the only form deployment may take, and only on explicit request; never run it automatically.
