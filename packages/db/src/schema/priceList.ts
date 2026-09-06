import { bigint, boolean, integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { customer } from "./customer";
import { project } from "./project";
import { product } from "./product";

/**
 * project-specific -> customer-specific -> branch -> company default. Every
 * price list belongs to exactly one tier (enforced in the service layer,
 * not the DB — see `packages/core`'s `resolvePrice`): `tier` says which,
 * and only the matching FK (`projectId`/`customerId`/`branchId`) is set;
 * `company` tier has all three null.
 */
export const priceResolutionTier = pgEnum("price_resolution_tier", [
  "project",
  "customer",
  "branch",
  "company",
]);

export const priceList = pgTable(
  "price_list",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    tier: priceResolutionTier("tier").notNull(),
    projectId: uuid("project_id").references(() => project.id),
    customerId: uuid("customer_id").references(() => customer.id),
    branchId: uuid("branch_id").references(() => branch.id),
    name: varchar("name", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PriceList = typeof priceList.$inferSelect;
export type NewPriceList = typeof priceList.$inferInsert;

/** Per-product pricing within a price list, with its own effective window. */
export const priceListLine = pgTable(
  "price_list_line",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceList.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    concreteUnitPriceFils: bigint("concrete_unit_price_fils", { mode: "bigint" }).notNull(),
    deliveryUnitPriceFils: bigint("delivery_unit_price_fils", { mode: "bigint" }).notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type PriceListLine = typeof priceListLine.$inferSelect;
export type NewPriceListLine = typeof priceListLine.$inferInsert;
