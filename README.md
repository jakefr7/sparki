# Sparki

Sparki is a veterinary operating system built around patient-centered workflow. See
[`docs/blueprint/00-product-constitution.md`](./docs/blueprint/00-product-constitution.md) for
product law and [`docs/engineering/00-engineering-plan.md`](./docs/engineering/00-engineering-plan.md)
for the engineering roadmap this repo implements against.

This README covers the **engineering foundation only** (Sprint 0): monorepo setup, local
development, and the tooling every future feature builds on. It does not cover product behavior —
that lives in `docs/`.

If you're an AI collaborator, read [`README_FOR_CLAUDE.md`](./README_FOR_CLAUDE.md) or the
relevant file in [`agents/`](./agents/README.md) before making changes.

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- pnpm 10.34.3 (`corepack enable` will pick up the version pinned in `package.json`)
- Docker (for local Postgres)

## Setup

```bash
cp .env.example .env
pnpm install
docker compose up -d          # starts Postgres on localhost:55432
pnpm dev                       # runs apps/api and apps/web together
```

- API: http://localhost:4000 (health check at `/health/live`, `/health/ready`)
- Web: http://localhost:3001

### Local Web Port Safety

Sparki web runs on http://localhost:3001 by default. Port 3000 is reserved for
other local stacks, especially CRO auth/consent login, and Sparki's dev script
will refuse to start on port 3000 unless you explicitly opt in.

To intentionally run Sparki on port 3000, use the override only when you are
sure nothing else depends on that port:

```bash
WEB_PORT=3000 SPARKI_ALLOW_PORT_3000=true pnpm --filter @sparki/web dev
```

### Database

`prisma/schema.prisma` has the minimum model set for Sprint 1's vertical slice: `Organization`,
`Location`, `User`, `Role`, `Client`, `Patient`, `Appointment`, `Visit`, `MedicalRecord`, and
`SoapNote`. Event, Audit Event, Billing, Inventory, Labs, Communication, and AI fields are
deliberately deferred; migration/provenance fields (source system, source ID, confidence,
imported-at) are already present on every tenant record that may originate from a legacy system —
see the comment block at the top of the schema file for why.

```bash
pnpm db:generate   # generate the Prisma client
pnpm db:migrate     # create/apply a dev migration
```

`packages/db` exports both `prisma` (the generated client) and `pool` (a raw `pg` Pool, for the
health check and any query that needs to bypass the ORM per the engineering plan).

## Repository layout

```text
apps/
  api/      NestJS API (modular monolith)
  web/      Next.js frontend (App Router)

packages/
  config/   Shared, schema-validated environment loading (zod)
  db/       Raw Postgres pool + (future) Prisma client

prisma/
  schema.prisma   Sprint 1 vertical-slice models (see "Database" above)

docs/       Product Constitution, blueprints, ADRs, specs, engineering plan
agents/     AI collaborator role definitions
```

Why this shape: see "Repository Strategy" in
[`docs/engineering/00-engineering-plan.md`](./docs/engineering/00-engineering-plan.md).

## Scripts

Run from the repo root (Turborepo fans these out to every app/package):

