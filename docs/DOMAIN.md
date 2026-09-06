# RMC ERP — Domain Model

## Core flow

```
Quotation → Sales Order → Production Order → Batch → Delivery Order → Invoice → Collection → GL
```

## Entities

**Org/access**: Company, Branch (plant), User, Role, Permission.

**Commercial**: Customer, Project, Product (grades ~C10–C50), PriceList +
PriceListLine, ChargeType.

**Supply**: RawMaterial, Vendor, VendorMaterialPrice, MixDesign +
MixDesignIngredient.

**Production**: ProductionOrder, BatchRecord, MaterialConsumption,
ReturnedConcrete, QCFreshTest, QCCubeTest.

**Fleet/dispatch**: DeliveryOrder, ProofOfDelivery, Truck, Driver, Equipment,
SparePart.

**Billing**: Invoice + InvoiceLine, CreditNote, DebitNote.

**Receivables**: Collection + CollectionAllocation, PostDatedCheque.

**Procurement**: PurchaseRequest, PurchaseOrder, GoodsReceipt, VendorBill.

**Inventory**: StockBalance, StockAdjustment, StockTransfer.

**GL**: Account, JournalEntry + JournalLine, CostCenter.

**Cross-cutting**: ApprovalWorkflow, ApprovalRequest, AuditLog, Notification.

Every business table (i.e. every entity above except pure lookups) carries
`company_id`, `branch_id`, `created_at`, `updated_at`, `created_by`,
`voided_at` (soft-delete) per `CLAUDE.md` Hard Rules.

## Invariants (enforced in code, covered by tests)

1. **A delivery order can be invoiced once.** Billing via sales order and
   billing via delivery order are mutually exclusive and cross-checked —
   this is the single most common source of double billing. Enforced with a
   **unique constraint** on the delivery-order reference across all invoice
   lines, not application logic alone.
2. **Batch recording is the inventory-deduction event.** Consumption = mix
   recipe × actual m³, adjusted for aggregate moisture, back-flushed against
   branch stock at moving-average cost. Negative stock is blocked unless
   explicitly overridden and audited.
3. A production order cannot be `completed` without at least one batch and a
   linked product.
4. Delivered m³ vs batched m³ vs returned m³ produce a yield-variance record
   per delivery; cement reconciliation is derived from consumption, never
   entered directly.
5. A delivery order cannot be marked `delivered` without a proof of delivery
   carrying a customer signature.
6. QC cube tests link to a batch and carry age (7/28-day, configurable),
   individual specimen strengths, set average, and pass/fail against the
   product's characteristic strength. A failed 28-day result raises a
   notification and flags every delivery drawn from that batch.
7. Collections allocate across multiple invoices FIFO by due date, with
   manual override; partial allocation is supported and reflected in
   invoice status (derived from allocations, never set manually).
8. Inventory valuation is moving average, recalculated on receipt and on
   consumption inside the same transaction as the triggering event.

## State machines (packages/core)

Each of the following has an explicit allowed-transition table — no
free-form status writes in routes:

- **Invoice**: `draft → pending_clearance → cleared → issued →
  partially_paid → paid` (+ `rejected` from clearance, terminal until
  corrected and resubmitted; + reopened by a bounced PDC or reversed
  allocation back to its prior paid-state).
- **DeliveryOrder**: `planned → dispatched → delivered → invoiced`
  (`invoiced` reachable only once, enforced by the DB constraint in
  Invariant 1).
- **PurchaseOrder**: `draft → submitted → approved → received → billed`
  (+ `rejected`, `cancelled`).
- **ApprovalRequest**: `pending → approved | rejected` (per workflow step).
- **PostDatedCheque**: `pending → deposited → cleared | bounced | cancelled`.
- **ProductionOrder**: `planned → in_progress → completed` (Invariant 3
  gates the `completed` transition).

## Money, tax, and scheduling conventions

See `CLAUDE.md` §"Money, units, tax conventions" — this file defines *what*
the entities and invariants are; that file defines *how* every number is
represented and computed. Both apply together; do not duplicate or drift the
two.
