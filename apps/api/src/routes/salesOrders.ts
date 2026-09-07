import { Router } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  salesOrder,
  salesOrderLine,
  salesOrderLineCharge,
  chargeType,
  customer,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import {
  assertSalesOrderTransition,
  decimalStringToMilliUnits,
  evaluateCreditCheck,
  fils,
  filsToJodString,
  type Fils,
} from "@rmixerp/core";
import {
  CancelSalesOrderBody,
  ConfirmSalesOrderBody,
  CreateQuotationLineBody,
  CreateQuotationLineChargeBody,
  CreateSalesOrderBody,
  UpdateSalesOrderBody,
  VoidQuotationLineBody,
  VoidQuotationLineChargeBody,
  type LineCharge,
  type SalesOrder,
  type SalesOrderLine,
  type SalesOrderWithLines,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { resolveLinePrice } from "../lib/priceResolution";
import { computeChargeAmount, computeHeaderTotals, computeLineBaseAmounts, computeLineTotals } from "../lib/orderTotals";
import { writeAudit } from "../audit";

export const salesOrdersRouter = Router();
const MODULE = "salesOrders";

type SalesOrderRow = typeof salesOrder.$inferSelect;
type SalesOrderLineRow = typeof salesOrderLine.$inferSelect;
type SalesOrderLineChargeRow = typeof salesOrderLineCharge.$inferSelect;

function toApi(row: SalesOrderRow): SalesOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    projectId: row.projectId,
    quotationId: row.quotationId,
    status: row.status,
    notes: row.notes,
    creditCheckPolicy: row.creditCheckPolicy,
    creditCheckOutstandingJod: row.creditCheckOutstandingFils !== null ? filsToJodString(fils(row.creditCheckOutstandingFils)) : null,
    creditCheckExceedsByJod: row.creditCheckExceedsByFils !== null ? filsToJodString(fils(row.creditCheckExceedsByFils)) : null,
    creditOverride: row.creditOverride,
    creditOverrideReason: row.creditOverrideReason,
    creditOverrideBy: row.creditOverrideBy,
    subtotalJod: filsToJodString(fils(row.subtotalFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function chargeToApi(row: SalesOrderLineChargeRow): LineCharge {
  return {
    id: row.id,
    companyId: row.companyId,
    chargeTypeId: row.chargeTypeId,
    calculationMethod: row.calculationMethod,
    quantity: row.quantity,
    amountJod: filsToJodString(fils(row.amountFils)),
    taxRateBasisPoints: row.taxRateBasisPoints,
    taxJod: filsToJodString(fils(row.taxFils)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function lineToApi(row: SalesOrderLineRow, charges: SalesOrderLineChargeRow[]): SalesOrderLine {
  return {
    id: row.id,
    companyId: row.companyId,
    salesOrderId: row.salesOrderId,
    productId: row.productId,
    quantityM3: row.quantityM3,
    priceListId: row.priceListId,
    priceResolutionTier: row.priceResolutionTier,
    concreteUnitPriceJod: filsToJodString(fils(row.concreteUnitPriceFils)),
    deliveryUnitPriceJod: filsToJodString(fils(row.deliveryUnitPriceFils)),
    taxRateBasisPoints: row.taxRateBasisPoints,
    netJod: filsToJodString(fils(row.netFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    charges: charges.map(chargeToApi),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

export async function findActiveSalesOrder(tx: Tx, id: string): Promise<SalesOrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(salesOrder)
    .where(and(eq(salesOrder.id, id), isNull(salesOrder.voidedAt)));
  return row;
}

export async function loadSalesOrderWithLines(tx: Tx, id: string): Promise<SalesOrderWithLines | null> {
  const row = await findActiveSalesOrder(tx, id);
  if (!row) return null;
  const lines = await tx
    .select()
    .from(salesOrderLine)
    .where(and(eq(salesOrderLine.salesOrderId, id), isNull(salesOrderLine.voidedAt)));
  const lineIds = lines.map((l) => l.id);
  const charges =
    lineIds.length > 0
      ? await tx
          .select()
          .from(salesOrderLineCharge)
          .where(and(inArray(salesOrderLineCharge.salesOrderLineId, lineIds), isNull(salesOrderLineCharge.voidedAt)))
      : [];
  const chargesByLine = new Map<string, SalesOrderLineChargeRow[]>();
  for (const c of charges) {
    const arr = chargesByLine.get(c.salesOrderLineId) ?? [];
    arr.push(c);
    chargesByLine.set(c.salesOrderLineId, arr);
  }
  return { ...toApi(row), lines: lines.map((l) => lineToApi(l, chargesByLine.get(l.id) ?? [])) };
}

async function recomputeLine(tx: Tx, lineId: string): Promise<void> {
  const [line] = await tx.select().from(salesOrderLine).where(eq(salesOrderLine.id, lineId));
  if (!line) throw new Error("sales order line not found during recompute");
  const charges = await tx
    .select()
    .from(salesOrderLineCharge)
    .where(and(eq(salesOrderLineCharge.salesOrderLineId, lineId), isNull(salesOrderLineCharge.voidedAt)));
  const base = computeLineBaseAmounts(line);
  const totals = computeLineTotals(base, charges);
  await tx
    .update(salesOrderLine)
    .set({ netFils: totals.netFils, taxFils: totals.taxFils, totalFils: totals.totalFils, updatedAt: new Date() })
    .where(eq(salesOrderLine.id, lineId));
}

async function recomputeHeader(tx: Tx, salesOrderId: string): Promise<void> {
  const lines = await tx
    .select()
    .from(salesOrderLine)
    .where(and(eq(salesOrderLine.salesOrderId, salesOrderId), isNull(salesOrderLine.voidedAt)));
  const totals = computeHeaderTotals(lines);
  await tx
    .update(salesOrder)
    .set({ subtotalFils: totals.subtotalFils, taxFils: totals.taxFils, totalFils: totals.totalFils, updatedAt: new Date() })
    .where(eq(salesOrder.id, salesOrderId));
}

salesOrdersRouter.get("/sales-orders", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const customerId = queryString(req, "customerId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(salesOrder.voidedAt),
      status ? eq(salesOrder.status, status as SalesOrderRow["status"]) : undefined,
      customerId ? eq(salesOrder.customerId, customerId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(salesOrder).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(salesOrder).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

salesOrdersRouter.post("/sales-orders", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateSalesOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(salesOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        customerId: input.customerId,
        projectId: input.projectId ?? null,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json({ ...toApi(created), lines: [] });
});

salesOrdersRouter.get("/sales-orders/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadSalesOrderWithLines(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Sales order"));
    return;
  }
  res.status(200).json(body);
});

salesOrdersRouter.put("/sales-orders/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateSalesOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveSalesOrder(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "draft") return { kind: "invalid_status" as const };

    const [row] = await tx
      .update(salesOrder)
      .set({ ...(input.notes !== undefined && { notes: input.notes }), updatedAt: new Date() })
      .where(eq(salesOrder.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Sales order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "sales order must be in draft status to update" }));
    return;
  }
  res.status(200).json(result.body);
});

salesOrdersRouter.post(
  "/sales-orders/:salesOrderId/lines",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = CreateQuotationLineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const salesOrderId = paramId(req, "salesOrderId");

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveSalesOrder(tx, salesOrderId);
      if (!parent) return { kind: "not_found" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      let quantityMilli: bigint;
      try {
        quantityMilli = decimalStringToMilliUnits(input.quantityM3);
      } catch {
        return { kind: "bad_quantity" as const };
      }
      if (quantityMilli <= 0n) return { kind: "bad_quantity" as const };

      const resolved = await resolveLinePrice(
        tx,
        { branchId: parent.branchId, customerId: parent.customerId, projectId: parent.projectId },
        input.productId,
      );
      if (!resolved) return { kind: "no_price" as const };

      const [lineRow] = await tx
        .insert(salesOrderLine)
        .values({
          companyId: req.auth!.companyId,
          salesOrderId,
          productId: input.productId,
          quantityM3: input.quantityM3,
          priceListId: resolved.priceListId,
          priceResolutionTier: resolved.tier,
          concreteUnitPriceFils: resolved.concreteUnitPriceFils,
          deliveryUnitPriceFils: resolved.deliveryUnitPriceFils,
          taxRateBasisPoints: resolved.taxRateBasisPoints,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!lineRow) throw new Error("insert returned no row");
      await recomputeLine(tx, lineRow.id);
      await recomputeHeader(tx, salesOrderId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "sales_order_line",
        entityId: lineRow.id,
        action: "create",
        after: lineRow,
      });
      return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, salesOrderId))! };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Sales order"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "sales order must be in draft status" }));
      return;
    }
    if (result.kind === "bad_quantity") {
      res.status(400).json(validationError({ quantityM3: "must be a positive decimal with at most 3 decimal places" }));
      return;
    }
    if (result.kind === "no_price") {
      res.status(400).json(validationError({ productId: "no price is configured for this product" }));
      return;
    }
    res.status(201).json(result.body);
  },
);

salesOrdersRouter.delete(
  "/sales-orders/:salesOrderId/lines/:id",
  requireAuth,
  requirePermission(MODULE, "void"),
  async (req, res) => {
    const parsed = VoidQuotationLineBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const salesOrderId = paramId(req, "salesOrderId");
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveSalesOrder(tx, salesOrderId);
      if (!parent) return { kind: "not_found_order" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [before] = await tx
        .select()
        .from(salesOrderLine)
        .where(
          and(eq(salesOrderLine.id, id), eq(salesOrderLine.salesOrderId, salesOrderId), isNull(salesOrderLine.voidedAt)),
        );
      if (!before) return { kind: "not_found_line" as const };

      const [row] = await tx
        .update(salesOrderLine)
        .set({ voidedAt: new Date() })
        .where(eq(salesOrderLine.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await recomputeHeader(tx, salesOrderId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "sales_order_line",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, salesOrderId))! };
    });

    if (result.kind === "not_found_order") {
      res.status(404).json(notFound("Sales order"));
      return;
    }
    if (result.kind === "not_found_line") {
      res.status(404).json(notFound("Sales order line"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "sales order must be in draft status" }));
      return;
    }
    res.status(200).json(result.body);
  },
);

