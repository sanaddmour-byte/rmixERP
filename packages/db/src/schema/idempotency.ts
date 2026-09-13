import { integer, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";

/**
 * Backs the `Idempotency-Key` header dedup CLAUDE.md's Hard Rules require
 * on every document-creating POST — introduced in Phase 6 (which needs it
 * for exactly-once invoice generation) and retrocompatible with any
 * earlier route that starts sending the header. See
 * `apps/api/src/middleware/idempotency.ts`. Retrofitting this onto every
 * pre-existing Phase 1-5 POST route is tracked as follow-up work in
 * `docs/PLAN.md`, not silently skipped.
 */
export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    key: varchar("key", { length: 255 }).notNull(),
    route: varchar("route", { length: 255 }).notNull(),
    // sha256 of method+path+body — a key reused against a different
    // request is a client error, not a legitimate retry.
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    // Null while the original request is still in flight.
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy(), unique("idempotency_key_company_key_unique").on(t.companyId, t.key)],
).enableRLS();

export type IdempotencyKeyRow = typeof idempotencyKey.$inferSelect;
export type NewIdempotencyKeyRow = typeof idempotencyKey.$inferInsert;
