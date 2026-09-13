import { bigint, integer, jsonb, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { rawMaterial } from "./rawMaterial";
import { vendor } from "./vendor";
import { appUser } from "./user";

/** See `packages/core`'s `purchaseRequestStateMachine.ts` for the allowed-transition table. */
export const purchaseRequestStatus = pgEnum("purchase_request_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
]);

/** See `packages/core`'s `purchaseOrderStateMachine.ts` for the allowed-transition table (DOMAIN.md's own table). */
export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "submitted",
  "approved",
  "received",
  "billed",
  "rejected",
  "cancelled",
]);

/** See `packages/core`'s `vendorBillStateMachine.ts` for the allowed-transition table. */
export const vendorBillStatus = pgEnum("vendor_bill_status", [
  "draft",
  "approved",
  "partially_paid",
  "paid",
  "cancelled",
]);

export const paymentMethod = pgEnum("payment_method", ["cash", "bank_transfer", "cheque"]);

/**
 * A department/plant's request to buy something — "spare parts as stock
 * items" (PLAN.md's Phase 9 scope) means a PR line references the same
 * `rawMaterial` catalog concrete production draws from, category-tagged
 * (e.g. "spare_part") rather than a second parallel item table; there is
 * no separate Equipment/SparePart procurement model in this phase.
 */
export const purchaseRequest = pgTable(
  "purchase_request",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    requestNumber: varchar("request_number", { length: 40 }).notNull().unique(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => appUser.id),
    status: purchaseRequestStatus("status").notNull().default("draft"),
    neededByDate: timestamp("needed_by_date", { withTimezone: true }),
    notes: varchar("notes", { length: 2000 }),
    convertedToPurchaseOrderId: uuid("converted_to_purchase_order_id"),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PurchaseRequest = typeof purchaseRequest.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequest.$inferInsert;

export const purchaseRequestLine = pgTable(
  "purchase_request_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    purchaseRequestId: uuid("purchase_request_id")
      .notNull()
      .references(() => purchaseRequest.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    notes: varchar("notes", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PurchaseRequestLine = typeof purchaseRequestLine.$inferSelect;
export type NewPurchaseRequestLine = typeof purchaseRequestLine.$inferInsert;

/**
 * `purchaseRequestId` is nullable — a PO can be raised directly (real
 * procurement practice for routine/blanket orders) as well as converted
 * from an approved PR; DOMAIN.md's PR -> PO arrow documents the common
 * path, not the only one.
 */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    purchaseRequestId: uuid("purchase_request_id").references(() => purchaseRequest.id),
    poNumber: varchar("po_number", { length: 40 }).notNull().unique(),
    status: purchaseOrderStatus("status").notNull().default("draft"),
    subtotalFils: bigint("subtotal_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PurchaseOrder = typeof purchaseOrder.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrder.$inferInsert;

export const purchaseOrderLine = pgTable(
  "purchase_order_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPriceFils: bigint("unit_price_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    netFils: bigint("net_fils", { mode: "bigint" }).notNull(),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull(),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PurchaseOrderLine = typeof purchaseOrderLine.$inferSelect;
export type NewPurchaseOrderLine = typeof purchaseOrderLine.$inferInsert;

/**
 * One receiving event against a PO — possibly the first of several
 * (DOMAIN.md/PLAN.md's quantity-variance-against-the-PO feature is
 * tracked per line by comparing `goodsReceiptLine.quantityReceived`
 * against its `purchaseOrderLine.quantity` on demand, not by adding
 * extra order-level "partially received" states DOMAIN.md's PO table
 * doesn't have). `photos` stores capture images inline as
 * `data:image/...;base64,...` strings, the same no-object-storage
 * approach as Phase 5's `SignaturePad` — this codebase has no blob
 * storage service to upload to.
 */
export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    receiptNumber: varchar("receipt_number", { length: 40 }).notNull().unique(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => appUser.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    notes: varchar("notes", { length: 2000 }),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type GoodsReceipt = typeof goodsReceipt.$inferSelect;
export type NewGoodsReceipt = typeof goodsReceipt.$inferInsert;

export const goodsReceiptLine = pgTable(
  "goods_receipt_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipt.id),
    purchaseOrderLineId: uuid("purchase_order_line_id")
      .notNull()
      .references(() => purchaseOrderLine.id),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 }).notNull(),
    unitCostFils: bigint("unit_cost_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type GoodsReceiptLine = typeof goodsReceiptLine.$inferSelect;
export type NewGoodsReceiptLine = typeof goodsReceiptLine.$inferInsert;

/**
 * `purchaseOrderId` is required — this phase only bills against a PO
 * (DOMAIN.md's PR -> PO -> GoodsReceipt -> VendorBill chain), matching
 * how Phase 6 only ever generates an invoice from a delivery order.
 * `vendorReference` is the vendor's own invoice number (external,
 * free-text) — separate from `billNumber`, this system's own gapless
 * generated number, the same distinction Phase 8 keeps between a
 * collection's `reference` and its `receiptNumber`.
 */
export const vendorBill = pgTable(
  "vendor_bill",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    billNumber: varchar("bill_number", { length: 40 }).notNull().unique(),
    vendorReference: varchar("vendor_reference", { length: 200 }),
    status: vendorBillStatus("status").notNull().default("draft"),
    subtotalFils: bigint("subtotal_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    billDate: timestamp("bill_date", { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type VendorBill = typeof vendorBill.$inferSelect;
export type NewVendorBill = typeof vendorBill.$inferInsert;

export const vendorBillLine = pgTable(
  "vendor_bill_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    vendorBillId: uuid("vendor_bill_id")
      .notNull()
      .references(() => vendorBill.id),
    purchaseOrderLineId: uuid("purchase_order_line_id")
      .notNull()
      .references(() => purchaseOrderLine.id),
    description: varchar("description", { length: 500 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    netFils: bigint("net_fils", { mode: "bigint" }).notNull(),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull(),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type VendorBillLine = typeof vendorBillLine.$inferSelect;
export type NewVendorBillLine = typeof vendorBillLine.$inferInsert;

/** The AP mirror of Phase 8's `collection` — a payment made, then allocated across one or more vendor bills. */
export const payment = pgTable(
  "payment",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id),
    method: paymentMethod("method").notNull(),
    receiptNumber: varchar("receipt_number", { length: 40 }).notNull().unique(),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    reference: varchar("reference", { length: 200 }),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;

/** How much of one payment was applied to one vendor bill — the AP mirror of Phase 8's `collectionAllocation`. */
export const paymentAllocation = pgTable(
  "payment_allocation",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payment.id),
    vendorBillId: uuid("vendor_bill_id")
      .notNull()
      .references(() => vendorBill.id),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PaymentAllocation = typeof paymentAllocation.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocation.$inferInsert;