salesOrdersRouter.post(
  "/sales-orders/:salesOrderId/lines/:lineId/charges",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = CreateQuotationLineChargeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const salesOrderId = paramId(req, "salesOrderId");
    const lineId = paramId(req, "lineId");

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveSalesOrder(tx, salesOrderId);
      if (!parent) return { kind: "not_found_order" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [line] = await tx
        .select()
        .from(salesOrderLine)
        .where(
          and(eq(salesOrderLine.id, lineId), eq(salesOrderLine.salesOrderId, salesOrderId), isNull(salesOrderLine.voidedAt)),
        );
      if (!line) return { kind: "not_found_line" as const };

      const [ct] = await tx
        .select()
        .from(chargeType)
        .where(and(eq(chargeType.id, input.chargeTypeId), isNull(chargeType.voidedAt)));
      if (!ct) return { kind: "not_found_charge_type" as const };
      if (ct.calculationMethod !== "percentage" && ct.defaultAmountFils === null) {
        return { kind: "unconfigured_charge_type" as const };
      }
      if (ct.calculationMethod === "percentage" && ct.percentageBasisPoints === null) {
        return { kind: "unconfigured_charge_type" as const };
      }
      if (ct.calculationMethod === "per_unit" && !input.quantity) {
        return { kind: "missing_quantity" as const };
      }

      const base = computeLineBaseAmounts(line);
      const lineNetBeforeCharges: Fils = fils(base.concreteNetFils + base.deliveryNetFils);
      const { amountFils, taxFils } = computeChargeAmount(ct, input.quantity ?? null, lineNetBeforeCharges);

      const [chargeRow] = await tx
        .insert(salesOrderLineCharge)
        .values({
          companyId: req.auth!.companyId,
          salesOrderLineId: lineId,
          chargeTypeId: ct.id,
          calculationMethod: ct.calculationMethod,
          quantity: input.quantity ?? null,
          amountFils,
          taxRateBasisPoints: ct.taxRateBasisPoints,
          taxFils,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!chargeRow) throw new Error("insert returned no row");
      await recomputeLine(tx, lineId);
      await recomputeHeader(tx, salesOrderId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "sales_order_line_charge",
        entityId: chargeRow.id,
        action: "create",
        after: chargeRow,
      });
      return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, salesOrderId))! };
    });

    switch (result.kind) {
      case "not_found_order":
        res.status(404).json(notFound("Sales order"));
        return;
      case "not_found_line":
        res.status(404).json(notFound("Sales order line"));
        return;
      case "not_found_charge_type":
        res.status(404).json(notFound("Charge type"));
        return;
      case "invalid_status":
        res.status(400).json(validationError({ status: "sales order must be in draft status" }));
        return;
      case "unconfigured_charge_type":
        res.status(400).json(validationError({ chargeTypeId: "charge type is missing its rate configuration" }));
        return;
      case "missing_quantity":
        res.status(400).json(validationError({ quantity: "required for a per_unit charge type" }));
        return;
      case "ok":
        res.status(201).json(result.body);
    }
  },
);

