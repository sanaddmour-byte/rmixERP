import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  batchRecord,
  mixDesign,
  notification,
  product,
  productionOrder,
  qcCubeTestSet,
  qcCubeTestSpecimen,
  qcFreshTest,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import { evaluateCubeTest, NOTIFICATION_TYPE_REQUIRED_PERMISSION } from "@rmixerp/core";
import { pushForNotification } from "../lib/pushNotifications";
import {
  RecordCubeTestSetBody,
  RecordFreshTestBody,
  type CubeTestTraceabilityDetail,
  type CubeTestTraceabilityItem,
  type QCCubeTestSet,
  type QCCubeTestSpecimen,
  type QCFreshTest,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const qcRouter = Router();
const MODULE = "qc";

type FreshTestRow = typeof qcFreshTest.$inferSelect;
type CubeTestSetRow = typeof qcCubeTestSet.$inferSelect;
type CubeTestSpecimenRow = typeof qcCubeTestSpecimen.$inferSelect;
type BatchRecordRow = typeof batchRecord.$inferSelect;
type ProductionOrderRow = typeof productionOrder.$inferSelect;
type MixDesignRow = typeof mixDesign.$inferSelect;

function freshTestToApi(row: FreshTestRow): QCFreshTest {
  return {
    id: row.id,
    companyId: row.companyId,
    batchRecordId: row.batchRecordId,
    slumpMm: row.slumpMm,
    concreteTemperatureC: row.concreteTemperatureC,
    ambientTemperatureC: row.ambientTemperatureC,
    airContentPercent: row.airContentPercent,
    testedAt: row.testedAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function specimenToApi(row: CubeTestSpecimenRow): QCCubeTestSpecimen {
  return {
    id: row.id,
    companyId: row.companyId,
    cubeTestSetId: row.cubeTestSetId,
    specimenNumber: row.specimenNumber,
    strengthMpa: row.strengthMpa,
  };
}

function cubeTestSetToApi(row: CubeTestSetRow, specimens: CubeTestSpecimenRow[]): QCCubeTestSet {
  return {
    id: row.id,
    companyId: row.companyId,
    batchRecordId: row.batchRecordId,
    setNumber: row.setNumber,
    ageDays: row.ageDays,
    designAgeDays: row.designAgeDays,
    castAt: row.castAt.toISOString(),
    testedAt: row.testedAt.toISOString(),
    averageStrengthMpa: row.averageStrengthMpa,
    pass: row.pass,
    notes: row.notes,
    specimens: specimens.map(specimenToApi),
    createdAt: row.createdAt.toISOString(),
  };
}

function traceabilityToApi(row: CubeTestSetRow, batch: BatchRecordRow, order: ProductionOrderRow, mix: MixDesignRow): CubeTestTraceabilityItem {
  return {
    id: row.id,
    batchRecordId: row.batchRecordId,
    batchNumber: batch.batchNumber,
    productionOrderId: order.id,
    mixDesignId: mix.id,
    mixDesignName: mix.name,
    productId: order.productId,
    branchId: order.branchId,
    ageDays: row.ageDays,
    designAgeDays: row.designAgeDays,
    averageStrengthMpa: row.averageStrengthMpa,
    pass: row.pass,
    castAt: row.castAt.toISOString(),
    testedAt: row.testedAt.toISOString(),
  };
}

async function findActiveBatchWithContext(
  tx: Tx,
  batchId: string,
): Promise<{ batch: BatchRecordRow; order: ProductionOrderRow } | null> {
  const [batch] = await tx.select().from(batchRecord).where(eq(batchRecord.id, batchId));
  if (!batch) return null;
  const [order] = await tx
    .select()
    .from(productionOrder)
    .where(and(eq(productionOrder.id, batch.productionOrderId), isNull(productionOrder.voidedAt)));
  if (!order) return null;
  return { batch, order };
}

qcRouter.get("/batches/:batchId/fresh-tests", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const batchId = paramId(req, "batchId");

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const context = await findActiveBatchWithContext(tx, batchId);
    if (!context) return null;
    return tx.select().from(qcFreshTest).where(eq(qcFreshTest.batchRecordId, batchId)).orderBy(desc(qcFreshTest.testedAt));
  });

  if (!result) {
    res.status(404).json(notFound("Batch"));
    return;
  }
  res.status(200).json(result.map(freshTestToApi));
});

