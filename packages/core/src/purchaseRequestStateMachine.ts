/**
 * Explicit allowed-transition table for a purchase request (see
 * DOMAIN.md's Procurement flow: PR -> PO -> GoodsReceipt -> VendorBill).
 * DOMAIN.md's State machines section only spells out PurchaseOrder's
 * table explicitly; a PR gets its own here per CLAUDE.md's Hard Rule that
 * every state transition goes through an explicit table, no free-form
 * status writes.
 */

export const PURCHASE_REQUEST_STATUSES = ["draft", "submitted", "approved", "rejected", "cancelled"] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

const PURCHASE_REQUEST_TRANSITIONS: Record<PurchaseRequestStatus, readonly PurchaseRequestStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionPurchaseRequest(from: PurchaseRequestStatus, to: PurchaseRequestStatus): boolean {
  return PURCHASE_REQUEST_TRANSITIONS[from].includes(to);
}

export function assertPurchaseRequestTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): void {
  if (!canTransitionPurchaseRequest(from, to)) {
    throw new Error(`Invalid purchase request transition: ${from} -> ${to}`);
  }
}
