import type { AccountType } from "./journalEntry";

/**
 * The minimal chart of accounts this phase's GL postings need, seeded once
 * per company (`packages/db/seed`) and looked up by code at posting time
 * (`apps/api/src/lib/glPosting.ts`) — a full chart of accounts is a
 * back-office setup task (`POST /gl/accounts`), not something this phase
 * guesses a complete standard list for. These four are the ones the
 * vendor-bill-approve/payment postings actually touch.
 */
export const WELL_KNOWN_ACCOUNT_CODES = {
  cash: "1000",
  inventory: "1300",
  taxInput: "1400",
  accountsPayable: "2000",
  // Added for the receivables-side GL postings (invoice issue, credit/
  // debit note clearance, receipt, PDC clear/bounce/cancel) — Phase 9's
  // chart covered only the procurement side, by that phase's own
  // documented scope decision; this extends the same chart rather than
  // starting a second one.
  accountsReceivable: "1200",
  postDatedChequesInHand: "1250",
  revenue: "4000",
  taxOutput: "2100",
} as const;

export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: WELL_KNOWN_ACCOUNT_CODES.cash, name: "Cash and Bank", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.accountsReceivable, name: "Accounts Receivable", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.postDatedChequesInHand, name: "Post-Dated Cheques in Hand", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.inventory, name: "Inventory", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.taxInput, name: "Tax Input (Recoverable)", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.accountsPayable, name: "Accounts Payable", type: "liability" },
  { code: WELL_KNOWN_ACCOUNT_CODES.taxOutput, name: "Tax Output (Payable)", type: "liability" },
  { code: WELL_KNOWN_ACCOUNT_CODES.revenue, name: "Concrete and Delivery Revenue", type: "revenue" },
];