qcRouter.post("/batches/:batchId/fresh-tests", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = RecordFreshTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const batchId = paramId(req, "batchId");

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const context = await findActiveBatchWithContext(tx, batchId);
    if (!context) return null;

    const [row] = await tx
      .insert(qcFreshTest)
      .values({
        companyId: req.auth!.companyId,
        batchRecordId: batchId,
        slumpMm: input.slumpMm,
        concreteTemperatureC: input.concreteTemperatureC ?? null,
        ambientTemperatureC: input.ambientTemperatureC ?? null,
        airContentPercent: input.airContentPercent ?? null,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: context.order.branchId,
      actorUserId: req.auth!.userId,
      entityType: "qc_fresh_test",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  if (!result) {
    res.status(404).json(notFound("Batch"));
    return;
  }
  res.status(201).json(freshTestToApi(result));
});

qcRouter.get("/batches/:batchId/cube-test-sets", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const batchId = paramId(req, "batchId");

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const context = await findActiveBatchWithContext(tx, batchId);
    if (!context) return null;
    const sets = await tx
      .select()
      .from(qcCubeTestSet)
      .where(eq(qcCubeTestSet.batchRecordId, batchId))
      .orderBy(desc(qcCubeTestSet.castAt));
    const specimens =
      sets.length > 0
        ? await tx
            .select()
            .from(qcCubeTestSpecimen)
            .where(inArray(qcCubeTestSpecimen.cubeTestSetId, sets.map((s) => s.id)))
        : [];
    return { sets, specimens };
  });

  if (!result) {
    res.status(404).json(notFound("Batch"));
    return;
  }
  const specimensBySet = new Map<string, CubeTestSpecimenRow[]>();
  for (const s of result.specimens) {
    const arr = specimensBySet.get(s.cubeTestSetId) ?? [];
    arr.push(s);
    specimensBySet.set(s.cubeTestSetId, arr);
  }
  res.status(200).json(result.sets.map((s) => cubeTestSetToApi(s, specimensBySet.get(s.id) ?? [])));
});

qcRouter.post("/batches/:batchId/cube-test-sets", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = RecordCubeTestSetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const batchId = paramId(req, "batchId");

  const specimenStrengths: number[] = [];
  for (const raw of input.specimenStrengthsMpa) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json(validationError({ specimenStrengthsMpa: "each strength must be a non-negative decimal" }));
      return;
    }
    specimenStrengths.push(n);
  }
  const designAgeDays = input.designAgeDays ?? 28;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const context = await findActiveBatchWithContext(tx, batchId);
    if (!context) return null;

    const [productRow] = await tx.select().from(product).where(eq(product.id, context.order.productId));
    const characteristicStrengthMpa = productRow?.characteristicStrengthMpa ?? null;
    if (characteristicStrengthMpa === null) {
      return { kind: "no_characteristic_strength" as const };
    }

    const evaluation = evaluateCubeTest({
      specimenStrengthsMpa: specimenStrengths,
      ageDays: input.ageDays,
      designAgeDays,
      characteristicStrengthMpa,
    });

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(qcCubeTestSet)
      .where(eq(qcCubeTestSet.batchRecordId, batchId));
    const setNumber = (countRow?.count ?? 0) + 1;

    const [newSet] = await tx
      .insert(qcCubeTestSet)
      .values({
        companyId: req.auth!.companyId,
        batchRecordId: batchId,
        setNumber,
        ageDays: input.ageDays,
        designAgeDays,
        ...(input.castAt && { castAt: new Date(input.castAt) }),
        averageStrengthMpa: evaluation.averageStrengthMpa.toFixed(2),
        pass: evaluation.pass,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!newSet) throw new Error("insert returned no row");

    const specimenRows = await tx
      .insert(qcCubeTestSpecimen)
      .values(
        specimenStrengths.map((strength, i) => ({
          companyId: req.auth!.companyId,
          cubeTestSetId: newSet.id,
          specimenNumber: i + 1,
          strengthMpa: strength.toFixed(2),
          createdBy: req.auth!.userId,
        })),
      )
      .returning();

    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: context.order.branchId,
      actorUserId: req.auth!.userId,
      entityType: "qc_cube_test_set",
      entityId: newSet.id,
      action: "create",
      after: newSet,
    });

    if (evaluation.pass === false) {
      await tx
        .update(batchRecord)
        .set({
          qcFlagged: true,
          qcFlagReason: `Failed ${designAgeDays}-day cube test (set #${setNumber}): ${evaluation.averageStrengthMpa.toFixed(2)} MPa average vs ${characteristicStrengthMpa} MPa characteristic strength.`,
          updatedAt: new Date(),
        })
        .where(eq(batchRecord.id, batchId));

      // entityType/entityId point at the production order, not the batch
      // itself — a batch has no standalone screen, only ever appearing
      // embedded in its production order's detail page, so this is what
      // the notification's deep link (packages/core's
      // resolveNotificationRoute) can actually navigate to.
      const [notif] = await tx
        .insert(notification)
        .values({
          companyId: req.auth!.companyId,
          branchId: context.order.branchId,
          type: "qc_cube_test_failed",
          entityType: "production_order",
          entityId: context.order.id,
          message: `Batch #${context.batch.batchNumber} failed its ${designAgeDays}-day cube test: ${evaluation.averageStrengthMpa.toFixed(2)} MPa average vs ${characteristicStrengthMpa} MPa required.`,
        })
        .returning();

      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: context.order.branchId,
        actorUserId: req.auth!.userId,
        entityType: "batch_record",
        entityId: batchId,
        action: "qc_flagged",
        after: notif,
      });

      if (notif) {
        await pushForNotification(tx, {
          companyId: req.auth!.companyId,
          requiredPermission: NOTIFICATION_TYPE_REQUIRED_PERMISSION.qc_cube_test_failed ?? null,
          title: "QC Alert",
          body: notif.message,
          data: { type: notif.type, entityType: notif.entityType, entityId: notif.entityId },
        });
      }
    }

    return { kind: "ok" as const, set: newSet, specimens: specimenRows };
  });

  if (!result) {
    res.status(404).json(notFound("Batch"));
    return;
  }
  if (result.kind === "no_characteristic_strength") {
    res.status(400).json(validationError({ productId: "product has no characteristic strength configured" }));
    return;
  }
  res.status(201).json(cubeTestSetToApi(result.set, result.specimens));
});

