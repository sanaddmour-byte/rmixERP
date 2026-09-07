import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { appUser } from "./user";

/**
 * Company/branch-scoped notification log (DOMAIN.md's cross-cutting
 * `Notification` entity, first needed here for QC failure alerts).
 * Interim broadcast design: visible to anyone in the company/branch with
 * permission on the referenced module, not targeted to one user — Phase
 * 10 owns the real per-user inbox + typed deep-link resolver across all
 * modules; this is not a guess at that shape, just today's minimum.
 */
export const notification = pgTable(
  "notification",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    type: varchar("type", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    message: varchar("message", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    readBy: uuid("read_by").references(() => appUser.id),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
