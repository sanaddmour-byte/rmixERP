import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  quotation,
  quotationLine,
  quotationLineCharge,
  chargeType,
  salesOrder,
  salesOrderLine,
  salesOrderLineCharge,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import { assertQuotationTransition, decimalStringToMilliUnits, fils, filsToJodString, type Fils } from "@rmixerp/core";
import {
  CreateQuotationBody,
  CreateQuotationLineBody,
  CreateQuotationLineChargeBody,
  RejectQuotationBody,
  UpdateQuotationBody,
  VoidQuotationLineBody,
  VoidQuotationLineChargeBody,
  type LineCharge,
  type Quotation,
  type QuotationLine,
  type QuotationWithLines,
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
import { loadSalesOrderWithLines } from "./salesOrders";

export const quotationsRouter = Router();
const MODULE = "quotations";

type QuotationRow = typeof quotation.$inferSelect;
type QuotationLineRow = typeof quotationLine.$inferSelect;
type QuotationLineChargeRow = typeof quotationLineCharge.$inferSelect;

function toApi(row: QuotationRow): Quotation {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    projectId: row.projectId,
    status: row.status,
    validUntil: row.validUntil?.toISOString() ?? null,
    notes: row.notes,
    subtotalJod: filsToJodString(fils(row.subtotalFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function chargeToApi(row: QuotationLineChargeRow): LineCharge {
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

function lineToApi(row: QuotationLineRow, charges: QuotationLineChargeRow[]): QuotationLine {
  return {
    id: row.id,
    companyId: row.companyId,
    quotationId: row.quotationId,
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

export async function findActiveQuotation(tx: Tx, id: string): Promise<QuotationRow | undefined> {
  const [row] = await tx
    .select()
    .from(quotation)
    .where(and(eq(quotation.id, id), isNull(quotation.voidedAt)));
  return row;
}

export async function loadQuotationWithLines(tx: Tx, id: string): Promise<QuotationWithLines | null> {
  const row = await findActiveQuotation(tx, id);
  if (!row) return null;
  const lines = await tx
    .select()
    .from(quotationLine)
    .where(and(eq(quotationLine.quotationId, id), isNull(quotationLine.voidedAt)));
  const lineIds = lines.map((l) => l.id);
  const charges =
    lineIds.length > 0
      ? await tx
          .select()
          .from(quotationLineCharge)
          .where(and(inArray(quotationLineCharge.quotationLineId, lineIds), isNull(quotationLineCharge.voidedAt)))
      : [];
  const chargesByLine = new Map<string, QuotationLineChargeRow[]>();
  for (const c of charges) {
    const arr = chargesByLine.get(c.quotationLineId) ?? [];
    arr.push(c);
    chargesByLine.set(c.quotationLineId, arr);
  }
  return { ...toApi(row), lines: lines.map((l) => lineToApi(l, chargesByLine.get(l.id) ?? [])) };
}

async function recomputeLine(tx: Tx, lineId: string): Promise<void> {
  const [line] = await tx.select().from(quotationLine).where(eq(quotationLine.id, lineId));
  if (!line) throw new Error("quotation line not found during recompute");
  const charges = await tx
    .select()
    .from(quotationLineCharge)
    .where(and(eq(quotationLineCharge.quotationLineId, lineId), isNull(quotationLineCharge.voidedAt)));
  const base = computeLineBaseAmounts(line);
  const totals = computeLineTotals(base, charges);
  await tx
    .update(quotationLine)
    .set({ netFils: totals.netFils, taxFils: totals.taxFils, totalFils: totals.totalFils, updatedAt: new Date() })
    .where(eq(quotationLine.id, lineId));
}

async function recomputeHeader(tx: Tx, quotationId: string): Promise<void> {
  const lines = await tx
    .select()
    .from(quotationLine)
    .where(and(eq(quotationLine.quotationId, quotationId), isNull(quotationLine.voidedAt)));
  const totals = computeHeaderTotals(lines);
  await tx
    .update(quotation)
    .set({ subtotalFils: totals.subtotalFils, taxFils: totals.taxFils, totalFils: totals.totalFils, updatedAt: new Date() })
    .where(eq(quotation.id, quotationId));
}

quotationsRouter.get("/quotations", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const customerId = queryString(req, "customerId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(quotation.voidedAt),
      status ? eq(quotation.status, status as QuotationRow["status"]) : undefined,
      customerId ? eq(quotation.customerId, customerId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(quotation).where(where).orderBy(desc(quotation.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(quotation).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

quotationsRouter.post("/quotations", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateQuotationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(quotation)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        customerId: input.customerId,
        projectId: input.projectId ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "quotation",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json({ ...toApi(created), lines: [] });
});

quotationsRouter.get("/quotations/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadQuotationWithLines(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Quotation"));
    return;
  }
  res.status(200).json(body);
});

quotationsRouter.put("/quotations/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateQuotationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveQuotation(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "draft") return { kind: "invalid_status" as const };

    const [row] = await tx
      .update(quotation)
      .set({
        ...(input.validUntil !== undefined && { validUntil: input.validUntil ? new Date(input.validUntil) : null }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: new Date(),
      })
      .where(eq(quotation.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "quotation",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Quotation"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "quotation must be in draft status to update" }));
    return;
  }
  res.status(200).json(result.body);
});

function transitionRoute(path: string, from: readonly string[], to: QuotationRow["status"], requestBody?: unknown) {
  quotationsRouter.post(path, requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
    let reason: string | null = null;
    if (requestBody) {
      const parsed = RejectQuotationBody.safeParse(req.body ?? {});
      reason = parsed.success ? (parsed.data.reason ?? null) : null;
    }
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveQuotation(tx, id);
      if (!before) return { kind: "not_found" as const };
      if (!from.includes(before.status)) return { kind: "invalid_status" as const };
      assertQuotationTransition(before.status, to);

      const [row] = await tx
        .update(quotation)
        .set({ status: to, updatedAt: new Date() })
        .where(eq(quotation.id, id))
        .returning();
      if (!row) throw new Error("transition returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "quotation",
        entityId: row.id,
        action: `transition:${to}`,
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, id))! };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Quotation"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: `quotation must be in one of [${from.join(", ")}]` }));
      return;
    }
    res.status(200).json(result.body);
  });
}

transitionRoute("/quotations/:id/send", ["draft"], "sent");
transitionRoute("/quotations/:id/accept", ["sent"], "accepted");
transitionRoute("/quotations/:id/reject", ["sent"], "rejected", true);
transitionRoute("/quotations/:id/expire", ["sent"], "expired");

quotationsRouter.post("/quotations/:id/convert", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveQuotation(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "accepted") return { kind: "invalid_status" as const };
    assertQuotationTransition(before.status, "converted");

    const lines = await tx
      .select()
      .from(quotationLine)
      .where(and(eq(quotationLine.quotationId, id), isNull(quotationLine.voidedAt)));
    if (lines.length === 0) return { kind: "no_lines" as const };
    const lineIds = lines.map((l) => l.id);
    const charges =
      lineIds.length > 0
        ? await tx
            .select()
            .from(quotationLineCharge)
            .where(and(inArray(quotationLineCharge.quotationLineId, lineIds), isNull(quotationLineCharge.voidedAt)))
        : [];

    const [order] = await tx
      .insert(salesOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: before.branchId,
        customerId: before.customerId,
        projectId: before.projectId,
        quotationId: before.id,
        notes: before.notes,
        subtotalFils: before.subtotalFils,
        taxFils: before.taxFils,
        totalFils: before.totalFils,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!order) throw new Error("insert returned no row");

    const chargesByLine = new Map<string, QuotationLineChargeRow[]>();
    for (const c of charges) {
      const arr = chargesByLine.get(c.quotationLineId) ?? [];
      arr.push(c);
      chargesByLine.set(c.quotationLineId, arr);
    }
    for (const line of lines) {
      const [newLine] = await tx
        .insert(salesOrderLine)
        .values({
          companyId: req.auth!.companyId,
          salesOrderId: order.id,
          productId: line.productId,
          quantityM3: line.quantityM3,
          priceListId: line.priceListId,
          priceResolutionTier: line.priceResolutionTier,
          concreteUnitPriceFils: line.concreteUnitPriceFils,
          deliveryUnitPriceFils: line.deliveryUnitPriceFils,
          taxRateBasisPoints: line.taxRateBasisPoints,
          netFils: line.netFils,
          taxFils: line.taxFils,
          totalFils: line.totalFils,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!newLine) throw new Error("insert returned no row");
      for (const charge of chargesByLine.get(line.id) ?? []) {
        await tx.insert(salesOrderLineCharge).values({
          companyId: req.auth!.companyId,
          salesOrderLineId: newLine.id,
          chargeTypeId: charge.chargeTypeId,
          calculationMethod: charge.calculationMethod,
          quantity: charge.quantity,
          amountFils: charge.amountFils,
          taxRateBasisPoints: charge.taxRateBasisPoints,
          taxFils: charge.taxFils,
          createdBy: req.auth!.userId,
        });
      }
    }

    const [convertedQuotation] = await tx
      .update(quotation)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(quotation.id, id))
      .returning();
    if (!convertedQuotation) throw new Error("transition returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "quotation",
      entityId: id,
      action: "transition:converted",
      before,
      after: convertedQuotation,
    });
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "sales_order",
      entityId: order.id,
      action: "create",
      after: order,
      reason: `Converted from quotation ${id}`,
    });

    return { kind: "ok" as const, orderId: order.id };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Quotation"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "quotation must be in accepted status to convert" }));
    return;
  }
  if (result.kind === "no_lines") {
    res.status(400).json(validationError({ lines: "quotation has no lines" }));
    return;
  }

  const orderBody: SalesOrderWithLines | null = await withTenant(db, req.auth!.companyId, (tx) =>
    loadSalesOrderWithLines(tx, result.orderId),
  );
  res.status(201).json(orderBody);
});

