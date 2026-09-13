import { and, eq, isNull, sql } from "drizzle-orm";
import {
  clearanceIcvCounter,
  company,
  creditNote,
  customer,
  debitNote,
  invoice,
  invoiceLine,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import { assertInvoiceTransition, computeRetryDelayMs, type ClearanceOutcome, type ClearanceProvider } from "@rmixerp/core";
import { db } from "../db";
import { writeAudit } from "../audit";
import { buildUblInvoiceXml } from "./ubl";
import { toUblInvoiceInput } from "./jofotara/mapping";

/**
 * Two-phase submission, deliberately not one transaction spanning the
 * provider call: phase 1 (a short transaction) row-locks the document,
 * checks eligibility, and reserves the attempt (so a concurrent duplicate
 * submission sees the reservation and is rejected — DOMAIN.md's
 * "idempotent on our invoice ID"); the provider call itself then happens
 * with no transaction open at all (a real HTTP round-trip inside a held
 * row lock/transaction would be a lock-contention hazard under load, a
 * corner Phase 6's pure-DB invoice generation never had to cut); phase 2
 * (a second short transaction) persists whatever the provider returned.
 */

export type ReservationResult<TRow> =
  | { kind: "not_found" }
  | { kind: "not_eligible"; status: string; clearanceStatus: string }
  | { kind: "reserved"; row: TRow; icv: number; attempts: number };

async function allocateIcv(tx: Tx, companyId: string): Promise<number> {
  const [row] = await tx
    .insert(clearanceIcvCounter)
    .values({ companyId, nextIcv: 1 })
    .onConflictDoUpdate({
      target: clearanceIcvCounter.companyId,
      set: { nextIcv: sql`${clearanceIcvCounter.nextIcv} + 1` },
    })
    .returning();
  if (!row) throw new Error("clearance ICV counter upsert returned no row");
  return row.nextIcv;
}

type InvoiceRow = typeof invoice.$inferSelect;
type CreditNoteRow = typeof creditNote.$inferSelect;
type DebitNoteRow = typeof debitNote.$inferSelect;

function isEligible(status: { clearanceStatus: string; documentStatus?: string }, requiresDraftGate: boolean): boolean {
  if (status.clearanceStatus === "retrying") return true;
  if (status.clearanceStatus !== "pending") return false;
  // First-ever submission: invoices additionally require the DOMAIN.md
  // state machine's own draft gate; credit/debit notes have no
  // independent state machine (Phase 6), so `pending` alone is enough.
  return requiresDraftGate ? status.documentStatus === "draft" : true;
}

async function reserveInvoice(companyId: string, id: string): Promise<ReservationResult<InvoiceRow>> {
  return withTenant(db, companyId, async (tx) => {
    const [row] = await tx.select().from(invoice).where(and(eq(invoice.id, id), isNull(invoice.voidedAt))).for("update");
    if (!row) return { kind: "not_found" as const };
    if (!isEligible({ clearanceStatus: row.clearanceStatus, documentStatus: row.status }, true)) {
      return { kind: "not_eligible" as const, status: row.status, clearanceStatus: row.clearanceStatus };
    }
    // The ICV is a document's fixed identity, not a per-attempt counter — a
    // retry of the same document reuses its already-allocated ICV rather
    // than burning a new gapless number for the same fiscal document.
    const icv = row.clearanceIcv ?? (await allocateIcv(tx, companyId));
    const attempts = row.clearanceAttempts + 1;
    if (row.status === "draft") {
      assertInvoiceTransition(row.status, "pending_clearance");
      await tx.update(invoice).set({ status: "pending_clearance" }).where(eq(invoice.id, id));
    }
    await tx.update(invoice).set({ clearanceAttempts: attempts, clearanceIcv: icv }).where(eq(invoice.id, id));
    return { kind: "reserved" as const, row, icv, attempts };
  });
}

async function persistInvoiceOutcome(companyId: string, actorUserId: string | null, id: string, outcome: ClearanceOutcome, ublXml: string): Promise<void> {
  await withTenant(db, companyId, async (tx) => {
    const [before] = await tx.select().from(invoice).where(eq(invoice.id, id));
    if (!before) throw new Error("invoice disappeared between clearance reservation and persistence");
    if (outcome.kind === "cleared") {
      assertInvoiceTransition(before.status, "cleared");
      await tx
        .update(invoice)
        .set({
          status: "cleared",
          clearanceStatus: "cleared",
          clearanceQrPayload: outcome.qrPayload,
          clearanceProviderReference: outcome.providerReference,
          clearanceResponsePayload: outcome.responsePayload as object,
          clearanceSubmittedPayload: { ublXml },
          clearanceError: null,
          clearanceNextRetryAt: null,
        })
        .where(eq(invoice.id, id));
    } else if (outcome.kind === "rejected") {
      assertInvoiceTransition(before.status, "rejected");
      await tx
        .update(invoice)
        .set({
          status: "rejected",
          clearanceStatus: "rejected",
          clearanceResponsePayload: outcome.responsePayload as object,
          clearanceSubmittedPayload: { ublXml },
          clearanceError: outcome.reason,
          clearanceNextRetryAt: null,
        })
        .where(eq(invoice.id, id));
    } else {
      const delayMs = computeRetryDelayMs(before.clearanceAttempts);
      await tx
        .update(invoice)
        .set({
          clearanceStatus: "retrying",
          clearanceSubmittedPayload: { ublXml },
          clearanceError: outcome.reason,
          clearanceNextRetryAt: delayMs !== null ? new Date(Date.now() + delayMs) : null,
        })
        .where(eq(invoice.id, id));
    }
    const [after] = await tx.select().from(invoice).where(eq(invoice.id, id));
    await writeAudit(tx, {
      companyId,
      branchId: before.branchId,
      actorUserId,
      entityType: "invoice",
      entityId: id,
      action: `clearance:${outcome.kind}`,
      before,
      after,
    });
  });
}

export type SubmitOutcome = ReservationResult<unknown> | { kind: "ok" };

export async function submitInvoiceForClearance(
  provider: ClearanceProvider,
  companyId: string,
  actorUserId: string | null,
  invoiceId: string,
): Promise<SubmitOutcome> {
  const reserved = await reserveInvoice(companyId, invoiceId);
  if (reserved.kind !== "reserved") return reserved;

  const { row, icv } = reserved;
  const built = await withTenant(db, companyId, async (tx) => {
    const lines = await tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, invoiceId));
    const [companyRow] = await tx.select().from(company).where(eq(company.id, companyId));
    const [customerRow] = await tx.select().from(customer).where(eq(customer.id, row.customerId));
    if (!companyRow || !customerRow) throw new Error("invoice references a missing company/customer row");
    return { lines, companyRow, customerRow };
  });

  const ublInput = toUblInvoiceInput({
    id: row.id,
    documentNumber: row.invoiceNumber,
    documentType: "invoice",
    issuedAt: row.invoicedAt,
    icv,
    supplierName: built.companyRow.name,
    supplierTaxNumber: built.companyRow.taxNumber,
    customerName: built.customerRow.name,
    customerTaxNumber: built.customerRow.taxNumber,
    subtotalFils: row.subtotalFils,
    taxFils: row.taxFils,
    totalFils: row.totalFils,
    lines: built.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantityM3: l.quantityM3,
      unitPriceFils: l.unitPriceFils,
      netFils: l.netFils,
      taxRateBasisPoints: l.taxRateBasisPoints,
      taxFils: l.taxFils,
      totalFils: l.totalFils,
    })),
  });
  const ublXml = buildUblInvoiceXml(ublInput);

  const outcome = await provider.submit({ documentId: row.id, documentType: "invoice", icv, ublXml });
  await persistInvoiceOutcome(companyId, actorUserId, invoiceId, outcome, ublXml);
  return { kind: "ok" };
}

