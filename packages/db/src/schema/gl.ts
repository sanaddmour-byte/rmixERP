import { bigint, pgEnum, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

/** See `packages/core`'s `journalEntry.ts` for normal-balance-side rules. */
export const accountType = pgEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]);

/** Chart of accounts — a tree via `parentAccountId`, company-wide (not branch-scoped; branch-level analysis goes through `costCenter` instead). */
export const account = pgTable(
  "account",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    type: accountType("type").notNull(),
    parentAccountId: uuid("parent_account_id").references((): AnyPgColumn => account.id),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("account_company_code_unique").on(t.companyId, t.code)],
).enableRLS();

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export const costCenter = pgTable(
  "cost_center",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type CostCenter = typeof costCenter.$inferSelect;
export type NewCostCenter = typeof costCenter.$inferInsert;

/**
 * A posting event — never edited once created (there is no update route);
 * a mistaken posting gets a reversing entry, the standard accounting
 * practice, rather than a mutated/deleted row (CLAUDE.md Hard Rule: a
 * balance column is never updated in place, and nothing here is one —
 * every balance is `sum(journalLine.debitFils - creditFils)` computed on
 * demand by `apps/api/src/lib/glReports.ts`). `sourceDocumentType`/
 * `sourceDocumentId` trace a posting back to the vendor bill or payment
 * that caused it, the same audit-trail shape as every other
 * money-touching mutation's `audit_log` row.
 */
export const journalEntry = pgTable(
  "journal_entry",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
    description: varchar("description", { length: 500 }).notNull(),
    sourceDocumentType: varchar("source_document_type", { length: 40 }).notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type JournalEntry = typeof journalEntry.$inferSelect;
export type NewJournalEntry = typeof journalEntry.$inferInsert;

/**
 * One leg of a double-entry posting — `debitFils`/`creditFils` are never
 * both nonzero on the same row (`packages/core`'s `assertJournalEntryBalanced`
 * enforces this, and every entry's lines, before insert).
 */
export const journalLine = pgTable(
  "journal_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntry.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    costCenterId: uuid("cost_center_id").references(() => costCenter.id),
    debitFils: bigint("debit_fils", { mode: "bigint" }).notNull().default(sql`0`),
    creditFils: bigint("credit_fils", { mode: "bigint" }).notNull().default(sql`0`),
    description: varchar("description", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type JournalLine = typeof journalLine.$inferSelect;
export type NewJournalLine = typeof journalLine.$inferInsert;

export const accountingPeriodStatus = pgEnum("accounting_period_status", ["open", "closed"]);

/**
 * One row per company per closed calendar month — open periods have no
 * row at all (an absent row means "open"), so closing is the explicit,
 * auditable act and nothing has to be pre-created for every future month.
 * `apps/api/src/lib/glPosting.ts`'s `postJournalEntry` checks this before
 * every posting, keyed by the entry's own `entryDate`, not "today" — a
 * backdated posting into an already-closed month is rejected the same as
 * a forward one into a not-yet-closed future month is allowed.
 */
export const accountingPeriod = pgTable(
  "accounting_period",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    /** "YYYY-MM", matching invoice_number_counter's yearMonth convention. */
    yearMonth: varchar("year_month", { length: 7 }).notNull(),
    status: accountingPeriodStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by"),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    reopenedBy: uuid("reopened_by"),
    reopenReason: varchar("reopen_reason", { length: 500 }),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("accounting_period_company_year_month_unique").on(t.companyId, t.yearMonth)],
).enableRLS();

export type AccountingPeriod = typeof accountingPeriod.$inferSelect;
export type NewAccountingPeriod = typeof accountingPeriod.$inferInsert;
