import { auditLog } from "@rmixerp/db";
import type { Tx } from "./types";

export interface AuditEntry {
  companyId: string;
  branchId?: string | null;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * `before`/`after` are raw Drizzle rows, which can carry `bigint` columns
 * (money in fils) — plain `JSON.stringify` (what the jsonb column driver
 * uses) throws on those, so every bigint is stringified first. Dates are
 * also normalized to ISO strings for a stable, human-readable audit trail.
 */
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}

/**
 * Writes one immutable audit_log row. CLAUDE.md Hard Rule: every mutation
 * touching money, stock, credit, or clearance must call this in the same
 * transaction as the mutation itself, so the audit row can never exist
 * without the change it describes (or vice versa).
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    companyId: entry.companyId,
    branchId: entry.branchId ?? null,
    actorUserId: entry.actorUserId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before === undefined ? null : toJsonSafe(entry.before),
    after: entry.after === undefined ? null : toJsonSafe(entry.after),
    reason: entry.reason ?? null,
  });
}
