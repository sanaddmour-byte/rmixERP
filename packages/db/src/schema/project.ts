import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer } from "./customer";

/** A customer's job site — the finest tier in price resolution. */
export const project = pgTable(
  "project",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    name: varchar("name", { length: 200 }).notNull(),
    address: varchar("address", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
