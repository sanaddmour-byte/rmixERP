/**
 * Explicit allowed-transition table for a purchase order (DOMAIN.md's
 * State machines section: `draft -> submitted -> approved -> received ->
 * billed`, + `rejected`/`cancelled`). DOMAIN.md's table is coarse-grained
 * on purpose: a PO moves to `received` on its *first* goods receipt (like
 * Phase 3's ProductionOrder moving to `in_progress` on its first batch),
 * not per-line-fully-received — quantity variance against ordered vs.
 * received is tracked per line on the GoodsReceipt itself, not modeled as
 * extra states DOMAIN.md doesn't ask for. `received -> cancelled` is
 * deliberately absent: once goods have arrived, undoing the order means
 * a return/adjustment, which is out of this phase's scope (documented,
 * not guessed), matching how Phase 6 never built a `rejected` invoice's
 * resubmission flow either.
 */

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "received",
  "billed",
  "rejected",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

const PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "cancelled"],
  approved: ["received", "cancelled"],
  received: ["billed"],
  billed: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionPurchaseOrder(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PURCHASE_ORDER_TRANSITIONS[from].includes(to);
}

export function assertPurchaseOrderTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!canTransitionPurchaseOrder(from, to)) {
    throw new Error(`Invalid purchase order transition: ${from} -> ${to}`);
  }
}
