import { bigint, integer, numeric, pgEnum, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer } from "./customer";
import { deliveryOrder } from "./delivery";

/** See `packages/core`'s `invoiceStateMachine.ts` for the allowed-transition table. */
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "pending_clearance",
  "cleared",
  "issued",
  "partially_paid",
  "paid",
  "rejected",
]);

/** Concrete supply is taxable; transport/pumping is exempt (CLAUDE.md's money/tax conventions). */
export const invoiceLineTaxTreatment = pgEnum("invoice_line_tax_treatment", ["taxable", "exempt"]);

export const invoice = pgTable(
  "invoice",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    // Gapless per-branch-per-year numbering, "{BRANCH}-{YYMM}-{SEQ}",
    // allocated inside the same transaction as this row (see
    // invoiceNumberCounter below) — never a separately-editable field.
    invoiceNumber: varchar("invoice_number", { length: 40 }).notNull().unique(),
    status: invoiceStatus("status").notNull().default("draft"),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }).notNull().defaultNow(),
    // Self-reference cross-linking a combined+split pair (CLAUDE.md: "a
    // split pair ... generated atomically ... cross-referencing each
    // other"). Null for a combined invoice, which stands alone.
    relatedInvoiceId: uuid("related_invoice_id"),
    subtotalFils: bigint("subtotal_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Invoice = typeof invoice.$inferSelect;
export type NewInvoice = typeof invoice.$inferInsert;

/**
 * DOMAIN.md Invariant 1: "a delivery order can be invoiced once", enforced
 * by `UNIQUE(delivery_order_id, tax_treatment)` — not application logic
 * alone. A combined invoice's two lines (taxable + exempt) and a split
 * pair's two invoices (one taxable line each, one exempt line each) both
 * claim exactly one (deliveryOrderId, taxTreatment) pair each; a second
 * invoicing attempt against the same delivery order collides either way.
 * NULLs (a future non-delivery-order-based line) never collide in
 * Postgres, so this constraint only ever guards delivery-order billing.
 * There is currently only one billing path (via DeliveryOrder) — the
 * "sales-order-path vs delivery-order-path" cross-check DOMAIN.md
 * describes is structurally moot until a direct sales-order billing path
 * is ever built; not guessed at here.
 */
export const invoiceLine = pgTable(
  "invoice_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    deliveryOrderId: uuid("delivery_order_id").references(() => deliveryOrder.id),
    taxTreatment: invoiceLineTaxTreatment("tax_treatment").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    quantityM3: numeric("quantity_m3", { precision: 10, scale: 3 }),
    unitPriceFils: bigint("unit_price_fils", { mode: "bigint" }),
    netFils: bigint("net_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("invoice_line_delivery_order_tax_treatment_unique").on(t.deliveryOrderId, t.taxTreatment)],
).enableRLS();

export type InvoiceLine = typeof invoiceLine.$inferSelect;
export type NewInvoiceLine = typeof invoiceLine.$inferInsert;

/**
 * Atomic per-(branch, yearMonth, docType) counter for gapless document
 * numbering — `docType` keeps invoices, credit notes, and debit notes on
 * independent sequences (each getting its own display prefix) rather than
 * sharing one, which would make none of them actually gapless per their
 * own series. `nextSeq` is incremented via a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE SET next_seq = next_seq + 1
 * RETURNING next_seq` inside the document's own transaction — Postgres
 * serializes concurrent updates to the same row, so two simultaneous
 * requests in the same branch/month/docType never collide or skip a
 * number, without any application-level locking.
 */
export const invoiceNumberCounter = pgTable(
  "invoice_number_counter",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    docType: varchar("doc_type", { length: 20 }).notNull(),
    yearMonth: varchar("year_month", { length: 4 }).notNull(),
    nextSeq: integer("next_seq").notNull().default(0),
  },
  (t) => [
    tenantIsolationPolicy(),
    unique("invoice_number_counter_branch_doc_type_year_month_unique").on(t.branchId, t.docType, t.yearMonth),
  ],
).enableRLS();

export type InvoiceNumberCounter = typeof invoiceNumberCounter.$inferSelect;
export type NewInvoiceNumberCounter = typeof invoiceNumberCounter.$inferInsert;

/** References the original invoice (DOMAIN.md's Billing section). No independent lifecycle yet — Phase 8 owns applying these to balances. */
export const creditNote = pgTable(
  "credit_note",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    noteNumber: varchar("note_number", { length: 40 }).notNull().unique(),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type CreditNote = typeof creditNote.$inferSelect;
export type NewCreditNote = typeof creditNote.$inferInsert;

export const debitNote = pgTable(
  "debit_note",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    noteNumber: varchar("note_number", { length: 40 }).notNull().unique(),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type DebitNote = typeof debitNote.$inferSelect;
export type NewDebitNote = typeof debitNote.$inferInsert;
