import { bigint, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer } from "./customer";
import { invoice } from "./invoice";

/** DOMAIN.md's receipt numbering prefixes ("RCP-/TRF-/PDC-") key off this. */
export const collectionMethod = pgEnum("collection_method", ["cash", "bank_transfer", "post_dated_cheque"]);

/** See `packages/core`'s `pdcStateMachine.ts` for the allowed-transition table. */
export const pdcStatus = pgEnum("pdc_status", ["pending", "deposited", "cleared", "bounced", "cancelled"]);

/**
 * A receipt event. `method = "post_dated_cheque"` always has exactly one
 * corresponding `postDatedCheque` row (the cheque isn't actually money in
 * hand yet — see that table's own status lifecycle); `cash`/
 * `bank_transfer` are recognized as received immediately.
 */
export const collection = pgTable(
  "collection",
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
    method: collectionMethod("method").notNull(),
    // Gapless per-branch-per-year numbering, same {PREFIX}-{BRANCH}-{YYMM}-{SEQ}
    // scheme as invoice/credit-note/debit-note numbering (Phase 6),
    // reusing that same counter table with new docType values
    // ("RCP"/"TRF"/"PDC") rather than a second counter table.
    receiptNumber: varchar("receipt_number", { length: 40 }).notNull().unique(),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    reference: varchar("reference", { length: 200 }),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Collection = typeof collection.$inferSelect;
export type NewCollection = typeof collection.$inferInsert;

/**
 * How much of one collection was applied to one invoice. Never edited in
 * place once created — a bounced PDC or any other reversal voids the row
 * (`voidedAt`, the standard soft-delete column) rather than deleting or
 * mutating the amount, so the allocation history stays a real audit trail
 * (DOMAIN.md Invariant 7: invoice status is "derived from allocations,
 * never set manually" — that derivation always sums only non-voided
 * allocation rows).
 */
export const collectionAllocation = pgTable(
  "collection_allocation",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collection.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type CollectionAllocation = typeof collectionAllocation.$inferSelect;
export type NewCollectionAllocation = typeof collectionAllocation.$inferInsert;

/**
 * One row per post-dated cheque, 1:1 with the `collection` row that
 * recorded receiving it (`collectionId` unique). `dueDate` here is the
 * cheque's own maturity date — unrelated to `invoice.dueDate`.
 */
export const postDatedCheque = pgTable(
  "post_dated_cheque",
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
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collection.id)
      .unique(),
    bankName: varchar("bank_name", { length: 200 }).notNull(),
    chequeNumber: varchar("cheque_number", { length: 100 }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: pdcStatus("status").notNull().default("pending"),
    depositedAt: timestamp("deposited_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    bounceReason: varchar("bounce_reason", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PostDatedCheque = typeof postDatedCheque.$inferSelect;
export type NewPostDatedCheque = typeof postDatedCheque.$inferInsert;
