# RMC ERP (rmixerp)

Production ERP for a multi-plant ready-mix concrete company in Jordan (11 batch
plants). This file is the source of truth for how this codebase is built —
read it before writing code, and update it if a convention changes.

## Stack (locked — do not substitute)

- **Monorepo**: pnpm workspaces + Turborepo.
  - `apps/api` — Express 5, Node 22, TypeScript strict
  - `apps/web` — React 19, Vite, Wouter, TanStack Query, Tailwind, shadcn/ui
  - `apps/mobile` — Expo (SDK current), React Native, Expo Router
  - `packages/db` — Drizzle ORM schema + migrations (PostgreSQL 16)
  - `packages/contract` — OpenAPI 3.1 spec + generated TS client / React Query
    hooks / Zod schemas
  - `packages/ui` — shared presentational components (web; shadcn/ui-style
    primitives built on `class-variance-authority`/`clsx`/`tailwind-merge` —
    add more via `npx shadcn add <component>` as each phase needs them)
  - `packages/i18n` — the single source of truth for en/ar translation
    strings, shared by web and mobile (each owns its own locale
    persistence/RTL mechanism, since those are platform-specific)
  - `packages/core` — framework-free domain logic: `Fils` money type, state
    machines, validators, `ClearanceProvider` interface, price resolution
- **Validation**: Zod, generated from / aligned with the OpenAPI contract.
- **Logging**: Pino. **Scheduling**: node-cron.
- **Tests**: Vitest (units + services), Supertest (API integration against a
  throwaway Postgres — testcontainers or a `test_` schema), Playwright (four
  critical web flows only).
- **Deployment**: plain Docker images + docker-compose for local/dev. No
  provider-specific config (Render/Fly/Railway) until a provider is chosen —
  keep infra generic.
- **Auth**: custom JWT + refresh tokens. Secure storage on mobile via
  `expo-secure-store`. No third-party auth provider.
- **Tenancy**: single-tenant at go-live. Every business table still carries
  `company_id` (see Hard Rules) so multi-company is a config/data change
  later, not a schema rewrite. Only one `company` row is seeded; no
  company-switcher UI is built yet.

## Folder map

```
apps/
  api/           Express app, routes, services, clearance/, cron jobs
  web/           Vite React app
  mobile/        Expo app
packages/
  db/            Drizzle schema, migrations, seed/ (never imported by prod code)
  contract/      openapi.yaml (source of truth) + generated/ (client, hooks, zod)
  ui/            shared React components (web)
  i18n/          en/ar translation strings shared by web + mobile
  core/          Fils type, state machines, ClearanceProvider, validators,
                 price resolution, holiday calendar
docs/
  PLAN.md        Phase table + status
  DOMAIN.md      Entity model + invariants
  JOFOTARA-OPEN-QUESTIONS.md   (created in the Clearance phase)
```

## Commands

Run from repo root unless noted.

