import { bigint, integer, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer } from "./customer";
import { project } from "./project";
import { priceList, priceResolutionTier } from "./priceList";
import { product } from "./product";
import { chargeType, chargeCalculationMethod } from "./chargeType";

/** See `packages/core`'s `salesStateMachine.ts` for the allowed-transition table. */
export const quotationStatus = pgEnum("quotation_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);

export const quotation = pgTable(
  "quotation",
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
    status: quotationStatus("status").notNull().default("draft"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    notes: varchar("notes", { length: 2000 }),
    // Snapshot totals, recomputed transactionally whenever lines/charges change (never entered directly).
    subtotalFils: bigint("subtotal_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Quotation = typeof quotation.$inferSelect;
export type NewQuotation = typeof quotation.$inferInsert;

export const quotationLine = pgTable(
  "quotation_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotation.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    // Cubic meters, 3 dp — priced via packages/core's decimalStringToMilliUnits + mulFilsRoundHalfUp.
    quantityM3: numeric("quantity_m3", { precision: 10, scale: 3 }).notNull(),
    // Which price list/tier packages/core's resolvePrice picked for this product, at line-creation time
    // (different lines on the same quotation can resolve to different tiers).
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceList.id),
    priceResolutionTier: priceResolutionTier("price_resolution_tier").notNull(),
    // Snapshot from price resolution at quote time (packages/core's resolvePrice).
    concreteUnitPriceFils: bigint("concrete_unit_price_fils", { mode: "bigint" }).notNull(),
    deliveryUnitPriceFils: bigint("delivery_unit_price_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    // Computed = (concrete+delivery) x quantity + charges; tax computed on top and summed, never sum-then-tax.
    netFils: bigint("net_fils", { mode: "bigint" }).notNull().default(sql`0`),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    totalFils: bigint("total_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type QuotationLine = typeof quotationLine.$inferSelect;
export type NewQuotationLine = typeof quotationLine.$inferInsert;

/** A commercial charge type (zone/distance, waiting-time, pumping, per-load, seasonal, night-pour) applied to one order line. */
export const quotationLineCharge = pgTable(
  "quotation_line_charge",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    quotationLineId: uuid("quotation_line_id")
      .notNull()
      .references(() => quotationLine.id),
    chargeTypeId: uuid("charge_type_id")
      .notNull()
      .references(() => chargeType.id),
    // Snapshot of the charge type's method at the time it was applied.
    calculationMethod: chargeCalculationMethod("calculation_method").notNull(),
    // "per_unit" only (e.g. number of loads/hours); null for flat/percentage.
    quantity: numeric("quantity", { precision: 10, scale: 3 }),
    amountFils: bigint("amount_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    taxFils: bigint("tax_fils", { mode: "bigint" }).notNull().default(sql`0`),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type QuotationLineCharge = typeof quotationLineCharge.$inferSelect;
export type NewQuotationLineCharge = typeof quotationLineCharge.$inferInsert;
