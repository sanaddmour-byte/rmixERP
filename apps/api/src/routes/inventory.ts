import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { stockAdjustment, stockBalance, withTenant, type Tx } from "@rmixerp/db";
import { applyStockReceipt, decimalStringToMilliUnits, fils, filsToJodString, jodStringToFils, milliUnitsToDecimalString } from "@rmixerp/core";
import { CreateStockAdjustmentBody, type StockAdjustment, type StockBalance } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { validationError } from "../lib/errors";
import { queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const inventoryRouter = Router();
const MODULE = "inventory";

type StockBalanceRow = typeof stockBalance.$inferSelect;
type StockAdjustmentRow = typeof stockAdjustment.$inferSelect;

function balanceToApi(row: StockBalanceRow): StockBalance {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    rawMaterialId: row.rawMaterialId,
    quantityOnHand: row.quantityOnHand,
    averageCostJod: filsToJodString(fils(row.averageCostFils)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function adjustmentToApi(row: StockAdjustmentRow): StockAdjustment {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    rawMaterialId: row.rawMaterialId,
    quantityDelta: row.quantityDelta,
    unitCostJod: row.unitCostFils !== null ? filsToJodString(fils(row.unitCostFils)) : null,
    resultingQuantityOnHand: row.resultingQuantityOnHand,
    resultingAverageCostJod: filsToJodString(fils(row.resultingAverageCostFils)),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Finds or lazily creates (at zero) the stock balance row for a branch + raw material. */
async function findOrCreateBalance(tx: Tx, companyId: string, branchId: string, rawMaterialId: string): Promise<StockBalanceRow> {
  const [existing] = await tx
    .select()
    .from(stockBalance)
    .where(and(eq(stockBalance.branchId, branchId), eq(stockBalance.rawMaterialId, rawMaterialId)));
  if (existing) return existing;

  const [row] = await tx
    .insert(stockBalance)
    .values({ companyId, branchId, rawMaterialId, quantityOnHand: "0", averageCostFils: 0n })
    .onConflictDoNothing()
    .returning();
  if (row) return row;

  const [race] = await tx
    .select()
    .from(stockBalance)
    .where(and(eq(stockBalance.branchId, branchId), eq(stockBalance.rawMaterialId, rawMaterialId)));
  if (!race) throw new Error("failed to find or create stock balance");
  return race;
}

inventoryRouter.get("/stock-balances", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const branchId = queryString(req, "branchId");
  const rawMaterialId = queryString(req, "rawMaterialId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      branchId ? eq(stockBalance.branchId, branchId) : undefined,
      rawMaterialId ? eq(stockBalance.rawMaterialId, rawMaterialId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(stockBalance).where(where).orderBy(desc(stockBalance.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(stockBalance).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(balanceToApi), total, pagination));
});

inventoryRouter.get("/stock-adjustments", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const branchId = queryString(req, "branchId");
  const rawMaterialId = queryString(req, "rawMaterialId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      branchId ? eq(stockAdjustment.branchId, branchId) : undefined,
      rawMaterialId ? eq(stockAdjustment.rawMaterialId, rawMaterialId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(stockAdjustment).where(where).orderBy(desc(stockAdjustment.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(stockAdjustment).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(adjustmentToApi), total, pagination));
});

inventoryRouter.post("/stock-adjustments", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateStockAdjustmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  let deltaMilli: bigint;
  try {
    deltaMilli = decimalStringToMilliUnits(input.quantityDelta);
  } catch {
    res.status(400).json(validationError({ quantityDelta: "must be a decimal with at most 3 decimal places" }));
    return;
  }
  if (deltaMilli === 0n) {
    res.status(400).json(validationError({ quantityDelta: "must not be zero" }));
    return;
  }
  if (deltaMilli > 0n && !input.unitCostJod) {
    res.status(400).json(validationError({ unitCostJod: "required for a positive (receipt) adjustment" }));
    return;
  }

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const balance = await findOrCreateBalance(tx, req.auth!.companyId, input.branchId, input.rawMaterialId);

    let nextQuantityMilli: bigint;
    let nextAverageCostFils: bigint;
    let unitCostFils: bigint | null = null;

    if (deltaMilli > 0n) {
      unitCostFils = jodStringToFils(input.unitCostJod!);
      const result = applyStockReceipt(
        { quantityMilliUnits: decimalStringToMilliUnits(balance.quantityOnHand), averageCostFils: fils(balance.averageCostFils) },
        deltaMilli,
        fils(unitCostFils),
      );
      nextQuantityMilli = result.quantityMilliUnits;
      nextAverageCostFils = result.averageCostFils;
    } else {
      nextQuantityMilli = decimalStringToMilliUnits(balance.quantityOnHand) + deltaMilli;
      nextAverageCostFils = balance.averageCostFils;
    }

    const [updatedBalance] = await tx
      .update(stockBalance)
      .set({
        quantityOnHand: milliUnitsToDecimalString(nextQuantityMilli),
        averageCostFils: nextAverageCostFils,
        updatedAt: new Date(),
      })
      .where(eq(stockBalance.id, balance.id))
      .returning();
    if (!updatedBalance) throw new Error("update returned no row");

    const [row] = await tx
      .insert(stockAdjustment)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        rawMaterialId: input.rawMaterialId,
        quantityDelta: input.quantityDelta,
        unitCostFils,
        resultingQuantityOnHand: updatedBalance.quantityOnHand,
        resultingAverageCostFils: updatedBalance.averageCostFils,
        reason: input.reason ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: input.branchId,
      actorUserId: req.auth!.userId,
      entityType: "stock_adjustment",
      entityId: row.id,
      action: "create",
      after: row,
      reason: input.reason ?? null,
    });
    return row;
  });

  res.status(201).json(adjustmentToApi(created));
});
