import { bigint, boolean, integer, numeric, pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer, creditPolicy } from "./customer";
import { project } from "./project";
import { priceList, priceResolutionTier } from "./priceList";
import { product } from "./product";
import { chargeType, chargeCalculationMethod } from "./chargeType";
import { quotation } from "./quotation";

/** See `packages/core`'s `salesStateMachine.ts` for the allowed-transition table. */
export const salesOrderStatus = pgEnum("sales_order_status", ["draft", "confirmed", "fulfilled", "cancelled"]);

export const salesOrder = pgTable(
  "sales_order",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    projectId: uuid("project_id").references(() => project.id),
    quotationId: uuid("quotation_id").references(() => quotation.id),
    status: salesOrderStatus("status").notNull().default("draft"),
    notes: varchar("notes", { length: 2000 }),
    // Credit check outcome, recorded at confirmation (draft -> confirmed) — see packages/core's evaluateCreditCheck.
    creditCheckPolicy: creditPolicy("credit_check_policy"),
    creditCheckOutstandingFils: bigint("credit_check_outstanding_fils", { mode: "bigint" }),
    creditCheckExceedsByFils: bigint("credit_check_exceeds_by_fils", { mode: "bigint" }),
    creditOverride: boolean("credit_override").notNull().default(false),
    creditOverrideReason: varchar("credit_override_reason", { length: 500 }),
    creditOverrideBy: uuid("credit_override_by"),
    // Snapshot totals, recomputed transactionally whenever lines/charges change (never entered directly).
    subtotalFils: bigint("subtotal_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type SalesOrder = typeof salesOrder.$inferSelect;
export type NewSalesOrder = typeof salesOrder.$inferInsert;

export const salesOrderLine = pgTable(
  "sales_order_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrder.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    quantityM3: numeric("quantity_m3", { precision: 10, scale: 3 }).notNull(),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceList.id),
    priceResolutionTier: priceResolutionTier("price_resolution_tier").notNull(),
    concreteUnitPriceFils: bigint("concrete_unit_price_fils", { mode: "bigint" }).notNull(),
    deliveryUnitPriceFils: bigint("delivery_unit_price_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    netFils: bigint("net_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type SalesOrderLine = typeof salesOrderLine.$inferSelect;
export type NewSalesOrderLine = typeof salesOrderLine.$inferInsert;

export const salesOrderLineCharge = pgTable(
  "sales_order_line_charge",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    salesOrderLineId: uuid("sales_order_line_id")
      .notNull()
      .references(() => salesOrderLine.id),
    chargeTypeId: uuid("charge_type_id")
      .notNull()
      .references(() => chargeType.id),
    calculationMethod: chargeCalculationMethod("calculation_method").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type SalesOrderLineCharge = typeof salesOrderLineCharge.$inferSelect;
export type NewSalesOrderLineCharge = typeof salesOrderLineCharge.$inferInsert;
