import { integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

export const vendor = pgTable(
  "vendor",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    name: varchar("name", { length: 200 }).notNull(),
    taxNumber: varchar("tax_number", { length: 32 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    address: varchar("address", { length: 500 }),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Vendor = typeof vendor.$inferSelect;
export type NewVendor = typeof vendor.$inferInsert;
