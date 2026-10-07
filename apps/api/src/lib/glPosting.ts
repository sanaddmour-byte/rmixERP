import { and, eq } from "drizzle-orm";
import { account, accountingPeriod, journalEntry, journalLine, type Tx } from "@rmixerp/db";
import { assertJournalEntryBalanced, type JournalLineInput, type WELL_KNOWN_ACCOUNT_CODES } from "@rmixerp/core";

/**
 * Finds a seeded well-known account (`packages/core`'s `DEFAULT_ACCOUNTS`)
 * by code. Throws rather than silently skipping the posting if a company
 * somehow lacks one — that would be a setup bug, not a normal 404.
 */
export async function findWellKnownAccount(
  tx: Tx,
  companyId: string,
  code: (typeof WELL_KNOWN_ACCOUNT_CODES)[keyof typeof WELL_KNOWN_ACCOUNT_CODES],
): Promise<string> {
  const [row] = await tx.select().from(account).where(and(eq(account.companyId, companyId), eq(account.code, code)));
  if (!row) throw new Error(`Missing well-known account ${code} for company ${companyId} — re-run the seed script`);
  return row.id;
}

function yearMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * An absent accounting_period row means "open" — only an explicit
 * 'closed' row blocks posting. See packages/db/src/schema/gl.ts's
 * accountingPeriod docstring for why closing is opt-in per month rather
 * than requiring every month to be pre-created.
 */
export async function isPeriodOpen(tx: Tx, companyId: string, date: Date): Promise<boolean> {
  const [row] = await tx
    .select({ status: accountingPeriod.status })
    .from(accountingPeriod)
    .where(and(eq(accountingPeriod.companyId, companyId), eq(accountingPeriod.yearMonth, yearMonthOf(date))));
  return row?.status !== "closed";
}

export type PostJournalEntryResult = { ok: true; id: string } | { ok: false; reason: "period_closed" };

/**
 * Inserts one balanced journal entry with its lines in the caller's
 * transaction — CLAUDE.md's Hard Rule: financial postings are
 * double-entry, and a balance is always derived from journal lines, never
 * written directly. Refuses to post into a closed accounting period
 * (keyed by `entryDate`, not "today") — callers must check `ok` and turn
 * a `period_closed` result into their own route's 400/409, not let it
 * surface as an uncaught 500.
 */
export async function postJournalEntry(
  tx: Tx,
  companyId: string,
  branchId: string,
  entryDate: Date,
  description: string,
  sourceDocumentType: string,
  sourceDocumentId: string,
  lines: JournalLineInput[],
): Promise<PostJournalEntryResult> {
  assertJournalEntryBalanced(lines);
  if (!(await isPeriodOpen(tx, companyId, entryDate))) {
    return { ok: false, reason: "period_closed" };
  }
  const [entry] = await tx
    .insert(journalEntry)
    .values({ companyId, branchId, entryDate, description, sourceDocumentType, sourceDocumentId })
    .returning();
  if (!entry) throw new Error("journal entry insert returned no row");
  await tx.insert(journalLine).values(
    lines.map((l) => ({
      companyId,
      journalEntryId: entry.id,
      accountId: l.accountId,
      debitFils: l.debitFils,
      creditFils: l.creditFils,
    })),
  );
  return { ok: true, id: entry.id };
}

/**
 * Posts an equal-and-opposite entry for an existing journal entry — the
 * standard accounting correction mechanism (CLAUDE.md Hard Rule: a
 * posted journal entry is never edited or deleted). The reversal's own
 * entryDate is checked against the period lock exactly like a normal
 * posting — reversing INTO a closed period is refused the same way.
 */
export async function reverseJournalEntry(
  tx: Tx,
  companyId: string,
  originalEntryId: string,
  reversalDate: Date,
  reason: string,
): Promise<PostJournalEntryResult> {
  const [original] = await tx.select().from(journalEntry).where(eq(journalEntry.id, originalEntryId));
  if (!original) throw new Error(`cannot reverse unknown journal entry ${originalEntryId}`);
  const originalLines = await tx.select().from(journalLine).where(eq(journalLine.journalEntryId, originalEntryId));
  const reversedLines: JournalLineInput[] = originalLines.map((l) => ({
    accountId: l.accountId,
    debitFils: l.creditFils,
    creditFils: l.debitFils,
  }));
  return postJournalEntry(
    tx,
    companyId,
    original.branchId,
    reversalDate,
    `Reversal of "${original.description}": ${reason}`,
    "journal_entry_reversal",
    originalEntryId,
    reversedLines,
  );
}