quotationsRouter.post(
  "/quotations/:quotationId/lines",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = CreateQuotationLineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const quotationId = paramId(req, "quotationId");

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveQuotation(tx, quotationId);
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
        .insert(quotationLine)
        .values({
          companyId: req.auth!.companyId,
          quotationId,
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
      await recomputeHeader(tx, quotationId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "quotation_line",
        entityId: lineRow.id,
        action: "create",
        after: lineRow,
      });
      return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, quotationId))! };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Quotation"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "quotation must be in draft status" }));
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

quotationsRouter.delete(
  "/quotations/:quotationId/lines/:id",
  requireAuth,
  requirePermission(MODULE, "void"),
  async (req, res) => {
    const parsed = VoidQuotationLineBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const quotationId = paramId(req, "quotationId");
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveQuotation(tx, quotationId);
      if (!parent) return { kind: "not_found_quotation" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [before] = await tx
        .select()
        .from(quotationLine)
        .where(and(eq(quotationLine.id, id), eq(quotationLine.quotationId, quotationId), isNull(quotationLine.voidedAt)));
      if (!before) return { kind: "not_found_line" as const };

      const [row] = await tx
        .update(quotationLine)
        .set({ voidedAt: new Date() })
        .where(eq(quotationLine.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await recomputeHeader(tx, quotationId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "quotation_line",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, quotationId))! };
    });

    if (result.kind === "not_found_quotation") {
      res.status(404).json(notFound("Quotation"));
      return;
    }
    if (result.kind === "not_found_line") {
      res.status(404).json(notFound("Quotation line"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "quotation must be in draft status" }));
      return;
    }
    res.status(200).json(result.body);
  },
);

