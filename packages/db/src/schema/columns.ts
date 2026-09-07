import { pgPolicy, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appRole } from "./roles";

/** Every business table gets a randomly-generated UUID primary key. */
export function idColumn() {
  return uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
}

/**
 * Standard audit/tenancy columns required by CLAUDE.md's Hard Rules on
 * every business table: company_id, branch_id, created_at, updated_at,
 * created_by, and soft-delete voided_at. `companyId`/`branchId` are
 * declared per-table (so each can set its own FK target); this only
 * covers the columns that are identical everywhere.
 */
export function auditColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  };
}

export function shortCode() {
  return varchar("code", { length: 32 });
}

/**
 * The single tenancy guard (CLAUDE.md Hard Rules): a Postgres row-level
 * security policy, not an application-layer filter. Attach to every
 * company-scoped table via its `extraConfig` callback and call
 * `.enableRLS()` on the table. A route cannot "forget" to scope a query —
 * the database itself refuses to return or write rows outside the
 * connection's current company, as long as it connects as `appRole` (see
 * roles.ts) and the request handler has called `withTenant` (tenancy.ts)
 * to set `app.current_company_id` for the transaction.
 */
export function tenantIsolationPolicy() {
  return pgPolicy("tenant_isolation", {
    for: "all",
    to: appRole,
    using: sql`company_id = current_setting('app.current_company_id', true)::uuid`,
    withCheck: sql`company_id = current_setting('app.current_company_id', true)::uuid`,
  });
}
