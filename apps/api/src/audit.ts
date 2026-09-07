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
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
