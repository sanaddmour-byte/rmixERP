import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assertInvoiceTransition, fils, filsToJodString } from "@rmixerp/core";
import { creditNote, customer, debitNote, invoice, withTenant } from "@rmixerp/db";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { idempotent } from "../middleware/idempotency";
import { createClearanceProvider } from "../clearance/providerFactory";
import { submitCreditNoteForClearance, submitDebitNoteForClearance, submitInvoiceForClearance } from "../clearance/service";
import { creditNoteToApi, debitNoteToApi, loadInvoiceDetail } from "./invoices";
import { writeAudit } from "../audit";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { parsePagination } from "../lib/pagination";

export const clearanceRouter = Router();
const MODULE = "clearance";

// Single shared instance: MockClearanceProvider (default) or JoFotaraProvider
// when explicitly configured — see providerFactory.ts.
const provider = createClearanceProvider();

function notEligibleMessage(status: string, clearanceStatus: string): string {
  if (clearanceStatus === "cleared") return "This document has already cleared.";
  if (clearanceStatus === "rejected") {
    return "This document was rejected by the clearance provider. Correcting and resubmitting a rejected document is not supported yet.";
  }
  return `Not eligible for clearance submission (status=${status}, clearanceStatus=${clearanceStatus}).`;
}

clearanceRouter.post(
  "/invoices/:id/submit-for-clearance",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const id = paramId(req);
    const result = await submitInvoiceForClearance(provider, req.auth!.companyId, req.auth!.userId, id);
    if (result.kind === "not_found") {
      res.status(404).json(notFound("Invoice"));
      return;
    }
    if (result.kind === "not_eligible") {
      res.status(400).json(validationError({ status: notEligibleMessage(result.status, result.clearanceStatus) }));
      return;
    }
    const body = await withTenant(db, req.auth!.companyId, (tx) => loadInvoiceDetail(tx, id));
    res.status(200).json(body!);
  },
);

clearanceRouter.post("/invoices/:id/issue", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [before] = await tx.select().from(invoice).where(and(eq(invoice.id, id), isNull(invoice.voidedAt)));
    if (!before) return { kind: "not_found" as const };
    // Clearance-before-issue, enforced explicitly here (not just relying on
    // the state machine's generic error) so the 400 names the real business
    // rule — the state machine only allows this edge from `cleared` anyway,
    // this is the "at the service layer" half of CLAUDE.md's requirement.
    if (before.status !== "cleared") {
      return { kind: "not_cleared" as const, status: before.status };
    }
    assertInvoiceTransition(before.status, "issued");
    // Set once, here, from the customer's payment terms as of issue time
    // (packages/db's invoice.dueDate doc comment) — never recomputed
    // later even if the customer's terms subsequently change.
    const [custRow] = await tx.select().from(customer).where(eq(customer.id, before.customerId));
    if (!custRow) throw new Error("invoice references a missing customer");
    const dueDate = new Date(before.invoicedAt.getTime() + custRow.paymentTermsDays * 24 * 60 * 60 * 1000);
    const [after] = await tx.update(invoice).set({ status: "issued", dueDate }).where(eq(invoice.id, id)).returning();
    if (!after) throw new Error("invoice update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: before.branchId,
      actorUserId: req.auth!.userId,
      entityType: "invoice",
      entityId: id,
      action: "transition:issued",
      before,
      after,
    });
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Invoice"));
    return;
  }
  if (result.kind === "not_cleared") {
    res.status(400).json(validationError({ status: `Invoice must be cleared before it can be issued (current status: ${result.status}).` }));
    return;
  }
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadInvoiceDetail(tx, id));
  res.status(200).json(body!);
});

clearanceRouter.post(
  "/credit-notes/:id/submit-for-clearance",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const id = paramId(req);
    const result = await submitCreditNoteForClearance(provider, req.auth!.companyId, req.auth!.userId, id);
    if (result.kind === "not_found") {
      res.status(404).json(notFound("Credit note"));
      return;
    }
    if (result.kind === "not_eligible") {
      res.status(400).json(validationError({ status: notEligibleMessage(result.status, result.clearanceStatus) }));
      return;
    }
    const [row] = await withTenant(db, req.auth!.companyId, (tx) => tx.select().from(creditNote).where(eq(creditNote.id, id)));
    res.status(200).json(creditNoteToApi(row!));
  },
);

clearanceRouter.post(
  "/debit-notes/:id/submit-for-clearance",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const id = paramId(req);
    const result = await submitDebitNoteForClearance(provider, req.auth!.companyId, req.auth!.userId, id);
    if (result.kind === "not_found") {
      res.status(404).json(notFound("Debit note"));
      return;
    }
    if (result.kind === "not_eligible") {
      res.status(400).json(validationError({ status: notEligibleMessage(result.status, result.clearanceStatus) }));
      return;
    }
    const [row] = await withTenant(db, req.auth!.companyId, (tx) => tx.select().from(debitNote).where(eq(debitNote.id, id)));
    res.status(200).json(debitNoteToApi(row!));
  },
);

