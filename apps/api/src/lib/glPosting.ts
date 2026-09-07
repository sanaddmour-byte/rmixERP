import { and, eq } from "drizzle-orm";
import { account, journalEntry, journalLine, type Tx } from "@rmixerp/db";
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

/**
 * Inserts one balanced journal entry with its lines in the caller's
 * transaction — CLAUDE.md's Hard Rule: financial postings are
 * double-entry, and a balance is always derived from journal lines, never
 * written directly.
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
): Promise<string> {
  assertJournalEntryBalanced(lines);
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
  return entry.id;
}
