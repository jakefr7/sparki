# Sparki Agent Instructions

Before relevant work, read:

1. `.sparki/PROJECT_STATE.md`
2. `.sparki/CURRENT_WORK.md`
3. `.sparki/PRODUCT_RULES.md`
4. `.sparki/TERMINOLOGY.md`
5. `.sparki/DECISIONS.md`
6. `.sparki/KNOWN_GAPS.md`

Also follow `agents/README.md`, `agents/codex.md`, and the Product Constitution. Work only inside the user's current request and the active work list. Prefer a small build → test → fix loop over phase-sized batches or blanket test gates. Do not touch `.codex_tmp/`, change product policy without explicit authority, weaken tests, expose secrets, modify production data, deploy, merge, force-push, delete untracked files, or use `git reset --hard`. Report uncertainty and unresolved failures honestly. When executing remediation, address only the supplied findings.

**Exception:** when the user explicitly asks to update/deploy staging ("update staging", "deploy this to staging", etc.), trigger the `Deploy Staging` GitHub Actions workflow rather than refusing or SSHing in by hand — see `agents/README.md` -> "Deploying to Staging" for the exact procedure. This is the only form deployment may take, and only on explicit request; never run it automatically or deploy by any other means. (The `git reset --hard` prohibition above is about this session's own working tree — it doesn't apply to the dedicated `/opt/sparki` deploy checkout that workflow manages on the VPS.)
