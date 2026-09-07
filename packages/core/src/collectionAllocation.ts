import { addFils, compareFils, subFils, ZERO_FILS, type Fils } from "./money";
import type { InvoiceStatus } from "./invoiceStateMachine";

/** An invoice open to receive an allocation — only ever `issued`/`partially_paid` (DOMAIN.md/PLAN.md: allocations only ever apply against an issued document). */
export interface OpenInvoice {
  invoiceId: string;
  dueDate: Date;
  outstandingFils: Fils;
}

export interface AllocationLine {
  invoiceId: string;
  amountFils: Fils;
}

/**
 * DOMAIN.md Invariant 7: "Collections allocate across multiple invoices
 * FIFO by due date." Greedily applies the collection amount to the
 * earliest-due invoice first, capped at each invoice's own outstanding
 * balance, until the collection is exhausted or every invoice is covered.
 * Any remainder (the collection exceeds total outstanding) is simply
 * unallocated — the caller decides what that means (typically: reject, or
 * carry forward as an on-account credit, neither of which this phase
 * guesses at beyond returning the leftover).
 */
export function planFifoAllocation(amountFils: Fils, openInvoices: OpenInvoice[]): { lines: AllocationLine[]; unallocatedFils: Fils } {
  const sorted = [...openInvoices].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const lines: AllocationLine[] = [];
  let remaining = amountFils;

  for (const inv of sorted) {
    if (compareFils(remaining, ZERO_FILS) <= 0) break;
    if (compareFils(inv.outstandingFils, ZERO_FILS) <= 0) continue;
    const applied = compareFils(remaining, inv.outstandingFils) <= 0 ? remaining : inv.outstandingFils;
    lines.push({ invoiceId: inv.invoiceId, amountFils: applied });
    remaining = subFils(remaining, applied);
  }

  return { lines, unallocatedFils: remaining };
}

export interface ManualAllocationValidationError {
  ok: false;
  reason: string;
}
export interface ManualAllocationValidationOk {
  ok: true;
}

/**
 * Validates a manually-specified allocation plan (DOMAIN.md: "manual
 * override supported") against the collection's total amount and each
 * targeted invoice's own outstanding balance — never trusts the caller's
 * arithmetic.
 */
export function validateManualAllocation(
  amountFils: Fils,
  lines: AllocationLine[],
  outstandingByInvoiceId: Map<string, Fils>,
): ManualAllocationValidationOk | ManualAllocationValidationError {
  if (lines.length === 0) {
    return { ok: false, reason: "At least one allocation line is required." };
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.invoiceId)) {
      return { ok: false, reason: `Invoice ${line.invoiceId} appears more than once in the allocation plan.` };
    }
    seen.add(line.invoiceId);

    if (compareFils(line.amountFils, ZERO_FILS) <= 0) {
      return { ok: false, reason: `Allocation for invoice ${line.invoiceId} must be greater than zero.` };
    }
    const outstanding = outstandingByInvoiceId.get(line.invoiceId);
    if (outstanding === undefined) {
      return { ok: false, reason: `Invoice ${line.invoiceId} is not open for allocation.` };
    }
    if (compareFils(line.amountFils, outstanding) > 0) {
      return { ok: false, reason: `Allocation for invoice ${line.invoiceId} exceeds its outstanding balance.` };
    }
  }
  const total = addFils(...lines.map((l) => l.amountFils));
  if (compareFils(total, amountFils) > 0) {
    return { ok: false, reason: "Total allocated exceeds the collection amount." };
  }
  return { ok: true };
}

export function isInvoiceOpenForAllocation(status: InvoiceStatus): boolean {
  return status === "issued" || status === "partially_paid";
}

/**
 * Derives an invoice's status from its total vs. allocated amount —
 * DOMAIN.md Invariant 7: "reflected in invoice status (derived from
 * allocations, never set manually)". Only ever called on an invoice
 * already `issued`/`partially_paid`/`paid` (ISSUED_OR_LATER); an increase
 * in allocation can reach `paid` directly from `issued` in one step
 * (invoiceStateMachine allows `issued -> paid`), and a bounced-cheque
 * reduction can drop `paid`/`partially_paid` back down — both directions
 * use this same derivation, the caller just asserts the resulting
 * transition through `assertInvoiceTransition`.
 */
export function deriveInvoiceStatusFromAllocations(totalFils: Fils, allocatedFils: Fils): "issued" | "partially_paid" | "paid" {
  if (compareFils(allocatedFils, ZERO_FILS) <= 0) return "issued";
  if (compareFils(allocatedFils, totalFils) >= 0) return "paid";
  return "partially_paid";
}
