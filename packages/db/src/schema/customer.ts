import { bigint, integer, pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

export const customerType = pgEnum("customer_type", ["individual", "company"]);
export const creditPolicy = pgEnum("credit_policy", ["none", "warning", "block"]);

export const customer = pgTable(
  "customer",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    // Nullable: a customer can order from multiple plants. Set when there is
    // a clear home/primary branch.
    branchId: uuid("branch_id").references(() => branch.id),
    name: varchar("name", { length: 200 }).notNull(),
    customerType: customerType("customer_type").notNull().default("company"),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    taxNumber: varchar("tax_number", { length: 32 }),
    nationalId: varchar("national_id", { length: 32 }),
    address: varchar("address", { length: 500 }),
    creditLimitFils: bigint("credit_limit_fils", { mode: "bigint" }).notNull().default(sql`0`),
    creditPolicy: creditPolicy("credit_policy_type").notNull().default("none"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Customer = typeof customer.$inferSelect;
export type NewCustomer = typeof customer.$inferInsert;
