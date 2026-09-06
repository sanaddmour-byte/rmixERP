import { jsonb, pgPolicy, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { idColumn } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { appUser } from "./user";
import { appRole } from "./roles";

/**
 * Immutable log of every mutation touching money, stock, credit, or
 * clearance (and RBAC/tenancy-relevant changes). Append-only: no
 * updated_at/voided_at, and application code must never UPDATE or DELETE
 * a row here — the RLS policy below only grants SELECT and INSERT to the
 * app role, so an UPDATE/DELETE from that role is rejected by the
 * database even if application code attempted one.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id").references(() => branch.id),
    actorUserId: uuid("actor_user_id").references(() => appUser.id),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy("tenant_isolation_select", {
      for: "select",
      to: appRole,
      using: sql`company_id = current_setting('app.current_company_id', true)::uuid`,
    }),
    pgPolicy("tenant_isolation_insert", {
      for: "insert",
      to: appRole,
      withCheck: sql`company_id = current_setting('app.current_company_id', true)::uuid`,
    }),
  ],
).enableRLS();

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
