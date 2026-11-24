import type { Tx } from "@rmixerp/db";
import { WELL_KNOWN_ACCOUNT_CODES, ZERO_FILS, type Fils } from "@rmixerp/core";
import { findWellKnownAccount, postJournalEntry } from "./glPosting";

/**
 * The receivables-side posting recipes, factored out so the live
 * call sites (invoice issue, note clearance, collection creation, PDC
 * clear/bounce/cancel) and the `/receivables/reconcile-gl-postings`
 * backfill route post byte-for-byte the same journal lines for the same
 * document — one recipe per document type, never duplicated. `entryDate`
 * is passed in rather than defaulted to "now" so a backfill can date the
 * entry to the document's own historical effective date instead of the
 * day the backfill happened to run.
 */

/** Revenue recognition at invoice issue: Dr AR / Cr Revenue (+ Cr Tax Output, if any). */
export async function postInvoiceIssueJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  invoiceId: string,
  invoiceNumber: string,
  subtotalFils: Fils,
  taxFils: Fils,
  totalFils: Fils,
): Promise<string> {
  const arAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.accountsReceivable);
  const revenueAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.revenue);
  const taxOutputAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.taxOutput);
  const journalLines = [
    { accountId: arAccountId, debitFils: totalFils, creditFils: ZERO_FILS },
    { accountId: revenueAccountId, debitFils: ZERO_FILS, creditFils: subtotalFils },
    ...(taxFils > ZERO_FILS ? [{ accountId: taxOutputAccountId, debitFils: ZERO_FILS, creditFils: taxFils }] : []),
  ];
  return postJournalEntry(tx, companyId, branchId, entryDate, `Invoice ${invoiceNumber} issued`, "invoice", invoiceId, journalLines);
}

/** A credit note reverses revenue/tax and reduces AR; a debit note mirrors an invoice. */
export async function postNoteClearanceJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  documentType: "credit_note" | "debit_note",
  noteId: string,
  noteNumber: string,
  amountFils: Fils,
  taxFils: Fils,
  totalFils: Fils,
): Promise<string> {
  const arAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.accountsReceivable);
  const revenueAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.revenue);
  const taxOutputAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.taxOutput);
  const hasTax = taxFils > ZERO_FILS;
  const journalLines =
    documentType === "credit_note"
      ? [
          { accountId: revenueAccountId, debitFils: amountFils, creditFils: ZERO_FILS },
          ...(hasTax ? [{ accountId: taxOutputAccountId, debitFils: taxFils, creditFils: ZERO_FILS }] : []),
          { accountId: arAccountId, debitFils: ZERO_FILS, creditFils: totalFils },
        ]
      : [
          { accountId: arAccountId, debitFils: totalFils, creditFils: ZERO_FILS },
          { accountId: revenueAccountId, debitFils: ZERO_FILS, creditFils: amountFils },
          ...(hasTax ? [{ accountId: taxOutputAccountId, debitFils: ZERO_FILS, creditFils: taxFils }] : []),
        ];
  return postJournalEntry(
    tx,
    companyId,
    branchId,
    entryDate,
    `${documentType === "credit_note" ? "Credit" : "Debit"} note ${noteNumber} cleared`,
    documentType,
    noteId,
    journalLines,
  );
}

/** A collection's allocation applies immediately at creation (Phase 8): Dr Cash-or-PdcInHand / Cr AR. */
export async function postCollectionJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  collectionId: string,
  receiptNumber: string,
  method: "cash" | "bank_transfer" | "post_dated_cheque",
  amountFils: Fils,
): Promise<string> {
  const debitAccountCode = method === "post_dated_cheque" ? WELL_KNOWN_ACCOUNT_CODES.postDatedChequesInHand : WELL_KNOWN_ACCOUNT_CODES.cash;
  const debitAccountId = await findWellKnownAccount(tx, companyId, debitAccountCode);
  const arAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.accountsReceivable);
  return postJournalEntry(tx, companyId, branchId, entryDate, `Collection ${receiptNumber} received`, "collection", collectionId, [
    { accountId: debitAccountId, debitFils: amountFils, creditFils: ZERO_FILS },
    { accountId: arAccountId, debitFils: ZERO_FILS, creditFils: amountFils },
  ]);
}

/** PDC-in-Hand -> Cash reclassification on clear. */
export async function postPdcClearJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  pdcId: string,
  chequeNumber: string,
  amountFils: Fils,
): Promise<string> {
  const pdcAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.postDatedChequesInHand);
  const cashAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.cash);
  return postJournalEntry(tx, companyId, branchId, entryDate, `PDC ${chequeNumber} cleared`, "post_dated_cheque_clear", pdcId, [
    { accountId: cashAccountId, debitFils: amountFils, creditFils: ZERO_FILS },
    { accountId: pdcAccountId, debitFils: ZERO_FILS, creditFils: amountFils },
  ]);
}

/** Bounced or cancelled: reverse PDC-in-Hand back to AR, exactly mirroring the application-layer allocation unwind. */
export async function postPdcReversalJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  pdcId: string,
  chequeNumber: string,
  amountFils: Fils,
): Promise<string> {
  const pdcAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.postDatedChequesInHand);
  const arAccountId = await findWellKnownAccount(tx, companyId, WELL_KNOWN_ACCOUNT_CODES.accountsReceivable);
  return postJournalEntry(tx, companyId, branchId, entryDate, `PDC ${chequeNumber} reversed`, "post_dated_cheque_reversal", pdcId, [
    { accountId: arAccountId, debitFils: amountFils, creditFils: ZERO_FILS },
    { accountId: pdcAccountId, debitFils: ZERO_FILS, creditFils: amountFils },
  ]);
}
