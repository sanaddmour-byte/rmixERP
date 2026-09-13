import { addFils, compareFils, subFils, ZERO_FILS, type Fils } from "./money";

/**
 * The AP mirror of `collectionAllocation.ts` — a payment allocates across
 * open vendor bills the same way a collection allocates across open
 * invoices (DOMAIN.md Invariant 7's FIFO-by-due-date rule, extended by
 * this phase to the payable side rather than duplicated ad hoc). Kept as
 * its own file with vendor-bill-specific naming rather than a generic
 * "allocation engine" both sides share, matching how this codebase gives
 * each document type its own state machine file instead of one generic
 * engine.
 */
export interface OpenVendorBill {
  vendorBillId: string;
  dueDate: Date;
  outstandingFils: Fils;
}

export interface PaymentAllocationLine {
  vendorBillId: string;
  amountFils: Fils;
}

export function planFifoPaymentAllocation(
  amountFils: Fils,
  openBills: OpenVendorBill[],
): { lines: PaymentAllocationLine[]; unallocatedFils: Fils } {
  const sorted = [...openBills].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const lines: PaymentAllocationLine[] = [];
  let remaining = amountFils;

  for (const bill of sorted) {
    if (compareFils(remaining, ZERO_FILS) <= 0) break;
    if (compareFils(bill.outstandingFils, ZERO_FILS) <= 0) continue;
    const applied = compareFils(remaining, bill.outstandingFils) <= 0 ? remaining : bill.outstandingFils;
    lines.push({ vendorBillId: bill.vendorBillId, amountFils: applied });
    remaining = subFils(remaining, applied);
  }

  return { lines, unallocatedFils: remaining };
}

export interface PaymentAllocationValidationError {
  ok: false;
  reason: string;
}
export interface PaymentAllocationValidationOk {
  ok: true;
}

export function validateManualPaymentAllocation(
  amountFils: Fils,
  lines: PaymentAllocationLine[],
  outstandingByBillId: Map<string, Fils>,
): PaymentAllocationValidationOk | PaymentAllocationValidationError {
  if (lines.length === 0) {
    return { ok: false, reason: "At least one allocation line is required." };
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.vendorBillId)) {
      return { ok: false, reason: `Vendor bill ${line.vendorBillId} appears more than once in the allocation plan.` };
    }
    seen.add(line.vendorBillId);

    if (compareFils(line.amountFils, ZERO_FILS) <= 0) {
      return { ok: false, reason: `Allocation for vendor bill ${line.vendorBillId} must be greater than zero.` };
    }
    const outstanding = outstandingByBillId.get(line.vendorBillId);
    if (outstanding === undefined) {
      return { ok: false, reason: `Vendor bill ${line.vendorBillId} is not open for allocation.` };
    }
    if (compareFils(line.amountFils, outstanding) > 0) {
      return { ok: false, reason: `Allocation for vendor bill ${line.vendorBillId} exceeds its outstanding balance.` };
    }
  }
  const total = addFils(...lines.map((l) => l.amountFils));
  if (compareFils(total, amountFils) > 0) {
    return { ok: false, reason: "Total allocated exceeds the payment amount." };
  }
  return { ok: true };
}