salesOrdersRouter.delete(
  "/sales-orders/:salesOrderId/lines/:lineId/charges/:id",
  requireAuth,
  requirePermission(MODULE, "void"),
  async (req, res) => {
    const parsed = VoidQuotationLineChargeBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const salesOrderId = paramId(req, "salesOrderId");
    const lineId = paramId(req, "lineId");
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveSalesOrder(tx, salesOrderId);
      if (!parent) return { kind: "not_found_order" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [before] = await tx
        .select()
        .from(salesOrderLineCharge)
        .where(
          and(
            eq(salesOrderLineCharge.id, id),
            eq(salesOrderLineCharge.salesOrderLineId, lineId),
            isNull(salesOrderLineCharge.voidedAt),
          ),
        );
      if (!before) return { kind: "not_found_charge" as const };

      const [row] = await tx
        .update(salesOrderLineCharge)
        .set({ voidedAt: new Date() })
        .where(eq(salesOrderLineCharge.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await recomputeLine(tx, lineId);
      await recomputeHeader(tx, salesOrderId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "sales_order_line_charge",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, salesOrderId))! };
    });

    if (result.kind === "not_found_order") {
      res.status(404).json(notFound("Sales order"));
      return;
    }
    if (result.kind === "not_found_charge") {
      res.status(404).json(notFound("Charge"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "sales order must be in draft status" }));
      return;
    }
    res.status(200).json(result.body);
  },
);

