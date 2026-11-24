import { and, eq } from "drizzle-orm";
import { account, journalEntry, journalLine, type Tx } from "@rmixerp/db";
import { assertJournalEntryBalanced, DEFAULT_ACCOUNTS, type JournalLineInput, type WELL_KNOWN_ACCOUNT_CODES } from "@rmixerp/core";

/**
 * Finds a seeded well-known account (`packages/core`'s `DEFAULT_ACCOUNTS`)
 * by code, creating it from that same definition if missing. Self-healing
 * rather than throwing: a company seeded before a given well-known
 * account was added to `DEFAULT_ACCOUNTS` (every company created before
 * this file added the receivables-side accounts, for instance) would
 * otherwise 500 the first time anything tries to post against it, with no
 * way to fix it short of a migration step whose ordering against a
 * deploy is never guaranteed. `onConflictDoNothing` on the table's own
 * (companyId, code) unique constraint makes this safe under concurrent
 * first-use, too.
 */
export async function findWellKnownAccount(
  tx: Tx,
  companyId: string,
  code: (typeof WELL_KNOWN_ACCOUNT_CODES)[keyof typeof WELL_KNOWN_ACCOUNT_CODES],
): Promise<string> {
  const [row] = await tx.select().from(account).where(and(eq(account.companyId, companyId), eq(account.code, code)));
  if (row) return row.id;

  const definition = DEFAULT_ACCOUNTS.find((a) => a.code === code);
  if (!definition) throw new Error(`Unknown well-known account code ${code} — not in DEFAULT_ACCOUNTS`);
  await tx.insert(account).values({ companyId, ...definition }).onConflictDoNothing();
  const [created] = await tx.select().from(account).where(and(eq(account.companyId, companyId), eq(account.code, code)));
  if (!created) throw new Error(`Failed to create well-known account ${code} for company ${companyId}`);
  return created.id;
}

/**
 * Inserts one balanced journal entry with its lines in the caller's
 * transaction — CLAUDE.md's Hard Rule: financial postings are
 * double-entry, and a balance is always derived from journal lines, never
 * written directly.
 *
 * Retry-safe via the database, not just the call site's own state-machine
 * guards: `journal_entry` carries a UNIQUE(company_id, source_document_type,
 * source_document_id) constraint, so a second attempt to post for the same
 * source document — a retried request past the point an idempotent-key
 * replay would have caught it, or a future call site without one — finds
 * the existing entry and returns its id instead of double-posting.
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
  const [existing] = await tx
    .select()
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.companyId, companyId),
        eq(journalEntry.sourceDocumentType, sourceDocumentType),
        eq(journalEntry.sourceDocumentId, sourceDocumentId),
      ),
    );
  if (existing) return existing.id;

  const [entry] = await tx
    .insert(journalEntry)
    .values({ companyId, branchId, entryDate, description, sourceDocumentType, sourceDocumentId })
    .onConflictDoNothing({ target: [journalEntry.companyId, journalEntry.sourceDocumentType, journalEntry.sourceDocumentId] })
    .returning();
  if (!entry) {
    // Lost the race to a concurrent poster for the same source document.
    const [raced] = await tx
      .select()
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.companyId, companyId),
          eq(journalEntry.sourceDocumentType, sourceDocumentType),
          eq(journalEntry.sourceDocumentId, sourceDocumentId),
        ),
      );
    if (!raced) throw new Error("journal entry insert returned no row and no concurrent entry was found");
    return raced.id;
  }
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
