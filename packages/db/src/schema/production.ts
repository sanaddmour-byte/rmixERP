import { bigint, boolean, integer, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { product } from "./product";
import { mixDesign } from "./mixDesign";
import { rawMaterial } from "./rawMaterial";
import { salesOrder } from "./salesOrder";

/** See `packages/core`'s `productionStateMachine.ts` for the allowed-transition table. */
export const productionOrderStatus = pgEnum("production_order_status", [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const productionOrder = pgTable(
  "production_order",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesign.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
    plannedQuantityM3: numeric("planned_quantity_m3", { precision: 10, scale: 3 }).notNull(),
    status: productionOrderStatus("status").notNull().default("planned"),
    notes: varchar("notes", { length: 2000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type ProductionOrder = typeof productionOrder.$inferSelect;
export type NewProductionOrder = typeof productionOrder.$inferInsert;

/** One batching event. Recording a batch is the inventory-deduction event (DOMAIN.md Invariant 2). */
export const batchRecord = pgTable(
  "batch_record",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrder.id),
    batchNumber: integer("batch_number").notNull(),
    targetQuantityM3: numeric("target_quantity_m3", { precision: 10, scale: 3 }).notNull(),
    actualQuantityM3: numeric("actual_quantity_m3", { precision: 10, scale: 3 }).notNull(),
    // Basis points applied uniformly to every ingredient — see packages/core's
    // applyUniformMoistureAdjustment doc comment: a documented simplification,
    // not verified against real batching practice.
    moistureAdjustmentBasisPoints: integer("moisture_adjustment_basis_points").notNull().default(0),
    batchedAt: timestamp("batched_at", { withTimezone: true }).notNull().defaultNow(),
    // Set by a failed 28-day (design-age) cube test result (DOMAIN.md Invariant
    // 6). "Flags every delivery drawn from this batch" — until Phase 5's
    // DeliveryOrder exists, the flag lives here at the batch level; Phase 5
    // will propagate it onto deliveries that draw from a flagged batch.
    qcFlagged: boolean("qc_flagged").notNull().default(false),
    qcFlagReason: varchar("qc_flag_reason", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type BatchRecord = typeof batchRecord.$inferSelect;
export type NewBatchRecord = typeof batchRecord.$inferInsert;

/** Back-flushed consumption of one raw material for one batch, at that material's moving-average cost. */
export const materialConsumption = pgTable(
  "material_consumption",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    batchRecordId: uuid("batch_record_id")
      .notNull()
      .references(() => batchRecord.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    // Snapshot of the mix design's recipe rate at the time of batching.
    mixDesignQuantityPerM3: numeric("mix_design_quantity_per_m3", { precision: 12, scale: 3 }).notNull(),
    quantityConsumed: numeric("quantity_consumed", { precision: 14, scale: 3 }).notNull(),
    unitCostFils: bigint("unit_cost_fils", { mode: "bigint" }).notNull(),
    totalCostFils: bigint("total_cost_fils", { mode: "bigint" }).notNull(),
    wentNegative: boolean("went_negative").notNull().default(false),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type MaterialConsumption = typeof materialConsumption.$inferSelect;
export type NewMaterialConsumption = typeof materialConsumption.$inferInsert;

/** Unused concrete returned to the plant. Materials were already consumed at batching — this does not reverse stock. */
export const returnedConcrete = pgTable(
  "returned_concrete",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrder.id),
    quantityM3: numeric("quantity_m3", { precision: 10, scale: 3 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    returnedAt: timestamp("returned_at", { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type ReturnedConcrete = typeof returnedConcrete.$inferSelect;
export type NewReturnedConcrete = typeof returnedConcrete.$inferInsert;