salesOrdersRouter.post("/sales-orders/:id/confirm", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = ConfirmSalesOrderBody.safeParse(req.body ?? {});
  const override = parsed.success ? (parsed.data.override ?? null) : null;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveSalesOrder(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "draft") return { kind: "invalid_status" as const };
    assertSalesOrderTransition(before.status, "confirmed");

    const lineCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(salesOrderLine)
      .where(and(eq(salesOrderLine.salesOrderId, id), isNull(salesOrderLine.voidedAt)));
    if ((lineCount[0]?.count ?? 0) === 0) return { kind: "no_lines" as const };

    const [cust] = await tx.select().from(customer).where(eq(customer.id, before.customerId));
    if (!cust) throw new Error("sales order references a missing customer");

    const [outstandingRow] = await tx
      .select({ outstanding: sql<string>`coalesce(sum(${salesOrder.totalFils}), 0)` })
      .from(salesOrder)
      .where(
        and(
          eq(salesOrder.customerId, before.customerId),
          inArray(salesOrder.status, ["confirmed", "fulfilled"]),
          isNull(salesOrder.voidedAt),
          sql`${salesOrder.id} <> ${id}`,
        ),
      );

    const creditCheck = evaluateCreditCheck({
      policy: cust.creditPolicy,
      creditLimitFils: fils(cust.creditLimitFils),
      currentOutstandingFils: fils(BigInt(outstandingRow?.outstanding ?? "0")),
      newOrderAmountFils: fils(before.totalFils),
    });

    if (creditCheck.outcome === "blocked" && !override) {
      return { kind: "blocked" as const, creditCheck };
    }

    let appliedOverride = false;
    if (creditCheck.outcome === "blocked" && override) {
      if (!(req.auth!.permissions ?? []).includes(`${MODULE}:approve`)) {
        return { kind: "override_forbidden" as const };
      }
      appliedOverride = true;
    }

    const [row] = await tx
      .update(salesOrder)
      .set({
        status: "confirmed",
        creditCheckPolicy: cust.creditPolicy,
        creditCheckOutstandingFils: creditCheck.projectedOutstandingFils,
        creditCheckExceedsByFils: creditCheck.exceedsByFils,
        creditOverride: appliedOverride,
        creditOverrideReason: appliedOverride ? (override?.reason ?? null) : null,
        creditOverrideBy: appliedOverride ? req.auth!.userId : null,
        updatedAt: new Date(),
      })
      .where(eq(salesOrder.id, id))
      .returning();
    if (!row) throw new Error("confirm returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: row.id,
      action: "transition:confirmed",
      before,
      after: row,
    });
    if (appliedOverride) {
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "sales_order",
        entityId: row.id,
        action: "credit_override",
        before,
        after: row,
        reason: override?.reason ?? null,
      });
    }
    return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, id))! };
  });

  switch (result.kind) {
    case "not_found":
      res.status(404).json(notFound("Sales order"));
      return;
    case "invalid_status":
      res.status(400).json(validationError({ status: "sales order must be in draft status" }));
      return;
    case "no_lines":
      res.status(400).json(validationError({ lines: "sales order has no lines" }));
      return;
    case "override_forbidden":
      res.status(403).json({ error: { message: `Missing permission ${MODULE}:approve`, code: "forbidden" } });
      return;
    case "blocked":
      res.status(409).json({
        error: {
          message: "Order exceeds the customer's credit limit",
          code: "credit_blocked",
          details: {
            outcome: result.creditCheck.outcome,
            projectedOutstandingJod: filsToJodString(result.creditCheck.projectedOutstandingFils),
            exceedsByJod: filsToJodString(result.creditCheck.exceedsByFils),
          },
        },
      });
      return;
    case "ok":
      res.status(200).json(result.body);
  }
});

