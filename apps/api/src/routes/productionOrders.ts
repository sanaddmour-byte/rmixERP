import { Router } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  batchRecord,
  materialConsumption,
  mixDesignIngredient,
  productionOrder,
  returnedConcrete,
  stockBalance,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import {
  applyStockConsumption,
  applyUniformMoistureAdjustment,
  assertProductionOrderTransition,
  computeYieldVariance,
  decimalStringToMilliUnits,
  fils,
  filsToJodString,
  milliUnitsToDecimalString,
  mulFilsRoundHalfUp,
  type Fils,
} from "@rmixerp/core";
import {
  CancelProductionOrderBody,
  CreateProductionOrderBody,
  RecordBatchBody,
  RecordReturnedConcreteBody,
  UpdateProductionOrderBody,
  type BatchRecord,
  type MaterialConsumption,
  type ProductionOrder,
  type ProductionOrderWithBatches,
  type ReturnedConcrete,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const productionOrdersRouter = Router();
const MODULE = "productionOrders";

type ProductionOrderRow = typeof productionOrder.$inferSelect;
type BatchRecordRow = typeof batchRecord.$inferSelect;
type MaterialConsumptionRow = typeof materialConsumption.$inferSelect;
type ReturnedConcreteRow = typeof returnedConcrete.$inferSelect;

function toApi(row: ProductionOrderRow): ProductionOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    productId: row.productId,
    mixDesignId: row.mixDesignId,
    salesOrderId: row.salesOrderId,
    plannedQuantityM3: row.plannedQuantityM3,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function consumptionToApi(row: MaterialConsumptionRow): MaterialConsumption {
  return {
    id: row.id,
    companyId: row.companyId,
    batchRecordId: row.batchRecordId,
    rawMaterialId: row.rawMaterialId,
    mixDesignQuantityPerM3: row.mixDesignQuantityPerM3,
    quantityConsumed: row.quantityConsumed,
    unitCostJod: filsToJodString(fils(row.unitCostFils)),
    totalCostJod: filsToJodString(fils(row.totalCostFils)),
    wentNegative: row.wentNegative,
    createdAt: row.createdAt.toISOString(),
  };
}

function batchToApi(row: BatchRecordRow, consumptions: MaterialConsumptionRow[]): BatchRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    productionOrderId: row.productionOrderId,
    batchNumber: row.batchNumber,
    targetQuantityM3: row.targetQuantityM3,
    actualQuantityM3: row.actualQuantityM3,
    moistureAdjustmentBasisPoints: row.moistureAdjustmentBasisPoints,
    batchedAt: row.batchedAt.toISOString(),
    consumptions: consumptions.map(consumptionToApi),
    createdAt: row.createdAt.toISOString(),
  };
}

function returnToApi(row: ReturnedConcreteRow): ReturnedConcrete {
  return {
    id: row.id,
    companyId: row.companyId,
    productionOrderId: row.productionOrderId,
    quantityM3: row.quantityM3,
    reason: row.reason,
    returnedAt: row.returnedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findActiveProductionOrder(tx: Tx, id: string): Promise<ProductionOrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(productionOrder)
    .where(and(eq(productionOrder.id, id), isNull(productionOrder.voidedAt)));
  return row;
}

export async function loadProductionOrderWithBatches(tx: Tx, id: string): Promise<ProductionOrderWithBatches | null> {
  const row = await findActiveProductionOrder(tx, id);
  if (!row) return null;

  const batches = await tx.select().from(batchRecord).where(eq(batchRecord.productionOrderId, id));
  const batchIds = batches.map((b) => b.id);
  const consumptions =
    batchIds.length > 0
      ? await tx.select().from(materialConsumption).where(inArray(materialConsumption.batchRecordId, batchIds))
      : [];
  const consumptionsByBatch = new Map<string, MaterialConsumptionRow[]>();
  for (const c of consumptions) {
    const arr = consumptionsByBatch.get(c.batchRecordId) ?? [];
    arr.push(c);
    consumptionsByBatch.set(c.batchRecordId, arr);
  }
  const returns = await tx.select().from(returnedConcrete).where(eq(returnedConcrete.productionOrderId, id));

  return {
    ...toApi(row),
    batches: batches.map((b) => batchToApi(b, consumptionsByBatch.get(b.id) ?? [])),
    returns: returns.map(returnToApi),
  };
}

productionOrdersRouter.get("/production-orders", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(productionOrder.voidedAt),
      status ? eq(productionOrder.status, status as ProductionOrderRow["status"]) : undefined,
      branchId ? eq(productionOrder.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(productionOrder).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(productionOrder).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

productionOrdersRouter.post("/production-orders", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateProductionOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(productionOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        productId: input.productId,
        mixDesignId: input.mixDesignId,
        salesOrderId: input.salesOrderId ?? null,
        plannedQuantityM3: input.plannedQuantityM3,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: input.branchId,
      actorUserId: req.auth!.userId,
      entityType: "production_order",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json({ ...toApi(created), batches: [], returns: [] });
});

productionOrdersRouter.get("/production-orders/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Production order"));
    return;
  }
  res.status(200).json(body);
});

