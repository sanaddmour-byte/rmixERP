import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { appUser } from "./user";

/** Mirrors `packages/core`'s `NOTIFICATION_TYPES` — kept in lockstep by hand since drizzle-kit needs a literal list, not an import. */
export const notificationType = pgEnum("notification_type", ["qc_cube_test_failed", "purchase_request_submitted", "purchase_order_submitted"]);

/**
 * Company/branch-scoped notification log (DOMAIN.md's cross-cutting
 * `Notification` entity). `userId` (Phase 10) is real per-user targeting
 * for a future individually-assigned notification — every current
 * producer is role-based (anyone who can act on the thing, not one named
 * person) and leaves it null, so `GET /notifications` filters by the
 * viewer's own permission for the notification's `type`
 * (`packages/core`'s `NOTIFICATION_TYPE_REQUIRED_PERMISSION`) rather than
 * by identity — that's what "real per-user inbox" means for a role-based
 * permission system, not a guess at individual assignment this app has no
 * concept of yet.
 */
export const notification = pgTable(
  "notification",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    userId: uuid("user_id").references(() => appUser.id),
    type: notificationType("type").notNull(),
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