| Command                        | What it does                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`                     | Run api + web in watch mode                                                   |
| `pnpm build`                   | Build every app/package                                                       |
| `pnpm lint`                    | ESLint across the workspace                                                   |
| `pnpm typecheck`               | `tsc --noEmit` across the workspace                                           |
| `pnpm test`                    | Database-free Vitest unit tests across the workspace                          |
| `pnpm test:integration`        | API integration tests in a disposable, per-run PostgreSQL database            |
| `pnpm test:e2e`                | Playwright with disposable data and managed API/web servers                   |
| `pnpm format` / `format:check` | Prettier write/check (code only — `docs/` is excluded, see `.prettierignore`) |

Scope any of these to one package with `pnpm --filter @sparki/api <script>`.

## Testing

`apps/api` has database-free unit tests (`src/**/*.spec.ts`) and integration tests
(`test/*.e2e-spec.ts`, run through a real Nest application via Supertest). `pnpm test` runs only
the unit tests. `pnpm test:integration` requires PostgreSQL with database-creation privileges and
creates a uniquely named `sparki_test_*` database, enables `pg_trgm`, applies the unchanged
migration history, runs files serially, and drops only that database afterward. Set
`TEST_DATABASE_URL` to a local administrative database (or a CI PostgreSQL service database); the
runner refuses non-loopback hosts outside CI and refuses test-owned URLs as its administrative
target. PostgreSQL must make `pg_trgm` available. The runner never migrates or cleans the configured
development database.

`apps/web/e2e/*.spec.ts` are Playwright browser tests covering the Patient Search workflow
end-to-end (real API, real Postgres, real browser — no mocking). Run with `pnpm test:e2e`; the
Playwright config boots `apps/api` and `apps/web` on `127.0.0.1:4000` and
`127.0.0.1:3001`, does not reuse processes already occupying those ports, and runs one worker
against its disposable schema. A port conflict therefore fails clearly instead of attaching to
an unrelated server. No separate `pnpm dev` is needed first. First run only:
`pnpm --filter @sparki/web exec playwright install --with-deps chromium`.

For deliberately pre-started servers, use `PLAYWRIGHT_SKIP_WEB_SERVER=1` only with
`pnpm --filter @sparki/web run test:e2e:raw` and supply the same isolated `DATABASE_URL`,
`API_URL`, and `WEB_PORT` to both servers. This advanced path does not provision or clean data.

## Authentication

Every route goes through a global guard (`apps/api/src/auth/`); routes opt out explicitly with
`@Public()` (see `health.controller.ts`, `auth.controller.ts`'s `login`/`logout`). Which guard runs
depends on whether WorkOS is configured, not just `NODE_ENV`:

- **`AuthGuard`** (always in production; also in dev/test once `WORKOS_API_KEY`,
  `WORKOS_CLIENT_ID`, and `WORKOS_COOKIE_PASSWORD` are set): backed by `AuthService`, which wraps
  [WorkOS AuthKit](https://workos.com/docs/authkit) per the engineering plan's recommendation.
  WorkOS owns authentication (credentials, password storage, sessions); Sparki's own
  `User`/`StaffProfile` own role and clinic membership, linked by `User.workosUserId`. Sign-in goes
  through `POST /auth/login` (email+password against WorkOS, sealed into an httpOnly
  `sparki_session` cookie), `GET /auth/me` returns the current user, `POST /auth/logout` clears the
  session. The guard transparently refreshes an expired access token and re-issues the cookie
  on any request — no separate silent-refresh flow needed client-side.
- **`DevelopmentAuthGuard`** (dev/test fallback when WorkOS isn't configured): attaches a fake
  `AuthenticatedUser` (id, email, `organizationId`, `locationId`, `role`) backed by a real,
  idempotently-seeded Organization/Location/User (`DEV_ORGANIZATION_ID` etc. in
  `development-user.service.ts`). This lets every controller read `organizationId` from
  `@CurrentUser()` exactly as it will in production, without live WorkOS credentials. The guard
  refuses to construct at all if `NODE_ENV=production`.

Controllers never take `organizationId` as a request parameter — it always comes from
`@CurrentUser()`.

### Dev/test staff-login accounts

`pnpm db:seed-auth-users` creates (or links) three role-scoped WorkOS + Sparki DB accounts for
manual login testing — receptionist, technician, veterinarian — all with password
`SparkiTest123!`. See `scripts/seed-auth-users.mjs` for the exact emails and the manual WorkOS
dashboard fallback if `WORKOS_API_KEY`/`WORKOS_CLIENT_ID` aren't set.

## CI

`.github/workflows/ci.yml` runs format check, lint, typecheck, build, and test against a Postgres
service container on every push/PR to `main`.

## Environment variables

See `.env.example`. Validation lives in `packages/config` (`apiEnvSchema` / `webEnvSchema`) —
`apps/api` requires `DATABASE_URL`; `apps/web` does not.

Prisma CLI, Nest, and Next.js don't auto-load a monorepo-root `.env` on their own (Prisma only
looks next to `schema.prisma`; Next.js only looks in the app's own directory). Every script that
needs it (`dev`, `start`, `migrate`, `migrate:deploy`, `generate`, `studio`) is wrapped with
`dotenv-cli` (`dotenv -e ../../.env -- <command>`) so `cp .env.example .env` is genuinely
sufficient — no exporting env vars by hand. In CI, `.env` doesn't exist at all; `dotenv-cli`
silently no-ops when the file is missing and the job's real environment variables (set in
`ci.yml`) pass through untouched.

# sparki
