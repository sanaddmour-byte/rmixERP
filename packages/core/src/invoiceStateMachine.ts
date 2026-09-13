/**
 * Explicit allowed-transition table (see DOMAIN.md's State machines
 * section). The full documented lifecycle is defined here now so later
 * phases never need to touch this table's shape — but Phase 6 (Invoicing)
 * only ever creates invoices in `draft`; it wires no transition routes.
 * `pending_clearance -> cleared -> issued` is Phase 7's clearance-before-
 * issue gate, and `partially_paid`/`paid` are Phase 8's collection
 * allocations. Reopening a `paid`/`partially_paid` invoice from a bounced
 * PDC or a reversed allocation (DOMAIN.md) is also Phase 8's concern —
 * those edges are added to this table when Receivables actually
 * implements bounce/reversal handling, not guessed here.
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
  partially_paid: ["paid"],
  paid: [],
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
