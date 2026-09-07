import { bigint, boolean, integer, pgEnum, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";

/** Zone/distance surcharge, waiting-time, pumping, per-load, seasonal, night-pour, etc. */
export const chargeCalculationMethod = pgEnum("charge_calculation_method", [
  "flat",
  "per_unit",
  "percentage",
]);

export const chargeType = pgTable(
  "charge_type",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    name: varchar("name", { length: 100 }).notNull(),
    calculationMethod: chargeCalculationMethod("calculation_method").notNull().default("flat"),
    defaultAmountFils: bigint("default_amount_fils", { mode: "bigint" }),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(1600),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type ChargeType = typeof chargeType.$inferSelect;
export type NewChargeType = typeof chargeType.$inferInsert;
