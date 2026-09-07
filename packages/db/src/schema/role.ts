import { pgTable, primaryKey, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { appUser } from "./user";

export const role = pgTable(
  "role",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    name: varchar("name", { length: 100 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Role = typeof role.$inferSelect;

/**
 * System-wide permission catalog (module × action). Not company-scoped —
 * it is a fixed application-defined list, not tenant data, so it does not
 * carry the standard business-table audit/tenancy columns or RLS.
 */
export const permission = pgTable(
  "permission",
  {
    id: idColumn(),
    module: varchar("module", { length: 100 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("permission_module_action_unique").on(t.module, t.action)],
);

export type Permission = typeof permission.$inferSelect;

/**
 * `companyId` here is denormalized from `role.companyId` (not enforced by
 * a DB constraint yet — single company at go-live makes that redundant;
 * revisit with a trigger or generated column if/when multi-company
 * ships) purely so RLS can apply directly to this table too, rather than
 * relying on every caller remembering to join through `role`.
 */
export const rolePermission = pgTable(
  "role_permission",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] }), tenantIsolationPolicy()],
).enableRLS();

/** See `rolePermission` note on the denormalized `companyId`. */
export const userRole = pgTable(
  "user_role",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), tenantIsolationPolicy()],
).enableRLS();
