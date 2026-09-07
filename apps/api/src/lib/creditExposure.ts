import { and, eq, inArray, isNull } from "drizzle-orm";
import { addFils, fils, subFils, ZERO_FILS, type Fils } from "@rmixerp/core";
import { collectionAllocation, invoice, type Tx } from "@rmixerp/db";

/**
 * Real outstanding-invoice-balance exposure — supersedes the confirmed/
 * fulfilled-sales-order-total proxy Phase 2 used before real invoices
 * with allocations existed (that phase's own PLAN.md entry documented
 * this as an interim measure; Phase 8 is where it's finally superseded,
 * not Phase 6 as originally guessed — corrected in PLAN.md alongside
 * this change). Sums `invoice.totalFils - sum(non-voided allocations)`
 * across the customer's `issued`/`partially_paid` invoices — a fully
 * `paid` invoice contributes zero and drops out once its last allocation
 * lands; a `draft`/`pending_clearance`/`cleared`-but-not-yet-`issued`
 * invoice isn't a real receivable yet (DOMAIN.md's clearance-before-issue
 * flow) and is excluded, matching the same "only issued+ invoices are
 * open for allocation" rule `packages/core`'s `isInvoiceOpenForAllocation`
 * encodes.
 */
export async function computeOutstandingInvoiceExposure(
  tx: Tx,
  customerId: string,
  excludeInvoiceId?: string,
): Promise<Fils> {
  const openInvoices = await tx
    .select({ id: invoice.id, totalFils: invoice.totalFils })
    .from(invoice)
    .where(
      and(
        eq(invoice.customerId, customerId),
        inArray(invoice.status, ["issued", "partially_paid"]),
        isNull(invoice.voidedAt),
      ),
    );
  const filtered = excludeInvoiceId ? openInvoices.filter((i) => i.id !== excludeInvoiceId) : openInvoices;
  if (filtered.length === 0) return ZERO_FILS;

  const invoiceIds = filtered.map((i) => i.id);
  const allocations = await tx
    .select({ invoiceId: collectionAllocation.invoiceId, amountFils: collectionAllocation.amountFils })
    .from(collectionAllocation)
    .where(and(inArray(collectionAllocation.invoiceId, invoiceIds), isNull(collectionAllocation.voidedAt)));

  const allocatedByInvoice = new Map<string, bigint>();
  for (const a of allocations) {
    allocatedByInvoice.set(a.invoiceId, (allocatedByInvoice.get(a.invoiceId) ?? 0n) + a.amountFils);
  }

  return addFils(...filtered.map((i) => subFils(fils(i.totalFils), fils(allocatedByInvoice.get(i.id) ?? 0n))));
}