qcRouter.get("/qc/cube-test-sets", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const resultFilter = queryString(req, "result");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const passFilter =
      resultFilter === "pass" ? eq(qcCubeTestSet.pass, true) : resultFilter === "fail" ? eq(qcCubeTestSet.pass, false) : resultFilter === "pending" ? isNull(qcCubeTestSet.pass) : undefined;

    const rows = await tx
      .select({ set: qcCubeTestSet, batch: batchRecord, order: productionOrder, mix: mixDesign })
      .from(qcCubeTestSet)
      .innerJoin(batchRecord, eq(qcCubeTestSet.batchRecordId, batchRecord.id))
      .innerJoin(productionOrder, eq(batchRecord.productionOrderId, productionOrder.id))
      .innerJoin(mixDesign, eq(productionOrder.mixDesignId, mixDesign.id))
      .where(and(passFilter, branchId ? eq(productionOrder.branchId, branchId) : undefined))
      .orderBy(desc(qcCubeTestSet.castAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(qcCubeTestSet)
      .innerJoin(batchRecord, eq(qcCubeTestSet.batchRecordId, batchRecord.id))
      .innerJoin(productionOrder, eq(batchRecord.productionOrderId, productionOrder.id))
      .where(and(passFilter, branchId ? eq(productionOrder.branchId, branchId) : undefined));

    return { items: rows.map((r) => traceabilityToApi(r.set, r.batch, r.order, r.mix)), total: countRow?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items, total, pagination));
});

qcRouter.get("/qc/cube-test-sets/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .select({ set: qcCubeTestSet, batch: batchRecord, order: productionOrder, mix: mixDesign })
      .from(qcCubeTestSet)
      .innerJoin(batchRecord, eq(qcCubeTestSet.batchRecordId, batchRecord.id))
      .innerJoin(productionOrder, eq(batchRecord.productionOrderId, productionOrder.id))
      .innerJoin(mixDesign, eq(productionOrder.mixDesignId, mixDesign.id))
      .where(eq(qcCubeTestSet.id, id));
    if (!row) return null;
    const specimens = await tx.select().from(qcCubeTestSpecimen).where(eq(qcCubeTestSpecimen.cubeTestSetId, id));
    return { row, specimens };
  });

  if (!result) {
    res.status(404).json(notFound("Cube test set"));
    return;
  }
  const item: CubeTestTraceabilityDetail = {
    ...traceabilityToApi(result.row.set, result.row.batch, result.row.order, result.row.mix),
    notes: result.row.set.notes,
    specimens: result.specimens.map(specimenToApi),
  };
  res.status(200).json(item);
});
