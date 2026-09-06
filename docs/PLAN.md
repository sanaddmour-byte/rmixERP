# RMC ERP — Build Plan

One phase per session/branch/PR, in order. A phase is not "done" until its
Definition of Done is fully met and `pnpm typecheck && pnpm lint && pnpm test`
are green with no regression against the prior phase's baseline.

Status legend: `not started` / `in progress` / `blocked` / `done`

| # | Phase | Status | Definition of Done |
|---|-------|--------|---------------------|
| 0 | Foundation | not started | pnpm workspace + Turborepo scaffolded (`apps/api`, `apps/web`, `apps/mobile`, `packages/db`, `packages/contract`, `packages/ui`, `packages/core`). CI running typecheck/lint/test on push. Drizzle configured against Postgres 16 with idempotent migrations run on API boot. OpenAPI pipeline generating TS client + React Query hooks + Zod schemas, wired into a health-check endpoint end-to-end (web calls it via a generated hook) as proof the pipeline works. Custom JWT + refresh-token auth (secure storage on mobile). RBAC tables (Role, Permission, per-module per-action) + tenancy guard (`company_id`/`branch_id`) enforced in one data-layer place, with a test that fails if a route bypasses it. `audit_log` table + writer. i18n scaffolding (en/ar keys, RTL layout support in web and mobile shells). `Fils` branded type in `packages/core` with money-arithmetic unit tests (no float, half-up rounding). `docker-compose.yml` for local Postgres + api + web. Typecheck/lint/test green in CI. |
| 1 | Master data | not started | Company (single row, `company_id` everywhere per Hard Rules), Branch (11 plants), User, Role, Permission, Customer, Project, Product (grades C10–C50), PriceList + lines, ChargeType, RawMaterial, Vendor. Full CRUD via contract-first routes + web screens with server-side filtering/pagination/CSV export. Price resolution pure function (project→customer→branch→company) in `packages/core` with unit tests covering every tier and the "which tier resolved" log. |
| 2 | Sales | not started | Quotations → Sales Orders (state machine), order book view, commercial charge types (zone/distance, waiting-time, pumping, per-load, seasonal, night-pour) applied to order lines, credit check evaluated at order acceptance (policy: none/warning/block), override requires privileged role + mandatory reason + audit row. Integration tests: happy path, permission denial, validation failure, credit-block rejection. |
| 3 | Production | not started | Mix designs + ingredients, production orders (state machine; cannot complete without ≥1 batch and a linked product), batch records with moisture correction, consumption back-flush against branch stock at moving-average cost inside the same transaction, returned concrete, yield variance (delivered vs batched vs returned) computed per delivery, negative stock blocked unless overridden+audited. |
| 4 | QC | not started | Fresh tests, cube tests (7/28-day + configurable ages) linked to a batch, pass/fail against product's characteristic strength, failed 28-day result raises a notification and flags every delivery drawn from that batch, batch traceability report (cube result → batch → mix design → delivery orders). |
| 5 | Dispatch | not started | Delivery orders, dispatch board, truck/driver assignment, credit check re-evaluated at dispatch, delivery cannot be marked `delivered` without a proof-of-delivery record carrying a customer signature, Gantt-style plant schedule showing planned vs actual. |
| 6 | Invoicing | not started | Invoice engine: combined invoice and split pair (taxable concrete + exempt transport) generated atomically from one delivery order, cross-referencing each other. Double-billing prevented by a **unique constraint** on delivery-order reference across invoice lines (not just application logic) — sales-order-path and delivery-order-path billing are mutually exclusive and cross-checked. Credit/debit notes referencing the original invoice. Gapless per-branch-per-year invoice numbering `{BRANCH}-{YYMM}-{SEQ}` allocated inside the same transaction as the document. Tax computed per line, rounded half-up, then summed. Concurrency test: two simultaneous invoicing requests against the same delivery order — exactly one succeeds. |
| 7 | Clearance | not started | `ClearanceProvider` interface in `packages/core`; `MockClearanceProvider` (default) and `JoFotaraProvider` shell built against the interface only — real ISTD field mappings are not guessed. UBL 2.1 XML generation, invoice UUID, per-income-source-sequence monotonic ICV, seller tax number, activity number, buyer identification. Clearance-before-issue enforced at the service layer; a cleared invoice can only be credit-noted, never edited. Clearance status persisted (`pending/cleared/rejected/retrying`) with submission payload/response and QR payload. Bounded exponential-backoff retry via cron for transport failures only; a business rejection is terminal and surfaced on the invoice, never auto-retried. Every unverified field mapping tagged `// VERIFY:` in `apps/api/src/clearance/jofotara/mapping.ts` and listed in `docs/JOFOTARA-OPEN-QUESTIONS.md`. Submitting the same invoice repeatedly produces exactly one clearance record (idempotent on our invoice ID). Applies to credit/debit notes too. |
| 8 | Receivables | not started | Collections with FIFO-by-due-date allocation across multiple invoices (manual override supported), partial allocation reflected in invoice status via its state machine. Post-dated cheque lifecycle (`pending→deposited→cleared\|bounced\|cancelled`) with bank/cheque number/due date and an aging view; a bounced cheque reopens the invoice and hits credit standing, unwinding allocations in one transaction with an audit entry. Receipt numbering prefixes (`RCP-`/`TRF-`/`PDC-`). Customer statements, aging report, credit-control dashboard, and a credit-overrides report (filterable, exportable, totals by user). Money in integer fils throughout. |
| 9 | Procurement & GL | not started | PR → PO → Goods Receipt (with quantity variance against the PO) → Vendor Bill → Payment. Spare parts as stock items. Chart of accounts, double-entry journal entries (nothing posts by mutating a balance column), trial balance (test: sums to zero), cash flow, cost centers, P&L, balance sheet. |
| 10 | Mobile & ops | not started | Expo app covering dispatcher, driver, operator, QC, collector, and approver flows, all against generated hooks (no hand-written fetch calls). Offline-aware queue with conflict surfacing (never silent overwrite) and manual retry. Push notifications with typed deep links resolving in both web and mobile via one shared resolver; test asserts every notification-type enum value resolves to a valid route in both apps. Approvals inbox. Equipment/driver document-expiry alerts (license/registration/insurance/inspection) with configurable warning thresholds and a hard block on assigning an expired-document driver/truck to a delivery (structured 422), override requiring permission + reason, audited like a credit override. |

## Working rules recap

- Loop per phase: migration → OpenAPI contract → server route + service →
  tests → generated client hooks → UI → `pnpm typecheck && pnpm lint && pnpm
  test` green → conventional commit → update this file's status column.
- Reports and exports (CSV/XLSX, server-side filtered + paginated) are built
  inside the phase that owns the underlying data — never deferred to a
  separate "reports phase."
- If a phase is too large once underway, split it and say so rather than
  shipping a stub.

## Decisions locked before Phase 0 (2026-09-06)

- New repo `sanaddmour-byte/rmixerp`, separate from the unrelated `crisp`
  marketing site.
- Deployment: generic Docker/Compose, no provider-specific config until a
  provider is chosen.
- Auth: custom JWT + refresh tokens (no third-party auth provider).
- Tenancy: single-tenant at go-live; `company_id` present everywhere per
  Hard Rules so multi-company is a future data change, not a rewrite.
- JoFotara/ISTD: no credentials yet. Build `MockClearanceProvider` as the
  active default and the `JoFotaraProvider` shell against the interface,
  with unverified field mappings flagged rather than guessed.