/** Shared by credit-note and debit-note submission — neither has its own line items or a state machine (Phase 6), so the UBL input is built from the note's own amount/tax/total. */
async function submitNoteForClearance(
  table: typeof creditNote | typeof debitNote,
  documentType: "credit_note" | "debit_note",
  provider: ClearanceProvider,
  companyId: string,
  actorUserId: string | null,
  noteId: string,
): Promise<SubmitOutcome> {
  const reserved = await withTenant(db, companyId, async (tx) => {
    const [row] = await tx.select().from(table).where(and(eq(table.id, noteId), isNull(table.voidedAt))).for("update");
    if (!row) return { kind: "not_found" as const };
    if (!isEligible({ clearanceStatus: row.clearanceStatus }, false)) {
      return { kind: "not_eligible" as const, status: "n/a", clearanceStatus: row.clearanceStatus };
    }
    const icv = row.clearanceIcv ?? (await allocateIcv(tx, companyId));
    const attempts = row.clearanceAttempts + 1;
    await tx.update(table).set({ clearanceAttempts: attempts, clearanceIcv: icv }).where(eq(table.id, noteId));
    const [invoiceRow] = await tx.select().from(invoice).where(eq(invoice.id, row.invoiceId));
    const [companyRow] = await tx.select().from(company).where(eq(company.id, companyId));
    if (!invoiceRow) throw new Error(`${documentType} references a missing invoice`);
    const [customerRow] = await tx.select().from(customer).where(eq(customer.id, invoiceRow.customerId));
    if (!companyRow || !customerRow) throw new Error(`${documentType} references a missing company/customer row`);
    return { kind: "reserved" as const, row: row as CreditNoteRow | DebitNoteRow, icv, attempts, companyRow, customerRow };
  });
  if (reserved.kind !== "reserved") return reserved;

  const { row, icv, companyRow, customerRow } = reserved;
  const ublInput = toUblInvoiceInput({
    id: row.id,
    documentNumber: row.noteNumber,
    documentType,
    issuedAt: row.createdAt,
    icv,
    supplierName: companyRow.name,
    supplierTaxNumber: companyRow.taxNumber,
    customerName: customerRow.name,
    customerTaxNumber: customerRow.taxNumber,
    subtotalFils: row.amountFils,
    taxFils: row.taxFils,
    totalFils: row.totalFils,
    lines: [
      {
        id: row.id,
        description: row.reason,
        quantityM3: null,
        unitPriceFils: null,
        netFils: row.amountFils,
        taxRateBasisPoints: 0,
        taxFils: row.taxFils,
        totalFils: row.totalFils,
      },
    ],
  });
  const ublXml = buildUblInvoiceXml(ublInput);

  const outcome = await provider.submit({ documentId: row.id, documentType, icv, ublXml });

  await withTenant(db, companyId, async (tx) => {
    const [before] = await tx.select().from(table).where(eq(table.id, noteId));
    if (!before) throw new Error(`${documentType} disappeared between clearance reservation and persistence`);
    if (outcome.kind === "cleared") {
      await tx
        .update(table)
        .set({
          clearanceStatus: "cleared",
          clearanceQrPayload: outcome.qrPayload,
          clearanceProviderReference: outcome.providerReference,
          clearanceResponsePayload: outcome.responsePayload as object,
          clearanceSubmittedPayload: { ublXml },
          clearanceError: null,
          clearanceNextRetryAt: null,
        })
        .where(eq(table.id, noteId));
    } else if (outcome.kind === "rejected") {
      await tx
        .update(table)
        .set({
          clearanceStatus: "rejected",
          clearanceResponsePayload: outcome.responsePayload as object,
          clearanceSubmittedPayload: { ublXml },
          clearanceError: outcome.reason,
          clearanceNextRetryAt: null,
        })
        .where(eq(table.id, noteId));
    } else {
      const delayMs = computeRetryDelayMs(before.clearanceAttempts);
      await tx
        .update(table)
        .set({
          clearanceStatus: "retrying",
          clearanceSubmittedPayload: { ublXml },
          clearanceError: outcome.reason,
          clearanceNextRetryAt: delayMs !== null ? new Date(Date.now() + delayMs) : null,
        })
        .where(eq(table.id, noteId));
    }
    const [after] = await tx.select().from(table).where(eq(table.id, noteId));
    await writeAudit(tx, {
      companyId,
      branchId: before.branchId,
      actorUserId,
      entityType: documentType,
      entityId: noteId,
      action: `clearance:${outcome.kind}`,
      before,
      after,
    });
  });

  return { kind: "ok" };
}

export function submitCreditNoteForClearance(provider: ClearanceProvider, companyId: string, actorUserId: string | null, id: string) {
  return submitNoteForClearance(creditNote, "credit_note", provider, companyId, actorUserId, id);
}

export function submitDebitNoteForClearance(provider: ClearanceProvider, companyId: string, actorUserId: string | null, id: string) {
  return submitNoteForClearance(debitNote, "debit_note", provider, companyId, actorUserId, id);
}
