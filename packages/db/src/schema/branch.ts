import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, shortCode, tenantIsolationPolicy } from "./columns";
import { company } from "./company";

/** A batch plant. 11 seeded at go-live. */
export const branch = pgTable(
  "branch",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    name: varchar("name", { length: 200 }).notNull(),
    code: shortCode().notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Branch = typeof branch.$inferSelect;
export type NewBranch = typeof branch.$inferInsert;
