import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";

/**
 * Single-tenant at go-live: exactly one row is seeded. Still a real table
 * (not a config constant) so multi-company is a data change later, not a
 * schema rewrite.
 */
export const company = pgTable("company", {
  id: idColumn(),
  name: varchar("name", { length: 200 }).notNull(),
  taxNumber: varchar("tax_number", { length: 32 }),
  // Phase 10's document-expiry alerts: how many days before a truck/driver
  // document's expiry it starts showing as a warning (never blocking —
  // only an already-expired document blocks dispatch).
  documentExpiryWarningDays: integer("document_expiry_warning_days").notNull().default(30),
  ...auditColumns(),
});

export type Company = typeof company.$inferSelect;
export type NewCompany = typeof company.$inferInsert;
