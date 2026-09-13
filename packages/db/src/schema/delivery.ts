import { bigint, boolean, numeric, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { salesOrder, salesOrderLine } from "./salesOrder";
import { productionOrder, batchRecord } from "./production";
import { truck, driver } from "./fleet";
import { creditPolicy } from "./customer";

/** See `packages/core`'s `deliveryStateMachine.ts` for the allowed-transition table. */
export const deliveryOrderStatus = pgEnum("delivery_order_status", ["planned", "dispatched", "delivered", "invoiced"]);

export const deliveryOrder = pgTable(
  "delivery_order",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrder.id),
    // Which sales-order line this delivery fulfills — a sales order can
    // carry multiple lines (different products/prices), so invoicing
    // (Phase 6) needs this to know exactly which line's price/tax rate to
    // bill at, rather than re-resolving a price at invoice time (which
    // could drift from what was actually quoted/sold). Nullable so it
    // doesn't break existing delivery-order creation; Phase 6 validates
    // it's present before a delivery order can be invoiced.
    salesOrderLineId: uuid("sales_order_line_id").references(() => salesOrderLine.id),
    productionOrderId: uuid("production_order_id").references(() => productionOrder.id),
    // The specific batch this delivery was loaded from — carries the QC flag
    // through at read time (DOMAIN.md Invariant 6's "flags every delivery
    // drawn from that batch"), derived via join, never duplicated here.
    batchRecordId: uuid("batch_record_id").references(() => batchRecord.id),
    truckId: uuid("truck_id").references(() => truck.id),
    driverId: uuid("driver_id").references(() => driver.id),
    quantityM3: numeric("quantity_m3", { precision: 10, scale: 3 }).notNull(),
    status: deliveryOrderStatus("status").notNull().default("planned"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Credit check outcome, recorded at dispatch (planned -> dispatched) —
    // re-evaluated here on top of Phase 2's confirm-time check, per
    // DOMAIN.md/PLAN.md's "credit check re-evaluated at dispatch".
    creditCheckPolicy: creditPolicy("credit_check_policy"),
    creditCheckOutstandingFils: bigint("credit_check_outstanding_fils", { mode: "bigint" }),
    creditCheckExceedsByFils: bigint("credit_check_exceeds_by_fils", { mode: "bigint" }),
    creditOverride: boolean("credit_override").notNull().default(false),
    creditOverrideReason: varchar("credit_override_reason", { length: 500 }),
    creditOverrideBy: uuid("credit_override_by"),
    // Document-expiry outcome at dispatch (Phase 10), mirroring the credit-check
    // columns above rather than inventing a second override shape.
    documentExpiryOverride: boolean("document_expiry_override").notNull().default(false),
    documentExpiryOverrideReason: varchar("document_expiry_override_reason", { length: 500 }),
    documentExpiryOverrideBy: uuid("document_expiry_override_by"),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type DeliveryOrder = typeof deliveryOrder.$inferSelect;
export type NewDeliveryOrder = typeof deliveryOrder.$inferInsert;

/**
 * One per delivery order (DOMAIN.md Invariant 5: a delivery order cannot be
 * marked `delivered` without a proof of delivery carrying a customer
 * signature). There is deliberately no separate "mark delivered" action —
 * the API's only delivered-transition route creates this row in the same
 * transaction, so the invariant is structural, not just a runtime check.
 */
export const proofOfDelivery = pgTable(
  "proof_of_delivery",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    deliveryOrderId: uuid("delivery_order_id")
      .notNull()
      .references(() => deliveryOrder.id),
    receivedQuantityM3: numeric("received_quantity_m3", { precision: 10, scale: 3 }).notNull(),
    signedByName: varchar("signed_by_name", { length: 200 }).notNull(),
    // Base64 data URI captured from the mobile driver app's signature pad.
    signatureData: text("signature_data").notNull(),
    notes: varchar("notes", { length: 1000 }),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("proof_of_delivery_delivery_order_unique").on(t.deliveryOrderId)],
).enableRLS();

export type ProofOfDelivery = typeof proofOfDelivery.$inferSelect;
export type NewProofOfDelivery = typeof proofOfDelivery.$inferInsert;