type QueueRow = {
  id: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  documentNumber: string;
  branchId: string;
  totalFils: string;
  clearanceStatus: "pending" | "cleared" | "rejected" | "retrying";
  clearanceIcv: number | null;
  clearanceQrPayload: string | null;
  clearanceProviderReference: string | null;
  clearanceAttempts: number;
  clearanceNextRetryAt: Date | null;
  clearanceError: string | null;
  createdAt: Date;
};

clearanceRouter.get("/clearance-queue", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const documentType = queryString(req, "documentType");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    // A UNION across the three document tables — no shared base table to
    // query generically (each carries different domain columns), and this
    // is the one place that actually needs all three side by side.
    const unioned = sql<QueueRow>`
      (
        select ${invoice.id} as id, 'invoice' as "documentType", ${invoice.invoiceNumber} as "documentNumber",
               ${invoice.branchId} as "branchId", ${invoice.totalFils}::text as "totalFils",
               ${invoice.clearanceStatus} as "clearanceStatus", ${invoice.clearanceIcv} as "clearanceIcv",
               ${invoice.clearanceQrPayload} as "clearanceQrPayload", ${invoice.clearanceProviderReference} as "clearanceProviderReference",
               ${invoice.clearanceAttempts} as "clearanceAttempts", ${invoice.clearanceNextRetryAt} as "clearanceNextRetryAt",
               ${invoice.clearanceError} as "clearanceError", ${invoice.createdAt} as "createdAt"
        from ${invoice}
        where ${invoice.voidedAt} is null
      )
      union all
      (
        select ${creditNote.id} as id, 'credit_note' as "documentType", ${creditNote.noteNumber} as "documentNumber",
               ${creditNote.branchId} as "branchId", ${creditNote.totalFils}::text as "totalFils",
               ${creditNote.clearanceStatus} as "clearanceStatus", ${creditNote.clearanceIcv} as "clearanceIcv",
               ${creditNote.clearanceQrPayload} as "clearanceQrPayload", ${creditNote.clearanceProviderReference} as "clearanceProviderReference",
               ${creditNote.clearanceAttempts} as "clearanceAttempts", ${creditNote.clearanceNextRetryAt} as "clearanceNextRetryAt",
               ${creditNote.clearanceError} as "clearanceError", ${creditNote.createdAt} as "createdAt"
        from ${creditNote}
        where ${creditNote.voidedAt} is null
      )
      union all
      (
        select ${debitNote.id} as id, 'debit_note' as "documentType", ${debitNote.noteNumber} as "documentNumber",
               ${debitNote.branchId} as "branchId", ${debitNote.totalFils}::text as "totalFils",
               ${debitNote.clearanceStatus} as "clearanceStatus", ${debitNote.clearanceIcv} as "clearanceIcv",
               ${debitNote.clearanceQrPayload} as "clearanceQrPayload", ${debitNote.clearanceProviderReference} as "clearanceProviderReference",
               ${debitNote.clearanceAttempts} as "clearanceAttempts", ${debitNote.clearanceNextRetryAt} as "clearanceNextRetryAt",
               ${debitNote.clearanceError} as "clearanceError", ${debitNote.createdAt} as "createdAt"
        from ${debitNote}
        where ${debitNote.voidedAt} is null
      )
    `;
    const filtered = sql<QueueRow>`
      select * from (${unioned}) as q
      where 1=1
      ${status ? sql`and q."clearanceStatus" = ${status}` : sql``}
      ${documentType ? sql`and q."documentType" = ${documentType}` : sql``}
      order by q."createdAt" desc
      limit ${pagination.limit} offset ${pagination.offset}
    `;
    const countQuery = sql<{ count: number }>`
      select count(*)::int as count from (${unioned}) as q
      where 1=1
      ${status ? sql`and q."clearanceStatus" = ${status}` : sql``}
      ${documentType ? sql`and q."documentType" = ${documentType}` : sql``}
    `;
    const rows = await tx.execute<QueueRow>(filtered);
    const countRows = await tx.execute<{ count: number }>(countQuery);
    return { items: rows.rows, total: countRows.rows[0]?.count ?? 0 };
  });

  res.status(200).json({
    items: items.map((row) => ({
      id: row.id,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      branchId: row.branchId,
      totalJod: filsToJodString(fils(BigInt(row.totalFils))),
      clearanceStatus: row.clearanceStatus,
      clearanceIcv: row.clearanceIcv,
      clearanceQrPayload: row.clearanceQrPayload,
      clearanceProviderReference: row.clearanceProviderReference,
      clearanceAttempts: row.clearanceAttempts,
      clearanceNextRetryAt: row.clearanceNextRetryAt ? new Date(row.clearanceNextRetryAt).toISOString() : null,
      clearanceError: row.clearanceError,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });
});