quotationsRouter.post(
  "/quotations/:quotationId/lines/:lineId/charges",
  requireAuth,
  requirePermission(MODULE, "create"),
  async (req, res) => {
    const parsed = CreateQuotationLineChargeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const quotationId = paramId(req, "quotationId");
    const lineId = paramId(req, "lineId");

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveQuotation(tx, quotationId);
      if (!parent) return { kind: "not_found_quotation" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [line] = await tx
        .select()
        .from(quotationLine)
        .where(and(eq(quotationLine.id, lineId), eq(quotationLine.quotationId, quotationId), isNull(quotationLine.voidedAt)));
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
        .insert(quotationLineCharge)
        .values({
          companyId: req.auth!.companyId,
          quotationLineId: lineId,
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
      await recomputeHeader(tx, quotationId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "quotation_line_charge",
        entityId: chargeRow.id,
        action: "create",
        after: chargeRow,
      });
      return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, quotationId))! };
    });

    switch (result.kind) {
      case "not_found_quotation":
        res.status(404).json(notFound("Quotation"));
        return;
      case "not_found_line":
        res.status(404).json(notFound("Quotation line"));
        return;
      case "not_found_charge_type":
        res.status(404).json(notFound("Charge type"));
        return;
      case "invalid_status":
        res.status(400).json(validationError({ status: "quotation must be in draft status" }));
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

quotationsRouter.delete(
  "/quotations/:quotationId/lines/:lineId/charges/:id",
  requireAuth,
  requirePermission(MODULE, "void"),
  async (req, res) => {
    const parsed = VoidQuotationLineChargeBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const quotationId = paramId(req, "quotationId");
    const lineId = paramId(req, "lineId");
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveQuotation(tx, quotationId);
      if (!parent) return { kind: "not_found_quotation" as const };
      if (parent.status !== "draft") return { kind: "invalid_status" as const };

      const [before] = await tx
        .select()
        .from(quotationLineCharge)
        .where(
          and(
            eq(quotationLineCharge.id, id),
            eq(quotationLineCharge.quotationLineId, lineId),
            isNull(quotationLineCharge.voidedAt),
          ),
        );
      if (!before) return { kind: "not_found_charge" as const };

      const [row] = await tx
        .update(quotationLineCharge)
        .set({ voidedAt: new Date() })
        .where(eq(quotationLineCharge.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await recomputeLine(tx, lineId);
      await recomputeHeader(tx, quotationId);
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "quotation_line_charge",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadQuotationWithLines(tx, quotationId))! };
    });

    if (result.kind === "not_found_quotation") {
      res.status(404).json(notFound("Quotation"));
      return;
    }
    if (result.kind === "not_found_charge") {
      res.status(404).json(notFound("Charge"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "quotation must be in draft status" }));
      return;
    }
    res.status(200).json(result.body);
  },
);
