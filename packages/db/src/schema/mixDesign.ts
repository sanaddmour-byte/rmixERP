import { boolean, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { product } from "./product";
import { rawMaterial } from "./rawMaterial";

/** A concrete recipe for one product/grade at one plant (aggregate sources differ per plant). */
export const mixDesign = pgTable(
  "mix_design",
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
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type MixDesign = typeof mixDesign.$inferSelect;
export type NewMixDesign = typeof mixDesign.$inferInsert;

/** One ingredient line in a mix design's recipe, in the raw material's own unit, per m3 of concrete. */
export const mixDesignIngredient = pgTable(
  "mix_design_ingredient",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesign.id),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => rawMaterial.id),
    quantityPerM3: numeric("quantity_per_m3", { precision: 12, scale: 3 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type MixDesignIngredient = typeof mixDesignIngredient.$inferSelect;
export type NewMixDesignIngredient = typeof mixDesignIngredient.$inferInsert;