productionOrdersRouter.put("/production-orders/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateProductionOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveProductionOrder(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(productionOrder)
      .set({ ...(input.notes !== undefined && { notes: input.notes }), updatedAt: new Date() })
      .where(eq(productionOrder.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "production_order",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return true;
  });

  if (!result) {
    res.status(404).json(notFound("Production order"));
    return;
  }
  res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, id)))!);
});

productionOrdersRouter.post(
  "/production-orders/:id/complete",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveProductionOrder(tx, id);
      if (!before) return { kind: "not_found" as const };
      if (before.status !== "in_progress") return { kind: "invalid_status" as const };

      const [batchCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(batchRecord)
        .where(eq(batchRecord.productionOrderId, id));
      if ((batchCount?.count ?? 0) === 0) return { kind: "no_batches" as const };

      assertProductionOrderTransition(before.status, "completed");
      const [row] = await tx
        .update(productionOrder)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(productionOrder.id, id))
        .returning();
      if (!row) throw new Error("complete returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "production_order",
        entityId: row.id,
        action: "transition:completed",
        before,
        after: row,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Production order"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "production order must be in_progress" }));
      return;
    }
    if (result.kind === "no_batches") {
      res.status(400).json(validationError({ batches: "production order needs at least one batch to complete" }));
      return;
    }
    res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, id)))!);
  },
);

productionOrdersRouter.post(
  "/production-orders/:id/cancel",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = CancelProductionOrderBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveProductionOrder(tx, id);
      if (!before) return { kind: "not_found" as const };
      if (before.status !== "planned" && before.status !== "in_progress") return { kind: "invalid_status" as const };

      assertProductionOrderTransition(before.status, "cancelled");
      const [row] = await tx
        .update(productionOrder)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(productionOrder.id, id))
        .returning();
      if (!row) throw new Error("cancel returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "production_order",
        entityId: row.id,
        action: "transition:cancelled",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Production order"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "production order must be planned or in_progress" }));
      return;
    }
    res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, id)))!);
  },
);

