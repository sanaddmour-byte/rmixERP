import { boolean, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";

/** Named `app_user`, not `user` — `user` is a reserved word in Postgres. */
export const appUser = pgTable(
  "app_user",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    // Nullable: company-wide roles (e.g. Company Manager) are not pinned to
    // one plant. Sales/collector/plant-scoped access is enforced via
    // userRole + future per-record scoping, not this column alone.
    branchId: uuid("branch_id").references(() => branch.id),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 200 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type AppUser = typeof appUser.$inferSelect;
export type NewAppUser = typeof appUser.$inferInsert;
