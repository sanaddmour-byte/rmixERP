import { boolean, integer, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { batchRecord } from "./production";

/**
 * A fresh-concrete test (slump, temperature, air content) taken at
 * batching. Data capture only — DOMAIN.md's pass/fail invariant applies
 * to cube tests, not fresh tests.
 */
export const qcFreshTest = pgTable(
  "qc_fresh_test",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    batchRecordId: uuid("batch_record_id")
      .notNull()
      .references(() => batchRecord.id),
    slumpMm: numeric("slump_mm", { precision: 6, scale: 1 }).notNull(),
    concreteTemperatureC: numeric("concrete_temperature_c", { precision: 5, scale: 1 }),
    ambientTemperatureC: numeric("ambient_temperature_c", { precision: 5, scale: 1 }),
    airContentPercent: numeric("air_content_percent", { precision: 5, scale: 2 }),
    testedAt: timestamp("tested_at", { withTimezone: true }).notNull().defaultNow(),
    notes: varchar("notes", { length: 1000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type QCFreshTest = typeof qcFreshTest.$inferSelect;
export type NewQCFreshTest = typeof qcFreshTest.$inferInsert;

/**
 * A set of cube specimens cast from one batch at one age. Pass/fail
 * (`packages/core`'s `evaluateCubeTest`) is only rendered at the
 * product's design age (default 28 days) — see qc.ts's doc comment for
 * why earlier ages are informational-only, not a guessed formula.
 */
export const qcCubeTestSet = pgTable(
  "qc_cube_test_set",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    batchRecordId: uuid("batch_record_id")
      .notNull()
      .references(() => batchRecord.id),
    setNumber: integer("set_number").notNull(),
    ageDays: integer("age_days").notNull(),
    designAgeDays: integer("design_age_days").notNull().default(28),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
    testedAt: timestamp("tested_at", { withTimezone: true }).notNull().defaultNow(),
    // Computed by evaluateCubeTest from this set's specimens — never entered directly.
    averageStrengthMpa: numeric("average_strength_mpa", { precision: 6, scale: 2 }).notNull(),
    // Tri-state: null while ageDays !== designAgeDays (no verdict yet).
    pass: boolean("pass"),
    notes: varchar("notes", { length: 1000 }),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type QCCubeTestSet = typeof qcCubeTestSet.$inferSelect;
export type NewQCCubeTestSet = typeof qcCubeTestSet.$inferInsert;

/** One physical specimen's crush-test result within a cube test set. */
export const qcCubeTestSpecimen = pgTable(
  "qc_cube_test_specimen",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    cubeTestSetId: uuid("cube_test_set_id")
      .notNull()
      .references(() => qcCubeTestSet.id),
    specimenNumber: integer("specimen_number").notNull(),
    strengthMpa: numeric("strength_mpa", { precision: 6, scale: 2 }).notNull(),
    ...auditColumns(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type QCCubeTestSpecimen = typeof qcCubeTestSpecimen.$inferSelect;
export type NewQCCubeTestSpecimen = typeof qcCubeTestSpecimen.$inferInsert;