productionOrdersRouter.post(
  "/production-orders/:id/batches",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = RecordBatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    let targetMilli: bigint;
    let actualMilli: bigint;
    try {
      targetMilli = decimalStringToMilliUnits(input.targetQuantityM3);
      actualMilli = decimalStringToMilliUnits(input.actualQuantityM3);
    } catch {
      res.status(400).json(validationError({ quantity: "quantities must be decimals with at most 3 decimal places" }));
      return;
    }
    if (targetMilli <= 0n || actualMilli <= 0n) {
      res.status(400).json(validationError({ quantity: "quantities must be positive" }));
      return;
    }
    const moistureBasisPoints = input.moistureAdjustmentBasisPoints ?? 0;

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const order = await findActiveProductionOrder(tx, id);
      if (!order) return { kind: "not_found" as const };
      if (order.status !== "planned" && order.status !== "in_progress") return { kind: "invalid_status" as const };

      const ingredients = await tx
        .select()
        .from(mixDesignIngredient)
        .where(and(eq(mixDesignIngredient.mixDesignId, order.mixDesignId), isNull(mixDesignIngredient.voidedAt)));
      if (ingredients.length === 0) return { kind: "no_ingredients" as const };

      interface Planned {
        rawMaterialId: string;
        mixDesignQuantityPerM3: string;
        quantityConsumedMilli: bigint;
        balanceId: string;
        balanceQuantityMilli: bigint;
        balanceAverageCostFils: Fils;
      }
      const planned: Planned[] = [];
      for (const ingredient of ingredients) {
        const recipeMilli = decimalStringToMilliUnits(ingredient.quantityPerM3);
        const baseMilli = mulFilsRoundHalfUp(fils(recipeMilli), actualMilli, 1000n);
        const adjustedMilli = applyUniformMoistureAdjustment(baseMilli, moistureBasisPoints);

        let [balance] = await tx
          .select()
          .from(stockBalance)
          .where(and(eq(stockBalance.branchId, order.branchId), eq(stockBalance.rawMaterialId, ingredient.rawMaterialId)));
        if (!balance) {
          const [createdBalance] = await tx
            .insert(stockBalance)
            .values({
              companyId: req.auth!.companyId,
              branchId: order.branchId,
              rawMaterialId: ingredient.rawMaterialId,
              quantityOnHand: "0",
              averageCostFils: 0n,
            })
            .onConflictDoNothing()
            .returning();
          balance =
            createdBalance ??
            (
              await tx
                .select()
                .from(stockBalance)
                .where(and(eq(stockBalance.branchId, order.branchId), eq(stockBalance.rawMaterialId, ingredient.rawMaterialId)))
            )[0];
        }
        if (!balance) throw new Error("failed to find or create stock balance");

        planned.push({
          rawMaterialId: ingredient.rawMaterialId,
          mixDesignQuantityPerM3: ingredient.quantityPerM3,
          quantityConsumedMilli: adjustedMilli,
          balanceId: balance.id,
          balanceQuantityMilli: decimalStringToMilliUnits(balance.quantityOnHand),
          balanceAverageCostFils: fils(balance.averageCostFils),
        });
      }

      const wouldGoNegative = planned.filter(
        (p) => applyStockConsumption({ quantityMilliUnits: p.balanceQuantityMilli, averageCostFils: p.balanceAverageCostFils }, p.quantityConsumedMilli, true).wentNegative,
      );

      if (wouldGoNegative.length > 0 && !input.override) {
        return { kind: "blocked" as const, rawMaterialIds: wouldGoNegative.map((p) => p.rawMaterialId) };
      }
      let appliedOverride = false;
      if (wouldGoNegative.length > 0 && input.override) {
        if (!(req.auth!.permissions ?? []).includes(`${MODULE}:approve`)) {
          return { kind: "override_forbidden" as const };
        }
        appliedOverride = true;
      }

      const [batchCountRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(batchRecord)
        .where(eq(batchRecord.productionOrderId, id));
      const batchNumber = (batchCountRow?.count ?? 0) + 1;

      const [newBatch] = await tx
        .insert(batchRecord)
        .values({
          companyId: req.auth!.companyId,
          productionOrderId: id,
          batchNumber,
          targetQuantityM3: input.targetQuantityM3,
          actualQuantityM3: input.actualQuantityM3,
          moistureAdjustmentBasisPoints: moistureBasisPoints,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!newBatch) throw new Error("insert returned no row");

      for (const p of planned) {
        const consumption = applyStockConsumption(
          { quantityMilliUnits: p.balanceQuantityMilli, averageCostFils: p.balanceAverageCostFils },
          p.quantityConsumedMilli,
          true,
        );
        await tx
          .update(stockBalance)
          .set({ quantityOnHand: milliUnitsToDecimalString(consumption.state.quantityMilliUnits), updatedAt: new Date() })
          .where(eq(stockBalance.id, p.balanceId));

        const [consumptionRow] = await tx
          .insert(materialConsumption)
          .values({
            companyId: req.auth!.companyId,
            batchRecordId: newBatch.id,
            rawMaterialId: p.rawMaterialId,
            mixDesignQuantityPerM3: p.mixDesignQuantityPerM3,
            quantityConsumed: milliUnitsToDecimalString(p.quantityConsumedMilli),
            unitCostFils: p.balanceAverageCostFils,
            totalCostFils: consumption.costFils,
            wentNegative: consumption.wentNegative,
            createdBy: req.auth!.userId,
          })
          .returning();
        if (!consumptionRow) throw new Error("insert returned no row");
      }

      if (order.status === "planned") {
        assertProductionOrderTransition("planned", "in_progress");
        await tx.update(productionOrder).set({ status: "in_progress", updatedAt: new Date() }).where(eq(productionOrder.id, id));
      }

      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: order.branchId,
        actorUserId: req.auth!.userId,
        entityType: "batch_record",
        entityId: newBatch.id,
        action: "create",
        after: newBatch,
      });
      if (appliedOverride) {
        await writeAudit(tx, {
          companyId: req.auth!.companyId,
          branchId: order.branchId,
          actorUserId: req.auth!.userId,
          entityType: "batch_record",
          entityId: newBatch.id,
          action: "negative_stock_override",
          reason: input.override?.reason ?? null,
        });
      }

      return { kind: "ok" as const };
    });

    switch (result.kind) {
      case "not_found":
        res.status(404).json(notFound("Production order"));
        return;
      case "invalid_status":
        res.status(400).json(validationError({ status: "production order must be planned or in_progress" }));
        return;
      case "no_ingredients":
        res.status(400).json(validationError({ mixDesignId: "mix design has no ingredients configured" }));
        return;
      case "override_forbidden":
        res.status(403).json({ error: { message: `Missing permission ${MODULE}:approve`, code: "forbidden" } });
        return;
      case "blocked":
        res.status(409).json({
          error: {
            message: "Batch would take one or more raw materials' stock negative",
            code: "negative_stock_blocked",
            details: { rawMaterialIds: result.rawMaterialIds },
          },
        });
        return;
      case "ok":
        res.status(201).json((await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, id)))!);
    }
  },
);

