/**
 * Double-entry primitives (CLAUDE.md Hard Rule: "financial postings are
 * double-entry. Nothing is posted by mutating a balance column —
 * balances are derived from journal lines. A trial balance that doesn't
 * sum to zero fails a test."). These are the pure building blocks; the
 * actual trial balance/P&L/balance-sheet aggregation needs real journal
 * rows from Postgres, so it lives in apps/api/src/routes/gl.ts (same
 * split as Phase 8's creditExposure.ts).
 */
import { subFils, type Fils } from "./money";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface JournalLineInput {
  accountId: string;
  debitFils: bigint;
  creditFils: bigint;
}

/**
 * A balanced entry: every line is debit-only or credit-only (never both,
 * never neither), and total debits equal total credits. Throws rather
 * than returning a boolean — an unbalanced entry is a programming error
 * at the call site, not a request-validation failure a caller should
 * silently branch on.
 */
export function assertJournalEntryBalanced(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines");
  }
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const line of lines) {
    if (line.debitFils < 0n || line.creditFils < 0n) {
      throw new Error("Journal line amounts cannot be negative");
    }
    const hasDebit = line.debitFils > 0n;
    const hasCredit = line.creditFils > 0n;
    if (hasDebit === hasCredit) {
      throw new Error("Each journal line must be debit-only or credit-only, never both or neither");
    }
    totalDebit += line.debitFils;
    totalCredit += line.creditFils;
  }
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal entry does not balance: debit ${totalDebit} != credit ${totalCredit}`);
  }
}

/** Asset/expense accounts increase on the debit side; liability/equity/revenue increase on the credit side. */
export function normalBalanceSide(type: AccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

/**
 * An account's balance, signed positive when on its normal side — e.g. a
 * liability account with more credits than debits (the expected case)
 * returns a positive number; one that's gone debit-heavy (overpaid)
 * returns negative, which is exactly what a trial balance / balance sheet
 * needs to sum correctly across mixed account types.
 */
export function accountBalance(type: AccountType, totalDebitFils: Fils, totalCreditFils: Fils): Fils {
  return normalBalanceSide(type) === "debit" ? subFils(totalDebitFils, totalCreditFils) : subFils(totalCreditFils, totalDebitFils);
}