- `pnpm dev` — run api + web (+ mobile via its own `pnpm --filter @rmixerp/mobile dev`,
  which needs Expo Go or a simulator/device — it isn't started by `pnpm dev`)
- `pnpm typecheck` — `tsc --noEmit` in every package (via Turborepo)
- `pnpm lint` — ESLint across all packages
- `pnpm test` — Vitest units/services + Supertest integration
- `pnpm test:e2e` — Playwright (4 critical flows)
- `pnpm db:migrate` — apply idempotent Drizzle migrations (also runs on API boot)
- `pnpm db:seed` — run `packages/db/seed` explicitly (never auto-run)
- `pnpm contract:generate` — regenerate TS client, React Query hooks, Zod
  schemas from `packages/contract/openapi.yaml`

A phase is not done until `pnpm typecheck && pnpm lint && pnpm test` are green.

## Mobile parity

Mobile is not a catch-all built after the fact. Every phase that ships a
web screen ships the equivalent mobile screen(s) *in that same phase*,
against the same generated hooks — see `docs/PLAN.md` for how each phase
after Phase 0 is scoped for this. A module is not "done" if it works on
web but not on mobile for the roles who need it in the field (driver,
operator, QC technician, collector, dispatcher, approver, sales rep). Back
office-only screens (GL, financial statements, the clearance admin queue)
are the exception and stay web-only — call this out explicitly in a
phase's plan if you're deliberately skipping mobile for a screen, rather
than silently omitting it.

## Money, units, tax conventions

- Currency is **JOD, 3 decimal places (fils)**. Every monetary value is
  stored and computed as an **integer number of fils** — `bigint` in
  Postgres, a branded `Fils` type (`packages/core`) in TypeScript. Formatting
  to `1,234.567 JD` happens only at the presentation edge. Floating-point
  money anywhere is a defect — flag and fix it, don't work around it.
- Volume: m³ to 2 decimals. Materials: kg, integers where possible.
- Tax: Jordanian GST, 16% standard, 0%/reduced supported per line. Computed
  **per line**, rounded half-up to the fils, then summed — never sum-then-tax.
- Concrete supply is taxable; transport/pumping may be billed separately as
  exempt. The invoice engine supports one combined invoice *and* a split
  pair (taxable concrete + exempt transport), generated atomically from the
  same delivery order, cross-referencing each other.
- Price resolution is one pure function in `packages/core` with unit tests:
  **project-specific → customer-specific → branch → company default**. Every
  quotation/order line logs which tier resolved.
- Weekend is Friday–Saturday. All scheduling/aging/due-date arithmetic goes
  through a configurable working-week + Jordanian holiday calendar table —
  never raw `Date` day-of-week math.

## Hard rules

- `any` is banned. `@ts-expect-error` requires a comment with an issue
  reference.
- Relative imports never carry a `.js` extension (`from "./foo"`, not
  `from "./foo.js"`). Vite/tsx/tsc's Bundler resolution accept either
  style, but Metro (`apps/mobile`) only resolves the extensionless form —
  a `.js`-suffixed relative import silently breaks the mobile bundle. This
  applies repo-wide, including packages `apps/mobile` never imports today,
  so the convention doesn't quietly break the day it does.
- Every business table carries `company_id`, `branch_id`, `created_at`,
  `updated_at`, `created_by`, and soft-delete `voided_at`. Tenancy is
  enforced in **one** query guard in the data layer (`packages/db`), never
  per-route. There is a test that fails if a route bypasses it.
- Every state transition (invoice, delivery, PO, approval, credit override)
  goes through an explicit state machine in `packages/core` with an
  allowed-transition table. No `status = 'paid'` scattered in routes.
- Every mutation touching money, stock, credit, or clearance writes an
  immutable `audit_log` row: actor, before/after, reason.
- Financial postings are double-entry. Nothing is "posted" by mutating a
  balance column — balances are derived from journal lines. A trial balance
  that doesn't sum to zero fails a test.
- All POST endpoints that create documents accept an `Idempotency-Key`
  header and dedupe on it.
- No seed/demo data reachable from production code paths — seeds live in
  `packages/db/seed` behind an explicit script only.
- Contract-first, always: OpenAPI spec → regenerate client/hooks/Zod →
  Express route → web/mobile consumers. A hand-written fetch call that
  bypasses generated hooks is a build failure, not a style nit.
- Every schema change is an idempotent migration, safe against a database
  holding live data. No destructive migration without an explicit callout.
- Never weaken an existing permission check to make a test pass.
- Never scaffold a screen not wired to a real endpoint. Never leave a TODO
  in a merged phase — split the phase instead and say so.

## Never do this

- Float/`number` arithmetic for money.
- Sum-then-tax instead of tax-per-line-then-sum.
- A route that queries without going through the tenancy guard.
- A status field written directly instead of via its state machine.
- A balance column updated in place instead of derived from journal lines.
- A hand-rolled `fetch`/`axios` call in web or mobile bypassing generated
  hooks.
- Guessing JoFotara/ISTD field formats — mark unverified fields `// VERIFY:`
  and list them in `docs/JOFOTARA-OPEN-QUESTIONS.md` instead.
- Deleting or bypassing an existing permission/tenancy check to unblock a
  test or a feature.
