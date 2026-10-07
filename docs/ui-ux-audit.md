# RMC ERP — UI/UX Audit

Date: 2026-10-07. Scope: `apps/web` (React 19 + Vite + Tailwind CSS v4),
`packages/ui` (shared components), `packages/i18n`, and `apps/mobile`
(Expo/React Native) on branch `claude/ui-ux-hardening`. This audit is
evidence-based — every finding cites file:line in the actual repository,
not the external brief's assumptions about what a "typical ERP" has.

## How to read this

Per finding: **current behavior**, **usability issue**, **severity**
(P0 = blocks or actively harms task completion / safety; P1 = a real
ERP-grade capability gap; P2 = polish), **recommended improvement**,
**implementation status** (`Fixed in this pass` or `Not implemented —
backlog`, with reasoning). This mirrors `docs/architecture/production-
readiness-audit.md`'s format and priority discipline: P0 first, document
the rest honestly rather than attempt all 62 sections of the brief
shallowly.

**Context**: this codebase is already more disciplined than a typical
early-stage ERP frontend — a real hand-built icon set, a real i18n
package, permission-filtered navigation, a shared `ResourceListPage` used
by 13+ master-data screens, and a consistent navy/orange/green brand
already expressed as Tailwind `@theme` tokens. The gaps below are mostly
"this foundation was never extended to X" rather than "nothing exists."

## 1. Design tokens, typography, spacing (P0/P1)

### 1.1 No semantic tokens — only raw brand color scales exist

- **Current:** `apps/web/src/index.css:7-42`'s `@theme` block defines only
  `navy`/`orange`/`green` scales. No `--color-success`/`warning`/`danger`/
  `info`/`surface`/`surface-raised`/`border`/`text`/`text-muted` tokens
  exist anywhere.
- **Issue:** Status/semantic meaning is expressed by reaching for a raw
  Tailwind utility (`bg-green-100`, `text-red-600`) at each call site,
  with no single place that defines "this is what danger means in this
  app." ~14 such off-brand raw-color call sites exist outside
  `StatusBadge` (e.g. `QCPage.tsx:133-137` hand-rolling the exact pattern
  `StatusBadge` already encapsulates, with no `dark:` variant on two of
  its three branches — a real dark-mode contrast bug).
- **Severity:** P0 (the dark-mode contrast gap is a real visibility bug
  for QC technicians checking failed tests at night/in a dark-themed
  environment).
- **Recommended:** Add semantic tokens mapped onto the existing brand +
  new amber/red scales; centralize every status-color decision through
  one registry (see §6).
- **Status:** `Fixed in this pass` — see §6 and the design-system changes
  below.

### 1.2 Typography is consistent *within* two categories, but there's no single "page title" convention

- **Current:** Dashboard-style pages (`HomePage.tsx:23`, `ReportsPage.tsx:
  52`) both use `text-2xl font-semibold`; all 37 `ResourceListPage`-driven
  routes get their title from `CardTitle` (`packages/ui/src/card.tsx:18`,
  `text-lg font-semibold`). Section labels (`text-sm font-semibold
  uppercase tracking-wide`) and inline field labels (`font-semibold
  text-navy-700`, no size class) are each reused consistently within
  their own category.
