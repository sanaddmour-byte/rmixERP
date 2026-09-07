/**
 * Explicit allowed-transition table for a vendor bill. DOMAIN.md's
 * Procurement flow ends "... -> VendorBill -> Payment"; a bill's own
 * lifecycle isn't spelled out in DOMAIN.md's State machines section, so
 * this mirrors Invoice's AR-side shape (`draft -> approved ->
 * partially_paid -> paid`) for consistency — the two are structurally the
 * same problem (a billed amount reduced by allocated payments) on
 * opposite sides of the ledger. `partiallyPaid`/`paid` are derived from
 * payment allocations, never set directly, matching Invoice's
 * `deriveInvoiceStatusFromAllocations` precedent.
 */

export const VENDOR_BILL_STATUSES = ["draft", "approved", "partially_paid", "paid", "cancelled"] as const;
export type VendorBillStatus = (typeof VENDOR_BILL_STATUSES)[number];

const VENDOR_BILL_TRANSITIONS: Record<VendorBillStatus, readonly VendorBillStatus[]> = {
  draft: ["approved", "cancelled"],
  approved: ["partially_paid", "paid"],
  partially_paid: ["paid", "approved"],
  paid: ["partially_paid"],
  cancelled: [],
};

export function canTransitionVendorBill(from: VendorBillStatus, to: VendorBillStatus): boolean {
  return VENDOR_BILL_TRANSITIONS[from].includes(to);
}

export function assertVendorBillTransition(from: VendorBillStatus, to: VendorBillStatus): void {
  if (!canTransitionVendorBill(from, to)) {
    throw new Error(`Invalid vendor bill transition: ${from} -> ${to}`);
  }
}

/**
 * Derives a vendor bill's status from its approval state plus how much of
 * its total has been allocated by payments — the same "never set status
 * directly" pattern as Invoice/PDC. `approved` bills with zero allocation
 * stay `approved` (not a separate `unpaid` state DOMAIN.md doesn't ask
 * for); any allocation short of the full total is `partially_paid`.
 */
export function deriveVendorBillStatusFromAllocations(
  approved: boolean,
  totalFils: bigint,
  allocatedFils: bigint,
): VendorBillStatus {
  if (!approved) return "draft";
  if (allocatedFils <= 0n) return "approved";
  if (allocatedFils >= totalFils) return "paid";
  return "partially_paid";
}
