import { integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, shortCode, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

/** A sellable concrete grade (C10-C50) or other product. Company-wide catalog. */
export const product = pgTable(
  "product",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    // Nullable: most products are available company-wide, not tied to one plant.
    branchId: uuid("branch_id").references(() => branch.id),
    name: varchar("name", { length: 100 }).notNull(),
    code: shortCode().notNull(),
    characteristicStrengthMpa: integer("characteristic_strength_mpa"),
    unit: varchar("unit", { length: 20 }).notNull().default("m3"),
    description: varchar("description", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
