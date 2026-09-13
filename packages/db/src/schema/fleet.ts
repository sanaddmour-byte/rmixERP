import { boolean, numeric, pgTable, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { branch } from "./branch";
import { appUser } from "./user";

/** A mixer truck, assigned to deliveries at dispatch. */
export const truck = pgTable(
  "truck",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    plateNumber: varchar("plate_number", { length: 30 }).notNull(),
    capacityM3: numeric("capacity_m3", { precision: 6, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type Truck = typeof truck.$inferSelect;
export type NewTruck = typeof truck.$inferInsert;

/** A driver, assigned to deliveries at dispatch. Document-expiry alerts (license etc.) are Phase 10. */
export const driver = pgTable(
  "driver",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    licenseNumber: varchar("license_number", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    // Optional link to the login this driver uses on mobile — lets the
    // driver app resolve "my assigned deliveries" without guessing at an
    // identity match. Nullable/unique: a driver profile need not have a
    // login yet, and one login maps to at most one driver profile.
    userId: uuid("user_id").references(() => appUser.id),
    ...auditColumns(),
  },
  (t) => [tenantIsolationPolicy(), unique("driver_user_id_unique").on(t.userId)],
).enableRLS();

export type Driver = typeof driver.$inferSelect;
export type NewDriver = typeof driver.$inferInsert;
