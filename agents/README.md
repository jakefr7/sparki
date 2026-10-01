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

Staging (`staging.sparki.vet`) is a self-hosted DigitalOcean VPS at `root@68.183.123.15`, repo at `/opt/sparki`, `sparki-api`/`sparki-web` as systemd services, Caddy as reverse proxy. No auto-deploy on push — pushing to `main` only updates GitHub. A dedicated key already exists at `~/.ssh/sparki_staging` for this.

**When the user says "update staging," "deploy this to staging," "commit, push, and update staging," or similar** — this is what they mean:

1. If there are uncommitted changes the user wants deployed: commit them, then `git push origin main`.
2. SSH in and run the deploy directly (this exact sequence — see the note below on why each piece is there):

```bash
ssh -i ~/.ssh/sparki_staging -o BatchMode=yes root@68.183.123.15 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/sparki
git fetch origin
git checkout main
git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm --filter @sparki/db run migrate:deploy
NODE_OPTIONS="--max-old-space-size=1536" pnpm exec turbo run build --concurrency=1
systemctl restart sparki-api sparki-web
for unit in sparki-api sparki-web; do
  systemctl is-active --quiet "$unit" || { systemctl status "$unit" --no-pager; journalctl -u "$unit" -n 80 --no-pager; exit 1; }
done
API_PORT_VAL="$(grep -E '^API_PORT=' .env | tail -n1 | cut -d= -f2- | tr -d '"')"; API_PORT_VAL="${API_PORT_VAL:-4000}"
WEB_PORT_VAL="$(grep -E '^WEB_PORT=' .env | tail -n1 | cut -d= -f2- | tr -d '"')"; WEB_PORT_VAL="${WEB_PORT_VAL:-3000}"
curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT_VAL}/health/ready" >/dev/null && echo "API healthy"
curl -fsS --max-time 5 "http://127.0.0.1:${WEB_PORT_VAL}/" >/dev/null && echo "Web healthy"
echo "Deployed commit: $(git rev-parse HEAD)"
REMOTE
```

3. Report back clearly: whether it succeeded, and the deployed commit SHA (the final line of output).

The VPS has only ~1GB RAM. `pnpm build` (plain Turbo, default concurrency, default Node heap) reliably OOMs there — confirmed live on 2026-10-01: `nest build` and `next build` running together exhausted it, and even `next build` alone still OOM'd at V8's auto-detected heap cap. `--concurrency=1` plus `NODE_OPTIONS="--max-old-space-size=1536"` (there's 2GB swap to back it) is what actually gets a build through — don't drop either one, and don't "fix" a future OOM by disabling type-checking/lint in the build instead of giving it more heap.

Never touch staging's `.env`. Never run this automatically — only when explicitly asked.

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
