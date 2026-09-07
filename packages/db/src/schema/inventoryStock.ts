import { bigint, numeric, pgTable, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { rawMaterial } from "./rawMaterial";

/**
 * One row per (branch, raw material) — the moving-average balance
 * `packages/core`'s `applyStockReceipt`/`applyStockConsumption` update.
 * There is no Goods Receipt yet (Phase 9); `stockAdjustment` is how stock
 * enters the system until then.
 */
export const stockBalance = pgTable(
  "stock_balance",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 3 }).notNull().default(sql`0`),
    averageCostFils: bigint("average_cost_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("stock_balance_branch_material_unique").on(t.branchId, t.rawMaterialId)],
).enableRLS();

export type StockBalance = typeof stockBalance.$inferSelect;
export type NewStockBalance = typeof stockBalance.$inferInsert;

/**
 * An immutable ledger entry for every manual change to a stock balance —
 * a positive `quantityDelta` (receipt, sets/re-averages the cost) or a
 * negative one (write-off/correction, priced at the balance's current
 * average). `resultingQuantityOnHand`/`resultingAverageCostFils` snapshot
 * the balance immediately after this entry applied, for audit history.
 */
export const stockAdjustment = pgTable(
  "stock_adjustment",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
    unitCostFils: bigint("unit_cost_fils", { mode: "bigint" }),
    resultingQuantityOnHand: numeric("resulting_quantity_on_hand", { precision: 14, scale: 3 }).notNull(),
    resultingAverageCostFils: bigint("resulting_average_cost_fils", { mode: "bigint" }).notNull(),
    reason: varchar("reason", { length: 500 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type StockAdjustment = typeof stockAdjustment.$inferSelect;
export type NewStockAdjustment = typeof stockAdjustment.$inferInsert;
