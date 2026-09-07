/**
 * Explicit allowed-transition table (see DOMAIN.md's State machines
 * section). Phase 6 (Invoicing) only ever created `draft` invoices. Phase
 * 7 (Clearance) wired up `draft -> pending_clearance -> cleared/rejected
 * -> issued`. Phase 8 (Receivables) wires up `issued -> partially_paid ->
 * paid` (collection allocation, `packages/core`'s
 * `deriveInvoiceStatusFromAllocations`) and the reopening edges DOMAIN.md
 * describes ("reopened by a bounced PDC or reversed allocation back to
 * its prior paid-state"): `paid -> partially_paid`, `paid -> issued`, and
 * `partially_paid -> issued` — a reduction in allocated amount (a bounced
 * cheque unwinding its allocation) can drop either state back down,
 * derived the same way a increase raises it, never guessed independently.
 */

export const INVOICE_STATUSES = [
  "draft",
  "pending_clearance",
  "cleared",
  "issued",
  "partially_paid",
  "paid",
  "rejected",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["pending_clearance"],
  pending_clearance: ["cleared", "rejected"],
  cleared: ["issued"],
  issued: ["partially_paid", "paid"],
  partially_paid: ["paid", "issued"],
  paid: ["partially_paid", "issued"],
  // Terminal until corrected and resubmitted: a rejected invoice goes back
  // to draft for correction, then re-enters pending_clearance normally.
  rejected: ["draft"],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) {
    throw new Error(`Invalid invoice transition: ${from} -> ${to}`);
  }
}
