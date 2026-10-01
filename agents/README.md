# AI Agent Roles

This directory defines permanent operating roles for AI collaborators working on Sparki.

Every AI session should begin here before reading the rest of the documentation system. The role files define what each AI is responsible for, where its authority ends, and what it must read before acting.

## Operating Model

Sparki uses AI collaborators as specialized partners, not interchangeable assistants.

- [Codex](./codex.md) maintains the repository, documentation system, specs, ADRs, prompts, and implementation work when implementation is explicitly appropriate.
- [Claude](./claude.md) reviews architecture, code quality, scalability, performance, security, and engineering tradeoffs.
- [ChatGPT](./chatgpt.md) leads product architecture, research synthesis, product strategy, workflow design, and AI strategy.

## Shared Authority

All agents must follow the [Product Constitution](../docs/blueprint/00-product-constitution.md).

The Constitution is the highest product authority in the repository. Agent role files define operating boundaries; they do not redefine product law.

## Collaboration Rules

- Agents should reference the Constitution instead of duplicating it.
- Agents should identify assumptions rather than inventing facts.
- Agents should preserve the difference between research, strategy, architecture, specification, and implementation.
- Agents should add TODOs when future work needs validation, research, or constitutional alignment.
- Agents should not cross role boundaries silently.

## Local Testing Ports

Use these defaults for local web/e2e work unless the user explicitly says otherwise:

- API: `http://127.0.0.1:4000`
- Web app for Playwright/e2e: `http://127.0.0.1:3001`
- Prefer `127.0.0.1` over `localhost` to avoid IPv6 `::1` sandbox/connectivity issues.
- Avoid port `3000` for e2e web runs; it is commonly occupied by another local service in this workspace.
- When starting servers manually, run Playwright with `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `API_URL=http://127.0.0.1:4000`, and `WEB_PORT=3001`.

## Deploying to Staging

Staging (`staging.sparki.vet`) is a self-hosted DigitalOcean VPS (`/opt/sparki`, `sparki-api` and `sparki-web` as systemd services, Caddy as reverse proxy) with no auto-deploy on push — pushing to `main` only updates GitHub. The one sanctioned way for an agent to update it is the `Deploy Staging` GitHub Actions workflow (`.github/workflows/deploy-staging.yml`, manual `workflow_dispatch` only). It SSHes in, fetches and hard-resets `/opt/sparki` to `origin/main`, runs `pnpm install --frozen-lockfile`, applies pending Prisma migrations against the staging (Neon) database, runs `pnpm build`, restarts both systemd units, verifies they're active, and runs HTTP health checks (`/health/ready` for the API, `/` for web) before reporting the deployed commit SHA. It never touches staging's `.env`.

**When the user says "update staging," "deploy this to staging," "commit, push, and update staging," or similar** — this is what they mean. Do not SSH into the VPS by hand and do not improvise another deploy path; use the workflow.

1. If there are uncommitted changes the user wants deployed: commit them, then `git push origin main`.
2. If the target commit is already on `main`: skip straight to the next step.
3. Trigger the deploy: `gh workflow run deploy-staging.yml`.
4. Optionally watch it to completion: `gh run watch "$(gh run list --workflow=deploy-staging.yml --limit=1 --json databaseId -q '.[0].databaseId')"` (or `gh run list --workflow=deploy-staging.yml --limit=1` to just check status without blocking).
5. Report back clearly: whether the deploy succeeded or failed, and which commit SHA is now live (the workflow log's final line, or re-derive it with `git rev-parse origin/main` if the run succeeded).

This workflow is deliberately **not** wired to run automatically on push — every run is either a human clicking "Run workflow" or an agent invoking it because it was explicitly asked to. Required repo secrets (`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, optional `STAGING_SSH_PORT`) hold the SSH credential only; no application secret lives in the workflow or in GitHub — staging's `.env` stays on the VPS.

## Handoff Expectations

When work crosses roles:

- Product strategy should hand off to specs, ADRs, or research notes.
- Architecture review should hand off to ADRs or technical architecture documents.
- Implementation work should hand off to tests, changelogs, specs, or operational notes where relevant.
- Research should hand off to open questions, evidence, and source-linked findings.

## Default Reading Order

1. This directory's role file for the active AI.
2. [Product Constitution](../docs/blueprint/00-product-constitution.md)
3. [README_FOR_AI](../docs/README_FOR_AI.md)
4. Relevant blueprint, research, spec, ADR, or prompt documents.