productionOrdersRouter.post(
  "/production-orders/:id/returns",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = RecordReturnedConcreteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const order = await findActiveProductionOrder(tx, id);
      if (!order) return null;

      const [row] = await tx
        .insert(returnedConcrete)
        .values({
          companyId: req.auth!.companyId,
          productionOrderId: id,
          quantityM3: input.quantityM3,
          reason: input.reason ?? null,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: order.branchId,
        actorUserId: req.auth!.userId,
        entityType: "returned_concrete",
        entityId: row.id,
        action: "create",
        after: row,
      });
      return true;
    });

    if (!result) {
      res.status(404).json(notFound("Production order"));
      return;
    }
    res.status(201).json((await withTenant(db, req.auth!.companyId, (tx) => loadProductionOrderWithBatches(tx, id)))!);
  },
);

productionOrdersRouter.get(
  "/production-orders/:id/yield-variance",
  requireAuth,
  requirePermission(MODULE, "view"),
  async (req, res) => {
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const order = await findActiveProductionOrder(tx, id);
      if (!order) return null;

      const batches = await tx.select().from(batchRecord).where(eq(batchRecord.productionOrderId, id));
      const returns = await tx.select().from(returnedConcrete).where(eq(returnedConcrete.productionOrderId, id));

      const batchedM3Milli = batches.reduce((sum, b) => sum + decimalStringToMilliUnits(b.actualQuantityM3), 0n);
      const returnedM3Milli = returns.reduce((sum, r) => sum + decimalStringToMilliUnits(r.quantityM3), 0n);

      return computeYieldVariance({ batchedM3Milli, returnedM3Milli, deliveredM3Milli: null });
    });

    if (!result) {
      res.status(404).json(notFound("Production order"));
      return;
    }
    res.status(200).json({
      netProducedM3: milliUnitsToDecimalString(result.netProducedM3Milli),
      deliveryVarianceM3: result.deliveryVarianceM3Milli === null ? null : milliUnitsToDecimalString(result.deliveryVarianceM3Milli),
    });
  },
);
