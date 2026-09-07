# RMC ERP

Production ERP for a multi-plant ready-mix concrete company in Jordan (11
batch plants). See [`CLAUDE.md`](./CLAUDE.md) for the stack, hard rules,
and conventions, and [`docs/PLAN.md`](./docs/PLAN.md) / [`docs/DOMAIN.md`](./docs/DOMAIN.md)
for the phased build plan and domain model.

## Prerequisites

- Node.js 22+
- pnpm 10+ (`corepack enable` will pick up the pinned version automatically)
- PostgreSQL 16 (locally, or via the provided `docker-compose.yml`)

## First-time setup

```bash
cp .env.example .env
pnpm install
```

1. **Start Postgres.** Either run your own PostgreSQL 16 locally, or:
   ```bash
   docker compose up -d postgres
   ```
2. **Create the app + test databases** (once), matching the credentials in
   `.env`:
   ```sql
   CREATE DATABASE rmixerp;
   CREATE DATABASE rmixerp_test;
   ```
3. **Run migrations.** This also idempotently creates the restricted
   `rmixerp_app` Postgres role that row-level security (tenancy) applies
   to — see `packages/db/src/schema/columns.ts`.
   ```bash
   pnpm db:migrate
   ```
4. **Seed.** Creates the single company row (single-tenant at go-live), 11
   branches, the role/permission catalog, and an admin user. Prints the
   company's id.
   ```bash
   pnpm db:seed
   ```
5. Put the printed company id into `.env` as `COMPANY_ID`, then start
   everything:
   ```bash
   pnpm dev
   ```
   Web: http://localhost:5173 · API: http://localhost:3000/api/health

Alternatively, `docker compose up` runs Postgres + the API + the web app
together (see `docker-compose.yml`) — still do steps 2–5 above first (e.g.
via `docker compose run --rm api pnpm db:migrate` / `... db:seed`) since
the company id has to exist before the API can start with it configured.

### Test databases

Integration tests (`packages/db`, `apps/api`) run against a real Postgres,
per `CLAUDE.md`'s rule that business-rule tests hit the real thing, not a
mock. Point them at `rmixerp_test` (see `.env.example` for the
`TEST_DATABASE_URL` / `TEST_OWNER_DATABASE_URL` / `TEST_COMPANY_ID` /
`TEST_SEED_ADMIN_EMAIL` / `TEST_SEED_ADMIN_PASSWORD` variables) — run
migrate + seed against it the same way, using
`SEED_COMPANY_ID=$TEST_COMPANY_ID` so the id is deterministic:

```bash
MIGRATE_DATABASE_URL=$TEST_OWNER_DATABASE_URL pnpm db:migrate
MIGRATE_DATABASE_URL=$TEST_OWNER_DATABASE_URL \
  SEED_COMPANY_ID=$TEST_COMPANY_ID \
  SEED_ADMIN_EMAIL=$TEST_SEED_ADMIN_EMAIL \
  SEED_ADMIN_PASSWORD=$TEST_SEED_ADMIN_PASSWORD \
  pnpm db:seed
```

## Common commands

```bash
pnpm dev          # run api + web together
pnpm typecheck    # across every package
pnpm lint
pnpm test         # unit + integration (needs rmixerp_test set up, see above)
pnpm contract:generate  # regenerate the TS client / React Query hooks / Zod schemas
                        # from packages/contract/openapi.yaml (also runs automatically
                        # before typecheck/lint/test/dev via Turborepo)
```

Mobile (`apps/mobile`) is an Expo app: `pnpm --filter @rmixerp/mobile dev`
starts the Expo dev server (needs Expo Go or a simulator/device to actually
run — `pnpm --filter @rmixerp/mobile typecheck`/`lint`/`test` don't).

## CI

`.github/workflows/ci.yml` runs `typecheck` / `lint` / `test` against a
real Postgres service container on every push and PR — see that file for
the exact bootstrap sequence (create databases → migrate → seed →
typecheck/lint/test), which mirrors the local setup above.
