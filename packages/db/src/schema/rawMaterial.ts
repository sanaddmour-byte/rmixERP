import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, shortCode, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

/** Cement, sand, gravel, water, admixtures, etc. Company-wide catalog. */
export const rawMaterial = pgTable(
  "raw_material",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    name: varchar("name", { length: 100 }).notNull(),
    code: shortCode().notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    category: varchar("category", { length: 100 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type RawMaterial = typeof rawMaterial.$inferSelect;
export type NewRawMaterial = typeof rawMaterial.$inferInsert;
