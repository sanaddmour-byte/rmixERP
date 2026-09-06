import cron from "node-cron";
import { and, eq, isNull, lte } from "drizzle-orm";
import { creditNote, debitNote, invoice, withTenant } from "@rmixerp/db";
import { db } from "../db";
import { config } from "../config";
import { logger } from "../logger";
import { createClearanceProvider } from "./providerFactory";
import { submitCreditNoteForClearance, submitDebitNoteForClearance, submitInvoiceForClearance } from "./service";

const provider = createClearanceProvider();

/**
 * Bounded exponential-backoff retry for transport failures only (CLAUDE.md/
 * PLAN.md) — a business rejection (`clearanceStatus = "rejected"`) is
 * terminal and never picked up here; only `retrying` rows whose
 * `clearanceNextRetryAt` has passed are due. `submit*ForClearance` itself
 * re-derives the next backoff delay (`packages/core`'s
 * `computeRetryDelayMs`) from the attempt count, so once
 * `MAX_CLEARANCE_ATTEMPTS` is reached `clearanceNextRetryAt` is left
 * `null` and the row simply stops being selected here — it still shows up
 * on the clearance queue screen for a human to retry manually.
 */
async function retryDueClearance(): Promise<void> {
  const now = new Date();
  const [dueInvoices, dueCreditNotes, dueDebitNotes] = await withTenant(db, config.companyId, async (tx) => {
    const invoices = await tx
      .select({ id: invoice.id })
      .from(invoice)
      .where(and(eq(invoice.clearanceStatus, "retrying"), lte(invoice.clearanceNextRetryAt, now), isNull(invoice.voidedAt)));
    const credits = await tx
      .select({ id: creditNote.id })
      .from(creditNote)
      .where(and(eq(creditNote.clearanceStatus, "retrying"), lte(creditNote.clearanceNextRetryAt, now), isNull(creditNote.voidedAt)));
    const debits = await tx
      .select({ id: debitNote.id })
      .from(debitNote)
      .where(and(eq(debitNote.clearanceStatus, "retrying"), lte(debitNote.clearanceNextRetryAt, now), isNull(debitNote.voidedAt)));
    return [invoices, credits, debits];
  });

  for (const { id } of dueInvoices) {
    try {
      await submitInvoiceForClearance(provider, config.companyId, null, id);
    } catch (err: unknown) {
      logger.error({ err, invoiceId: id }, "clearance retry cron: invoice submission failed");
    }
  }
  for (const { id } of dueCreditNotes) {
    try {
      await submitCreditNoteForClearance(provider, config.companyId, null, id);
    } catch (err: unknown) {
      logger.error({ err, creditNoteId: id }, "clearance retry cron: credit note submission failed");
    }
  }
  for (const { id } of dueDebitNotes) {
    try {
      await submitDebitNoteForClearance(provider, config.companyId, null, id);
    } catch (err: unknown) {
      logger.error({ err, debitNoteId: id }, "clearance retry cron: debit note submission failed");
    }
  }
}

/** Called once at API boot (see index.ts). Every minute is frequent enough relative to the 30s-30min backoff window without hammering the provider. */
export function startClearanceRetryCron(): void {
  cron.schedule("* * * * *", () => {
    retryDueClearance().catch((err: unknown) => {
      logger.error({ err }, "clearance retry cron: unexpected failure");
    });
  });
}
