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
} as const;

export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: WELL_KNOWN_ACCOUNT_CODES.cash, name: "Cash and Bank", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.inventory, name: "Inventory", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.taxInput, name: "Tax Input (Recoverable)", type: "asset" },
  { code: WELL_KNOWN_ACCOUNT_CODES.accountsPayable, name: "Accounts Payable", type: "liability" },
];