- **Issue:** Two different "what is the page title" conventions
  coexist by page type. Not broken, but not a single documented scale
  either (brief's §4 asks for one).
- **Severity:** P2 — functional today, a documentation/consistency gap
  rather than a usability bug.
- **Recommended:** Document the existing de facto scale (§50) rather than
  force every one of 38 route files onto a single `<PageTitle>` component
  in this pass — that rewrite is real but low urgency given it already
  reads consistently today.
- **Status:** Documented in `docs/design-system.md` (added this pass); a
  shared `PageHeader` component was added and applied to 3 flagship
  screens (Dispatch, QC, Action Center) as the demonstrated pattern —
  retrofitting the remaining 35 is backlog (see §L).

### 1.3 Spacing is consistent at the structural level; one real nesting mismatch

- **Current:** `App.tsx:47`'s `<main className="p-6">` is the single
  outer-padding source for all 38 routes — good. `CardContent` fixes
  `p-6 pt-0` everywhere. But `ResourceForm` (`ResourceListPage.tsx:40`)
  uses `p-4` for its own padding while being rendered *inside* a nested
  `Card` inside the already-`p-6`-padded `CardContent` — a card-in-card
  with two different internal paddings.
- **Severity:** P2.
- **Status:** `Fixed in this pass` — aligned the nested create/edit card's
  internal padding and border treatment as part of the ResourceListPage
  rework (§3/§9 below).

### 1.4 Icon sizing has no scale — 4 ad hoc sizes across 4 files

- **Current:** `h-3.5 w-3.5` (Sidebar sub-items), `h-4 w-4` (Sidebar
  top-level/footer), `h-5 w-5` (ReportsPage), `h-6 w-6` (HomePage) — no
  shared size token or prop.
- **Severity:** P2.
- **Status:** `Not implemented — backlog`. The `Icon` component was left
  taking a free-form `className` (not force-migrated to a `size` enum
  prop) because the existing 4 sizes already correlate sensibly with
  context (dense nav vs. dashboard tiles) — forcing a single scale now
  would touch ~30 call sites for a cosmetic gain lower-value than the
  P0/P1 work in this pass.

## 2. Accessibility (P0)

### 2.0 Focus-visible rings never actually rendered in production — a build-configuration bug, not a styling gap

- **Current:** `packages/ui/src/button.tsx` and `input.tsx` define real
  `focus-visible:ring-*` classes, and this audit's initial research pass
  (before implementation) accordingly reported focus indicators as
  "present and reasonably good." **That assessment was wrong, and this
  pass found out why while debugging an unrelated issue (a new Button
  variant's classes not appearing in the built CSS):** `packages/ui` is
  only reachable from `apps/web` through the pnpm workspace symlink at
  `node_modules/@rmixerp/ui`, and Tailwind v4's automatic content
  detection excludes `node_modules` by default. Verified directly against
  the pre-existing, unmodified codebase (stashed this pass's changes and
  rebuilt): `ring-orange-400` (`Input`'s focus ring) and `ring-navy-900`
  (`Button`'s default-variant focus ring) — along with `ring-2`,
  `ring-offset-2`, `pointer-events-none`, and `transition-colors` — **do
  not appear anywhere in the production CSS bundle**, confirmed by
  rebuilding from a clean `git stash` of the original code. Any
  `packages/ui` class that happens to share a name with something used
  directly in `apps/web/src` (e.g. `bg-navy-900`, used in dozens of route
  files) was incidentally covered and looked fine; anything unique to
  `packages/ui` silently never compiled.
- **Issue:** This is a confirmed, real WCAG 2.4.7 (Focus Visible)
  failure that predates this audit and has nothing to do with intent —
  the code was always correct; the build never shipped it. Every button
  and input in the entire application has been keyboard-focusable with
  **no visible focus indicator** in whatever environment this was
  previously built/deployed in.
- **Severity:** P0 — this is the single most severe accessibility finding
  in this audit, more severe than the keyboard-interaction gaps in §2.1
  below, because it affects literally every interactive element in the
  product, not a subset of panels/forms.
- **Recommended:** Add an explicit Tailwind v4 `@source` directive so
  `packages/ui/src` is scanned regardless of how it's reached on disk —
  the standard fix for exactly this monorepo-workspace scenario.
- **Status:** `Fixed in this pass` — `apps/web/src/index.css`'s
  `@source "../../../packages/ui/src";`. Verified by rebuilding and
  confirming `ring-danger`, `ring-navy-900`, `ring-orange-400`, `ring-2`,
  `pointer-events-none`, and `transition-colors` (plus every other
  previously-silent `packages/ui`-only class, including this pass's own
  new `destructive` button variant, which is how this was first noticed)
  now compile correctly. **This should be treated as the highest-value
  single-line fix in this entire audit** — it retroactively fixes focus-
  visibility on every button and input across the whole application, not
  just the components touched directly in this pass.

### 2.1 Zero keyboard-interaction engineering anywhere in the app

- **Current:** Confirmed by exhaustive grep: `tabIndex` — 0 occurrences.
  `onKeyDown` — 0 occurrences. Programmatic `.focus()` — 0 occurrences.
  `role="..."` — 0 occurrences. `aria-*` — 2 occurrences total in the
  entire web app (`icons.tsx:283`'s `aria-hidden`, `Sidebar.tsx:81`'s one
  `aria-label`).
- **Issue:** Tab order "works" only because every interactive element
  happens to be a native `<button>`/`<a>` in sensible DOM order — there is
  no Escape-to-close on any panel, no focus returned to a trigger after a
  panel closes, and icon-only buttons (Sidebar's theme/locale/logout
  buttons when the rail is collapsed) have no accessible name at all once
  their text label is suppressed.
- **Severity:** P0 — a keyboard-only or screen-reader user cannot
  dismiss an inline edit panel without a mouse, and collapsed-rail icon
  buttons are literally unlabeled for assistive tech.
- **Recommended:** New `Dialog`/`Drawer` primitives with real focus-trap,
  Escape-to-close, and focus-return (§3); `aria-label` added to every
  icon-only button; Escape handling added to `ResourceListPage`'s
  inline forms.
- **Status:** `Fixed in this pass` for the new `Dialog`/`Drawer`
  components and the Sidebar's icon-only buttons. `Not implemented —
  backlog` for retrofitting Escape-to-close onto `ResourceListPage`'s
  non-modal inline create/edit cards specifically (converting those to
  use the new `Dialog` primitive instead of an inline `Card` is a larger,
  separate rework — see §L — though the void action they already trigger
  now goes through the new accessible `ConfirmDialog`).

### 2.2 No `aria-invalid`/`aria-describedby` on any form input anywhere

- **Current:** `packages/ui/src/input.tsx` is a plain passthrough with no
  error-state props. Every form's error text (`ResourceListPage.tsx:103`,
  and every bespoke form's post-submit error paragraph) is an unlinked
  `<p>` with no `id`/`aria-describedby` connecting it to the field it's
  about.
- **Severity:** P1 (every form in the app is affected, but the forms do
  work for sighted mouse users today — this is an assistive-tech gap, not
  a block for all users).
- **Status:** `Fixed in this pass` for `ResourceForm` (the shared form
  used by 13 master-data screens) — see §9. `Not implemented — backlog`
  for the ~8 bespoke forms (Quotations, SalesOrders, Payments,
  VendorBills, GoodsReceipts, etc.) that hand-roll their own fields —
  each needs its own per-field wiring, a larger retrofit than this pass's
  scope allowed alongside the P0 items.

## 3. Destructive actions have zero confirmation, anywhere (P0)

- **Current:** Repo-wide search for `confirm(`, `window.confirm`, or any
  backdrop/overlay pattern returns **zero matches**. Void
  (`ResourceListPage.tsx:278`), quotation/sales-order line removal,
  sales-order cancel, PO reject/cancel, and others all fire their
  mutation **directly on click** with no "are you sure?" step of any
  kind. The only existing safety net is a `disabled={pending}` guard
  against double-submission — not a confirmation.
- **Issue:** A misclick permanently voids/cancels a real business
  document with no recovery step offered in the UI (the backend soft-
  deletes, so data isn't physically gone, but the user has no way to
  know that or undo it from here).
- **Severity:** P0 — this is exactly the brief's §42 concern, and it's
  universal, not an edge case.
- **Recommended:** A `ConfirmDialog` for every void/cancel/reject action,
  with the destructive action visually distinguished (red, not a ghost
  button that looks identical to "Edit").
- **Status:** `Fixed in this pass` for `ResourceListPage`'s `onVoid`
  (covers 13 master-data screens) and a new `destructive` Button variant
  added to `packages/ui`. `Not implemented — backlog` for the bespoke
  per-page cancel/reject actions (SalesOrders cancel, PurchaseOrders
  reject/cancel, etc.) — each is a one-line wiring change once
  `ConfirmDialog` exists (which it now does), listed as the top backlog
  item in §M given how mechanical and high-value it is.

## 4. Mutation errors are silently swallowed app-wide — the single most consequential finding (P0)

- **Current:** `apps/web/src/main.tsx` constructs `new QueryClient()` with
  **no global defaults at all**. Concretely: none of the 13
  `ResourceListPage`-based screens pass the `createError` prop their own
  component interface already defines (`grep -rn "createError"
  apps/web/src/routes/*.tsx` → zero matches) — `CustomersPage.tsx:112`
  calls `onCreate={(values) => create.mutate(...)}` with no error
  handling, and `ResourceListPage.tsx:198-201`'s submit handler closes the
  create panel **unconditionally**, regardless of whether the mutation
  later fails. Status-transition actions (`PurchaseOrdersPage.tsx:93-98`'s
  approve/reject, `VendorBillsPage.tsx:236`'s approve, `SalesOrdersPage.
  tsx:164-172`'s cancel/fulfill) pass no `onError` at all. Two screens
  (`PaymentsPage.tsx`'s list, `ApprovalsInboxPage.tsx`'s table) have no
  loading *or* empty-state branch, so they render a silent blank table
  while loading.
- **Issue:** **A user who clicks "Create," "Approve," "Reject," or
  "Cancel" and the request fails currently sees nothing happen.** The
  create form just closes as if it worked; the button just re-enables.
  This is not a cosmetic gap — it is a functional failure of the
  create/approve/reject/cancel workflows under any real-world error
  condition (validation failure, permission change, network blip,
  concurrent-conflict 409 from the backend's own concurrency controls).
- **Severity:** P0 — the highest-severity finding in this audit.
- **Recommended:** A global `MutationCache.onError` handler on the
  `QueryClient` that surfaces every failed mutation's error as a toast,
  app-wide, with zero per-page changes required; separately, make
  `ResourceListPage`'s create/edit flow actually await the mutation and
  keep the panel open (with the entered data intact) on failure, rather
  than closing regardless.
- **Status:** `Fixed in this pass` — see §5 (toast system) and §9
  (`ResourceListPage` rework). This closes the silent-failure gap for
  *every* mutation in the app (the global handler) and specifically
  restores the entered form data on failure for the 13 `ResourceListPage`
  screens (the awaited-mutation fix). Bespoke pages' own hand-rolled
  error messages (GoodsReceipts, Payments, VendorBills — which already
  show *some* error text, just not via a consistent mechanism) are left
  as-is; they are not silent, just inconsistent, and are lower priority
  than the previously-100%-silent paths this fix closes.

## 5. No toast/notification system exists (P0 — now fixed, enables §3/§4)

- **Current:** Zero matches for "toast"/"Toast"/"Snackbar" anywhere in
  `apps/web/src`. Success feedback after a save is implicit only (the row
  appears, or the detail panel auto-selects) — there is no way to show a
  transient confirmation or a global error message at all.
- **Severity:** P0 — this is the missing infrastructure both §3 and §4's
  fixes depend on, and the brief explicitly asks for it (§40).
- **Recommended:** A minimal, dependency-free toast store (module-level
  pub/sub so it's callable from outside React, e.g. from the
  `QueryClient`'s `MutationCache`) plus a `ToastProvider`/viewport
  component.
- **Status:** `Fixed in this pass` — `packages/ui/src/toast.tsx` (store +
  `useToast` + `<Toaster />`), wired into `main.tsx`'s `QueryClient` via
  `MutationCache.onError`, and into the `App` shell.

## 6. Status colors are duplicated per-page instead of centralized (P1)

- **Current:** `StatusBadge` (`StatusBadge.tsx`) is itself sound (tone-
  based, has real `dark:` variants) but **every page defines its own
  status→tone mapping independently** — `PurchaseOrdersPage.tsx`,
  `VendorBillsPage.tsx`, `PostDatedChequesPage.tsx`, `ClearanceQueuePage.
  tsx` each have their own inline `STATUS_TONE`/`PDC_STATUS_TONE`/
  `CLEARANCE_STATUS_TONE` object, and `QCPage.tsx:133-137` bypasses
  `StatusBadge` entirely, hand-rolling the identical visual pattern with
  two of its three color branches missing a `dark:` variant (a real
  contrast bug, not just duplication — see §1.1).
- **Severity:** P1 (duplication + inconsistency risk), P0 for the
  specific QC dark-mode contrast bug already counted in §1.1.
- **Recommended:** One shared status registry mapping every known status
  string (across sales/delivery/PO/vendor-bill/PDC/clearance/invoice/QC)
  to a semantic tone, consumed by `StatusBadge` and by every page that
  currently defines its own mapping.
- **Status:** `Fixed in this pass` — `apps/web/src/lib/statusRegistry.ts`
  added; `QCPage.tsx`'s hand-rolled pill replaced with `StatusBadge`;
  `PurchaseOrdersPage.tsx`, `VendorBillsPage.tsx`, `PostDatedChequesPage.
  tsx`, `ClearanceQueuePage.tsx`, `DispatchPage.tsx` migrated to the
  shared registry.

## 7. Arabic/RTL (P0/P1 — several concrete, previously-unverified bugs confirmed)

### 7.1 Pagination's Previous/Next buttons don't visually flip in RTL

- **Current:** `ResourceListPage.tsx:292`'s `<div className="flex gap-2">`
  renders Previous then Next in fixed DOM/visual order; no `dir`-aware
  reordering exists.
- **Issue:** In Arabic (reading right-to-left), the button physically on
  the right — where a reader's eye lands first — says "Next"
  (السابق/التالي are plain text labels, not icons, so there's no
  arrow-direction confusion, but the left-right *physical* order of two
  text buttons doesn't swap to match reading direction).
- **Severity:** P0 — this is a genuine, confirmed, every-single-page
  usability bug for Arabic users (every `ResourceListPage` screen has
  this pagination control).
- **Status:** `Fixed in this pass` — the button container now reverses
  physical order in RTL so "Next" (the forward/reading-direction action)
  stays on the reading-start side.

### 7.2 No RTL-aware icon mirroring; directional icons are hardcoded

- **Current:** `Sidebar.tsx:83`'s rail-collapse icon
  (`chevronsLeft`/`chevronsRight`) swaps only on `collapsed` state, never
  on `dir` — so in RTL the icon still points the LTR-semantic direction.
  Same for the `logOut` icon's fixed rightward arrow.
- **Severity:** P1.
- **Status:** `Fixed in this pass` — the shared `Icon` component now
  mirrors a small, explicit set of direction-sensitive icon names when
  `dir="rtl"`.

### 7.3 Flash of wrong direction/theme on every page load

- **Current:** `index.html:2` hardcodes `dir="ltr"`; both `dir` and the
  dark-mode class are set in a `useEffect` (`LanguageContext.tsx:44-45`,
  `ThemeContext.tsx:38-40`), which runs after React mounts and after the
  initial paint.
- **Severity:** P1 (cosmetic but real — a dark-mode or Arabic user sees a
  flash of light-mode English-direction layout on every load).
- **Status:** `Fixed in this pass` — a small inline script in
  `index.html`, executed before any CSS/React loads, reads the same
  `localStorage` keys and sets `dir`/`lang`/the `dark` class synchronously.

### 7.4 No bidi isolation for document codes/invoice numbers

- **Current:** Confirmed zero occurrences of `dir="ltr"` overrides,
  `unicode-bidi`, or `<bdi>` anywhere. Invoice numbers, document codes,
  and similar alphanumeric strings are plain text nodes with no isolation
  from their surrounding direction context.
- **Severity:** P1 (not yet visibly broken, because current Arabic UI
  strings rarely sit directly adjacent to a code in the same text run —
  but this is latent, not absent, and will surface the moment more
  Arabic labels are added next to codes).
- **Status:** `Not implemented — backlog` as a systemic sweep (would
  touch dozens of render sites); the highest-traffic instances (invoice/
  document numbers in `InvoicesPage.tsx`, `StatusBadge`-adjacent codes)
  were wrapped in native `<bdi>` as part of this pass's table-cell
  styling cleanup, but a full repo-wide sweep is out of scope here.

### 7.5 Native date inputs' internal segment order isn't verified/forced for Arabic

- **Current:** All date fields are plain `<input type="date">`; segment
  order is left entirely to the browser/OS locale, with no app-level
  override.
- **Severity:** P2 — this is standard, acceptable behavior for native
  date inputs (most production apps rely on the browser here too); not a
  bug, just a limit of the native-input approach, noted for completeness
  per the brief's explicit ask to check it.
- **Status:** `Not implemented — backlog`; would require a custom date-
  picker component, a larger dependency/scope decision not justified by
  this specific, low-severity finding alone.

## 8. Navigation: sidebar is solid; two concrete fixable gaps, one real IA mismatch (P0/P1)

### 8.1 Collapsed-rail icons have no tooltips and, for the bottom utility buttons, no accessible name

- **Current:** `Sidebar.tsx:103-120`'s group buttons have no `title`/
  `aria-label` when collapsed; the three bottom utility buttons
  (theme/locale/logout) only get their visible text label when
  *expanded* — collapsed, they fall back to icon-only with a `title`
  attribute present but still no `aria-label` (title alone is a weak,
  inconsistent accessible-name source across browsers/screen readers).
- **Severity:** P0 for the accessible-name gap (already counted in §2.1),
  P1 for the missing hover tooltip on collapsed group icons specifically
  (a sighted mouse user also can't tell what a collapsed icon means
  without clicking it).
- **Status:** `Fixed in this pass` — `aria-label` added to every icon-only
  state; native `title` tooltips added to collapsed group buttons.

### 8.2 Information architecture: Quality (Mix Designs + QC) was buried inside the generic "Operations" group

- **Current:** `navConfig.ts:60-74`'s `operations` group mixes mix
  designs, inventory, production orders, QC, trucks, drivers, dispatch,
  and fleet alerts into one undifferentiated 8-item group — the largest
  group in the sidebar by item count, with QC (a quality-assurance
  function, distinct from day-to-day dispatch/production operations)
  given no separate identity.
- **Severity:** P1.
- **Recommended:** Split into `operations` (dispatch, production,
  inventory, fleet: trucks/drivers/fleet-alerts) and a new `quality`
  group (mix designs, QC) — matching the brief's suggested IA using only
  entities that actually exist in this codebase (no "Samples"/"NCRs" nav
  items were invented, since those entities don't exist per the backend
  audit).
- **Status:** `Fixed in this pass`.

### 8.3 No breadcrumbs anywhere

- **Current:** Confirmed zero matches for any breadcrumb pattern.
- **Severity:** P2 — the sidebar's always-visible group/item highlighting
  already answers "where am I" reasonably well for a 2-level IA; a
  breadcrumb adds the most value on deep detail-drill-through flows
  (customer → project → invoice), which this pass's cross-module linking
  work (§L backlog) would need to exist first for breadcrumbs to be
  meaningful.
- **Status:** `Not implemented — backlog`.

## 9. `ResourceListPage` (shared by 13 screens): the highest-leverage single component in the app

This component alone determines UX quality for Branches, ChargeTypes,
Customers, Drivers, MixDesigns, PriceLists, Products, Projects,
RawMaterials, Roles, Trucks, Users, and Vendors. Fixing it once fixes all
13 screens at once — the same leverage principle as the backend audit's
"fix the one centralized posting function" finding.

- **Current/issues found** (consolidating §2.2, §3, §4, §1.3 above as
  they apply to this one component): no confirmation on void; create/edit
  errors silently discarded and the form closes regardless of success;
  no `aria-invalid`/`aria-describedby`; nested card padding mismatch;
  generic non-contextual empty state (`"No records yet."`, identical
  across all 13+ screens with no call-to-action); "Loading…" text instead
  of a skeleton; no Escape-to-close.
- **Severity:** P0 (confirmation + silent-error fixes), P1 (the rest).
- **Status:** `Fixed in this pass` for: void confirmation (via the new
  `ConfirmDialog`), awaited create/edit with the form staying open and
  the entered data intact on failure, `aria-invalid`/`aria-describedby`
  wiring, nested-card padding, and a skeleton-based loading state
  (replacing the "Loading…" text). `Not implemented — backlog` for:
  per-resource contextual empty-state copy with a create CTA (the prop
  now exists and was wired for 3 demonstration screens — Customers,
  Quotations' underlying list, and Vendors — the remaining ~10 screens
  need their own one-line contextual string, mechanical but not done
  here) and Escape-to-close (the inline-card pattern would need to become
  a true `Dialog` to support this properly, a larger rework than fits
  this pass).

## 10. Dispatch board: real operational gaps confirmed (P1)

- **Current:** No mixer/truck/pump fleet-availability panel exists
  anywhere on the page — trucks/drivers appear only as two bare
  `<select>` dropdowns inside the detail panel for assigning to one
  delivery, never as a fleet-wide utilization view. The Gantt rows show
  only customer name + a QC-failed flag + a status-colored bar — no
  quantity, truck, driver, or plant info on the block itself, and
  clicking a Gantt row does nothing (only the separate table below is
  clickable). The detail panel renders as a plain `Card` appended to the
  bottom of the page, not a drawer — so opening a delivery's detail pushes
  the whole page layout down and loses the board from view without
  scrolling back up.
- **Severity:** P1 — this is a real, significant gap for what the brief
  (correctly) identifies as a flagship screen, but it's a large rework
  (the brief's §21 envisions a three-pane layout with a resource panel
  this codebase has no data model for yet beyond trucks/drivers — pumps
  don't exist per the backend audit).
- **Recommended:** Convert the detail panel to a `Drawer` (keeps the board
  in view); add quantity/truck/driver to each Gantt block's visible
  content and make blocks clickable (not just the table rows); add a
  simple truck-utilization strip ("3 of 7 trucks assigned today") using
  data already available from the trucks/delivery-orders endpoints — no
  new backend capacity model needed for this much.
- **Status:** `Fixed in this pass` for converting the detail panel to a
  `Drawer` and adding quantity/truck/driver to Gantt blocks with real
  click handling. `Not implemented — backlog` for the fleet-utilization
  strip and full resource panel — these need a small amount of new
  client-side aggregation logic across two endpoints and were judged
  lower priority than closing the P0 items across the rest of the app
  first.

## 11. Action Center does not exist — built from existing endpoints only (P1)

- **Current:** No cross-module exception/action screen exists; the
  closest analogues (`ApprovalsInboxPage`, `ClearanceQueuePage`,
  `FleetOpsAlertsPage`) are each single-purpose and never combined.
- **Severity:** P1.
- **Recommended:** A frontend-only aggregator page that fans out to
  endpoints that already exist (credit-control, clearance queue,
  post-dated cheques filtered to bounced, QC cube-tests filtered to
  failed, the approvals inbox) and renders them as one unified, severity-
  sorted, actionable list — no backend change.
- **Status:** `Fixed in this pass` — `apps/web/src/routes/
  ActionCenterPage.tsx`, added to the sidebar and reachable from Home.

## 12. Command palette does not exist (P1)

- **Current:** No keyboard-first navigation of any kind.
- **Severity:** P1.
- **Recommended:** A `Ctrl/Cmd+K` palette over the existing
  permission-filtered nav list, client-side fuzzy-filtered — scoped to
  navigation in this pass (entity search like "Invoice INV-10224" would
  need a backend global-search endpoint, confirmed not to exist in the
  prior backend audit, so is out of scope for a frontend-only pass).
- **Status:** `Fixed in this pass` for navigation + quick actions (jump to
  any permitted module/screen). `Not implemented — backlog` for entity
  search (customers/invoices/etc. by name/number) — needs a backend
  global-search endpoint first; noted as the top recommendation in the
  prior backend audit's own next-10-tasks list too.

## 13. Home dashboard remains a generic module launcher (P1 — partially addressed)

- **Current:** `HomePage.tsx` is a permission-filtered grid of module
  tiles with no role-specific content, confirmed in the prior backend-
  focused audit's §9.1.
- **Severity:** P1.
- **Recommended:** Full role-aware dashboards per the brief's §8 (seven
  distinct role views) is a substantial, multi-endpoint undertaking.
- **Status:** `Not implemented — backlog` for the full seven-role
  dashboard redesign — out of proportion with this pass's time budget
  next to the P0 items above. The Action Center (§11) and Command Palette
  (§12) absorb a meaningful share of the value a role dashboard would
  have provided (fast access to what needs attention, fast navigation)
  without requiring seven bespoke screen designs; ranked #1 in §M's
  backlog for the next pass.

## 14. Mobile app (Expo): functional, has one real gap worth flagging; no changes made in this pass

- **Current:** No persistent tab bar — a single scrollable link-menu home
  screen (`app/index.tsx`, actually literally a `HealthScreen` showing an
  API health check first) is the only way to move between sections. All
  list screens are already properly compact single-column rows (not
  cramped desktop tables), which is correct mobile practice. The sync
  queue has a real, reachable UI (`app/sync-queue/index.tsx`) — contrary
  to what might be assumed, it is not orphaned. Mobile does not share
  `@rmixerp/ui` with web but deliberately mirrors its navy/orange/green
  brand language in `src/theme.ts`.
- **Issue:** No bottom tab bar means every section switch round-trips
  through the link-menu home screen — exactly the brief's §43 concern.
  Converting to a persistent tab bar (Home/Tasks/Deliveries/Notifications/
  More, per the brief) is a real navigation-architecture change to a
  separate Expo Router app, not a small tweak.
- **Severity:** P1.
- **Status:** `Not implemented — backlog` — this pass focused on the web
  app per the time available; a mobile tab-bar conversion is substantial
  enough (new route-group layout, moving ~20 screens under it) to deserve
  its own dedicated pass rather than a rushed partial change here.

## 15. Dark mode is close to a flat inversion, not layered surfaces (P1)

- **Current:** 287 `dark:` usages exist (real, not neglected), but almost
  all collapse onto a single `dark:bg-navy-900` shade for every
  card/panel/nested-box — there is no distinct "raised surface" shade
  separate from the base card background in dark mode (light mode does
  have two layers: page background vs. white card).
- **Severity:** P1.
- **Status:** `Fixed in this pass` — added a second dark-mode surface
  token (`surface-raised`) and applied it to the one concrete nested-card
  case already being touched for other reasons (`ResourceListPage`'s
  create/edit panel). A full sweep across every panel in the app is
  `Not implemented — backlog` given the volume of call sites.

## Final deliverable

### 1. UI/UX issues discovered

See §1–§15 above — in summary: a build-configuration bug that silently
prevented every focus-visible ring in the app from ever reaching
production CSS (P0, §2.0 — the single highest-value fix in this audit),
silently-swallowed mutation errors across the entire app (P0), zero
destructive-action confirmation (P0), zero keyboard/ARIA engineering (P0),
a real RTL pagination-order bug and three
other RTL gaps (P0/P1), status-color duplication with one real dark-mode
contrast bug (P0/P1), no toast system (P0, now fixed), a buried Quality
IA grouping (P1), no Action Center or command palette (P1), dispatch
board missing fleet visibility (P1), dark mode is a flat inversion (P1),
and several smaller consistency/polish gaps (P2).

### 2. Screens redesigned

Dispatch board (drawer-based detail, richer Gantt blocks), QC page
(StatusBadge instead of a hand-rolled, dark-mode-unsafe pill), all 13
`ResourceListPage`-based master-data screens (confirmation, error
handling, accessibility, loading/empty states), Sidebar (tooltips,
aria-labels, IA regrouping), Home (link to the new Action Center).

### 3. Components created or consolidated

New in `packages/ui`: `Dialog`, `Drawer`, `ConfirmDialog`, `Toast`/
`Toaster`/`useToast`, `Skeleton`, a `destructive` `Button` variant. New
in `apps/web/src`: `statusRegistry.ts`, `PageHeader`, `CommandPalette`,
`ActionCenterPage`. Consolidated: `QCPage`'s hand-rolled status pill →
`StatusBadge`; `PurchaseOrdersPage`/`VendorBillsPage`/
`PostDatedChequesPage`/`ClearanceQueuePage`/`DispatchPage`'s independent
`STATUS_TONE` objects → `statusRegistry.ts`.

### 4. Navigation changes

Sidebar: collapsed-rail tooltips/aria-labels; new `quality` nav group
splitting Mix Designs + QC out of the overloaded `operations` group;
Command Palette (Ctrl/Cmd+K) for keyboard-first navigation.

### 5. Dashboard improvements

Action Center added (severity-sorted cross-module exceptions from
existing endpoints). Full seven-role dashboard redesign is backlog (§13).

### 6. Table improvements

`ResourceListPage` (13 screens): confirmation on void, awaited create/
edit with data preserved on error, aria wiring, skeleton loading, RTL
pagination-order fix. Full column resize/show-hide/saved-views/sort is
backlog (§L) — a much larger, separate table-system rework.

### 7. Dispatch UX improvements

Detail panel converted to a `Drawer` (keeps the board visible); Gantt
blocks now show quantity/truck/driver and are clickable. Fleet-wide
capacity/utilization panel is backlog.

### 8. Mobile improvements

None implemented this pass (see §14) — audited and documented only, in
favor of the web-app P0 work within this pass's time budget.

### 9. RTL improvements

Fixed: pagination button order, directional icon mirroring, dir/theme
flash on load. Backlog: full bidi-isolation sweep for codes, native
date-input segment order (not a bug, just unverified/unforced).

### 10. Dark mode improvements

Fixed: QC status pill contrast bug, one new layered-surface token applied
to the nested create/edit card. Backlog: full surface-layering sweep.

### 11. Accessibility fixes

**Most significant**: fixed a build-configuration bug (§2.0) that had
silently prevented every focus-visible ring in the entire app — on every
button and every input, everywhere — from ever reaching production CSS.
This was found while implementing, not during the initial research pass
(which had incorrectly reported focus indicators as "present and
reasonably good," since it read the source code's intent, not the
compiled output). Also fixed: `Dialog`/`Drawer` focus-trap + Escape +
focus-return; `aria-label` on every icon-only Sidebar button;
`aria-invalid`/`aria-describedby` on `ResourceForm`. Backlog: the ~8
bespoke forms' own field-level aria wiring; Escape-to-close on
`ResourceListPage`'s non-modal inline forms.

### 12. Before/after — the three highest-value changes

- **Any failed mutation, anywhere**: before — nothing visible happens;
  after — a toast names the failure.
- **Clicking "Remove" on any of 13 master-data screens**: before —
  instant, unconfirmed deletion; after — a confirm dialog naming the
  record, with a visually-distinct destructive action.
- **A failed create on any of 13 master-data screens**: before — the
  form vanishes and the entered data is lost; after — the form stays
  open, the error is shown inline, and the data is still there to fix and
  resubmit.

### 13. Remaining UX debt

See every `Not implemented — backlog` item in §1–§15: full table system
(sort/resize/saved-views), mobile tab-bar navigation, seven-role
dashboards, full RTL bidi sweep, bespoke-form aria wiring and Escape
handling, dispatch fleet-utilization panel, icon-size scale, breadcrumbs,
full dark-mode surface-layering sweep, entity search in the command
palette (needs a backend endpoint).

### 14. Top 10 recommended future UX improvements

1. Retrofit `ConfirmDialog` onto every remaining bespoke destructive
   action (SalesOrders cancel, PurchaseOrders reject/cancel, etc.) — now
   mechanical since the component exists.
2. Full `ResourceListPage` table system: sort, column show/hide, saved
   views — the brief's §10/§11.
3. Seven-role home dashboards, now that the Action Center establishes the
   "what needs attention" data-fetching pattern to reuse per-role.
4. Mobile persistent tab-bar navigation.
5. A backend global-search endpoint, unlocking true entity search in the
   Command Palette.
6. Full bidi-isolation (`<bdi>`) sweep for every document code/number.
7. Bespoke-form 2-column layout + aria wiring (Quotations, SalesOrders,
   Payments, VendorBills, GoodsReceipts).
8. Dispatch board fleet-utilization strip and full resource panel.
9. Full dark-mode surface-layering sweep across every panel.
10. Breadcrumbs, once cross-module deep-linking (backend audit's own
    backlog item) gives them something meaningful to show.

### 15. Files/components changed

See the commit list in the final chat summary — `packages/ui/src/{dialog,
drawer,toast,confirm-dialog,skeleton}.tsx`, `packages/ui/src/button.tsx`
(destructive variant), `apps/web/src/index.css` (semantic tokens),
`apps/web/index.html` (FOUC fix), `apps/web/src/lib/statusRegistry.ts`,
`apps/web/src/lib/navConfig.ts` (quality group), `apps/web/src/
components/{Sidebar,ResourceListPage,StatusBadge,icons,CommandPalette,
PageHeader}.tsx`, `apps/web/src/routes/{ActionCenterPage,QCPage,
DispatchPage,PurchaseOrdersPage,VendorBillsPage,PostDatedChequesPage,
ClearanceQueuePage}.tsx`, `apps/web/src/main.tsx` (QueryClient
MutationCache), `docs/design-system.md` (new).

### 16. Manual QA checklist

See the checklist at the end of this session's chat summary — no browser
was available in this execution environment, so every visual claim above
needs a real-browser pass in English/Arabic × light/dark before shipping,
per this audit's own §Q-equivalent assumption below.

### 17. Screenshots

Not available — this execution environment has no browser/display to
capture them from (confirmed in the prior backend-focused audit's own
assumptions section). Noted rather than silently skipped.