salesOrdersRouter.post("/sales-orders/:id/cancel", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = CancelSalesOrderBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveSalesOrder(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "draft" && before.status !== "confirmed") return { kind: "invalid_status" as const };
    assertSalesOrderTransition(before.status, "cancelled");

    const [row] = await tx
      .update(salesOrder)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(salesOrder.id, id))
      .returning();
    if (!row) throw new Error("cancel returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: row.id,
      action: "transition:cancelled",
      before,
      after: row,
      reason,
    });
    return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Sales order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "sales order must be in draft or confirmed status" }));
    return;
  }
  res.status(200).json(result.body);
});

salesOrdersRouter.post("/sales-orders/:id/fulfill", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveSalesOrder(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "confirmed") return { kind: "invalid_status" as const };
    assertSalesOrderTransition(before.status, "fulfilled");

    const [row] = await tx
      .update(salesOrder)
      .set({ status: "fulfilled", updatedAt: new Date() })
      .where(eq(salesOrder.id, id))
      .returning();
    if (!row) throw new Error("fulfill returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: row.id,
      action: "transition:fulfilled",
      before,
      after: row,
    });
    return { kind: "ok" as const, body: (await loadSalesOrderWithLines(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Sales order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "sales order must be in confirmed status" }));
    return;
  }
  res.status(200).json(result.body);
});
