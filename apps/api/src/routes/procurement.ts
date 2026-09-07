import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  account,
  branch,
  goodsReceipt,
  goodsReceiptLine,
  purchaseOrder,
  purchaseOrderLine,
  purchaseRequest,
  purchaseRequestLine,
  stockBalance,
  vendor,
  vendorBill,
  vendorBillLine,
  payment,
  paymentAllocation,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import {
  addFils,
  assertPurchaseOrderTransition,
  assertPurchaseRequestTransition,
  assertVendorBillTransition,
  decimalStringToMilliUnits,
  deriveVendorBillStatusFromAllocations,
  fils,
  filsToJodString,
  jodStringToFils,
  milliUnitsToDecimalString,
  mulFilsRoundHalfUp,
  planFifoPaymentAllocation,
  subFils,
  taxForLine,
  validateManualPaymentAllocation,
  WELL_KNOWN_ACCOUNT_CODES,
  ZERO_FILS,
  applyStockReceipt,
  type Fils,
} from "@rmixerp/core";
import {
  CreateAccountBody,
  CreateGoodsReceiptBody,
  CreatePaymentBody,
  CreatePurchaseOrderBody,
  CreatePurchaseOrderLineBody,
  CreatePurchaseRequestBody,
  CreatePurchaseRequestLineBody,
  CreateVendorBillBody,
  RejectPurchaseOrderBody,
  RejectPurchaseRequestBody,
  UpdateAccountBody,
  type GoodsReceiptDetail,
  type Payment,
  type PaymentAllocationItem,
  type PaymentDetail,
  type PurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseRequest,
  type PurchaseRequestDetail,
  type VendorBillDetail,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { idempotent } from "../middleware/idempotency";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";
import { allocateDocumentNumber } from "./invoices";
import { findOrCreateBalance } from "./inventory";
import { findWellKnownAccount, postJournalEntry } from "../lib/glPosting";

export const procurementRouter = Router();
const PR_MODULE = "purchaseRequests";
const PO_MODULE = "purchaseOrders";
const GR_MODULE = "goodsReceipts";
const BILL_MODULE = "vendorBills";
const PAYMENT_MODULE = "payments";
const GL_ACCOUNTS_MODULE = "glAccounts";

type PurchaseRequestRow = typeof purchaseRequest.$inferSelect;
type PurchaseRequestLineRow = typeof purchaseRequestLine.$inferSelect;
type PurchaseOrderRow = typeof purchaseOrder.$inferSelect;
type PurchaseOrderLineRow = typeof purchaseOrderLine.$inferSelect;
type GoodsReceiptRow = typeof goodsReceipt.$inferSelect;
type GoodsReceiptLineRow = typeof goodsReceiptLine.$inferSelect;
type VendorBillRow = typeof vendorBill.$inferSelect;
type VendorBillLineRow = typeof vendorBillLine.$inferSelect;
type PaymentRow = typeof payment.$inferSelect;
type PaymentAllocationRow = typeof paymentAllocation.$inferSelect;

const STANDARD_TAX_RATE_BASIS_POINTS = 1600;

// ---------- Purchase Requests ----------

function prToApi(row: PurchaseRequestRow): PurchaseRequest {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    requestNumber: row.requestNumber,
    requestedBy: row.requestedBy,
    status: row.status,
    neededByDate: row.neededByDate?.toISOString() ?? null,
    notes: row.notes,
    convertedToPurchaseOrderId: row.convertedToPurchaseOrderId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function prLineToApi(row: PurchaseRequestLineRow) {
  return {
    id: row.id,
    purchaseRequestId: row.purchaseRequestId,
    rawMaterialId: row.rawMaterialId,
    quantity: row.quantity,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function loadPurchaseRequestDetail(tx: Tx, id: string): Promise<PurchaseRequestDetail | null> {
  const [row] = await tx.select().from(purchaseRequest).where(and(eq(purchaseRequest.id, id), isNull(purchaseRequest.voidedAt)));
  if (!row) return null;
  const lines = await tx
    .select()
    .from(purchaseRequestLine)
    .where(and(eq(purchaseRequestLine.purchaseRequestId, id), isNull(purchaseRequestLine.voidedAt)));
  return { ...prToApi(row), lines: lines.map(prLineToApi) };
}

procurementRouter.post("/purchase-requests", requireAuth, requirePermission(PR_MODULE, "create"), idempotent(), async (req, res) => {
  const parsed = CreatePurchaseRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [branchRow] = await tx.select().from(branch).where(eq(branch.id, input.branchId));
    if (!branchRow) return null;
    const requestNumber = await allocateDocumentNumber(tx, req.auth!.companyId, input.branchId, "PR", `PR-${branchRow.code}`);
    const [row] = await tx
      .insert(purchaseRequest)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        requestNumber,
        requestedBy: req.auth!.userId,
        neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("purchase request insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "purchase_request",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return loadPurchaseRequestDetail(tx, row.id);
  });

  if (!body) {
    res.status(400).json(validationError({ branchId: "unknown branch" }));
    return;
  }
  res.status(201).json(body);
});

procurementRouter.get("/purchase-requests", requireAuth, requirePermission(PR_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(purchaseRequest.voidedAt),
      status ? eq(purchaseRequest.status, status as PurchaseRequestRow["status"]) : undefined,
      branchId ? eq(purchaseRequest.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(purchaseRequest)
        .where(where)
        .orderBy(desc(purchaseRequest.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(purchaseRequest).where(where),
    ]);
    return { items: rows.map(prToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/purchase-requests/:id", requireAuth, requirePermission(PR_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadPurchaseRequestDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Purchase request"));
    return;
  }
  res.status(200).json(body);
});

procurementRouter.post("/purchase-requests/:id/lines", requireAuth, requirePermission(PR_MODULE, "create"), async (req, res) => {
  const parsed = CreatePurchaseRequestLineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const id = paramId(req);
  const input = parsed.data;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [prRow] = await tx.select().from(purchaseRequest).where(and(eq(purchaseRequest.id, id), isNull(purchaseRequest.voidedAt)));
    if (!prRow) return { kind: "not_found" as const };
    if (prRow.status !== "draft") return { kind: "invalid_status" as const };

    const [row] = await tx
      .insert(purchaseRequestLine)
      .values({
        companyId: req.auth!.companyId,
        purchaseRequestId: id,
        rawMaterialId: input.rawMaterialId,
        quantity: input.quantity,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("purchase request line insert returned no row");
    return { kind: "ok" as const, body: (await loadPurchaseRequestDetail(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Purchase request"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "purchase request must be draft to add lines" }));
    return;
  }
  res.status(201).json(result.body);
});

function prTransitionRoute(path: string, from: readonly PurchaseRequestRow["status"][], to: PurchaseRequestRow["status"], action: "edit" | "approve", takesReason: boolean) {
  procurementRouter.post(path, requireAuth, requirePermission(PR_MODULE, action), async (req, res) => {
    let reason: string | null = null;
    if (takesReason) {
      const parsed = RejectPurchaseRequestBody.safeParse(req.body ?? {});
      reason = parsed.success ? (parsed.data.reason ?? null) : null;
    }
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const [before] = await tx.select().from(purchaseRequest).where(and(eq(purchaseRequest.id, id), isNull(purchaseRequest.voidedAt)));
      if (!before) return { kind: "not_found" as const };
      if (!from.includes(before.status)) return { kind: "invalid_status" as const };
      assertPurchaseRequestTransition(before.status, to);

      const [row] = await tx.update(purchaseRequest).set({ status: to, updatedAt: new Date() }).where(eq(purchaseRequest.id, id)).returning();
      if (!row) throw new Error("purchase request transition returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "purchase_request",
        entityId: row.id,
        action: `transition:${to}`,
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadPurchaseRequestDetail(tx, id))! };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Purchase request"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: `purchase request must be in one of [${from.join(", ")}]` }));
      return;
    }
    res.status(200).json(result.body);
  });
}

prTransitionRoute("/purchase-requests/:id/submit", ["draft"], "submitted", "edit", false);
prTransitionRoute("/purchase-requests/:id/approve", ["submitted"], "approved", "approve", false);
prTransitionRoute("/purchase-requests/:id/reject", ["submitted"], "rejected", "approve", true);
prTransitionRoute("/purchase-requests/:id/cancel", ["draft", "submitted"], "cancelled", "edit", false);

// ---------- Purchase Orders ----------

function poToApi(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    vendorId: row.vendorId,
    purchaseRequestId: row.purchaseRequestId,
    poNumber: row.poNumber,
    status: row.status,
    subtotalJod: filsToJodString(fils(row.subtotalFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function poLineToApi(tx: Tx, row: PurchaseOrderLineRow) {
  const receivedRows = await tx
    .select({ qty: goodsReceiptLine.quantityReceived })
    .from(goodsReceiptLine)
    .where(eq(goodsReceiptLine.purchaseOrderLineId, row.id));
  const receivedMilli = receivedRows.reduce((sum, r) => sum + decimalStringToMilliUnits(r.qty), 0n);
  const orderedMilli = decimalStringToMilliUnits(row.quantity);
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    rawMaterialId: row.rawMaterialId,
    quantity: row.quantity,
    unitPriceJod: filsToJodString(fils(row.unitPriceFils)),
    taxRateBasisPoints: row.taxRateBasisPoints,
    netJod: filsToJodString(fils(row.netFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    receivedQuantity: milliUnitsToDecimalString(receivedMilli),
    varianceQuantity: milliUnitsToDecimalString(receivedMilli - orderedMilli),
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function loadPurchaseOrderDetail(tx: Tx, id: string): Promise<PurchaseOrderDetail | null> {
  const [row] = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, id), isNull(purchaseOrder.voidedAt)));
  if (!row) return null;
  const lines = await tx
    .select()
    .from(purchaseOrderLine)
    .where(and(eq(purchaseOrderLine.purchaseOrderId, id), isNull(purchaseOrderLine.voidedAt)));
  return { ...poToApi(row), lines: await Promise.all(lines.map((l) => poLineToApi(tx, l))) };
}

async function recomputePurchaseOrderTotals(tx: Tx, purchaseOrderId: string): Promise<void> {
  const lines = await tx
    .select()
    .from(purchaseOrderLine)
    .where(and(eq(purchaseOrderLine.purchaseOrderId, purchaseOrderId), isNull(purchaseOrderLine.voidedAt)));
  const subtotalFils = addFils(...lines.map((l) => fils(l.netFils)), ZERO_FILS);
  const taxFils = addFils(...lines.map((l) => fils(l.taxFils)), ZERO_FILS);
  await tx
    .update(purchaseOrder)
    .set({ subtotalFils, taxFils, totalFils: addFils(subtotalFils, taxFils), updatedAt: new Date() })
    .where(eq(purchaseOrder.id, purchaseOrderId));
}

procurementRouter.post("/purchase-orders", requireAuth, requirePermission(PO_MODULE, "create"), idempotent(), async (req, res) => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [branchRow] = await tx.select().from(branch).where(eq(branch.id, input.branchId));
    if (!branchRow) return null;
    const [vendorRow] = await tx.select().from(vendor).where(eq(vendor.id, input.vendorId));
    if (!vendorRow) return null;
    const poNumber = await allocateDocumentNumber(tx, req.auth!.companyId, input.branchId, "PO", `PO-${branchRow.code}`);
    const [row] = await tx
      .insert(purchaseOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        vendorId: input.vendorId,
        purchaseRequestId: input.purchaseRequestId ?? null,
        poNumber,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("purchase order insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "purchase_order",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return loadPurchaseOrderDetail(tx, row.id);
  });

  if (!body) {
    res.status(400).json(validationError({ branchId: "unknown branch or vendor" }));
    return;
  }
  res.status(201).json(body);
});

procurementRouter.get("/purchase-orders", requireAuth, requirePermission(PO_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const vendorId = queryString(req, "vendorId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(purchaseOrder.voidedAt),
      status ? eq(purchaseOrder.status, status as PurchaseOrderRow["status"]) : undefined,
      vendorId ? eq(purchaseOrder.vendorId, vendorId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(purchaseOrder).where(where).orderBy(desc(purchaseOrder.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(purchaseOrder).where(where),
    ]);
    return { items: rows.map(poToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/purchase-orders/:id", requireAuth, requirePermission(PO_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadPurchaseOrderDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Purchase order"));
    return;
  }
  res.status(200).json(body);
});

procurementRouter.post("/purchase-orders/:id/lines", requireAuth, requirePermission(PO_MODULE, "create"), async (req, res) => {
  const parsed = CreatePurchaseOrderLineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const id = paramId(req);
  const input = parsed.data;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [poRow] = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, id), isNull(purchaseOrder.voidedAt)));
    if (!poRow) return { kind: "not_found" as const };
    if (poRow.status !== "draft") return { kind: "invalid_status" as const };

    const qtyMilli = decimalStringToMilliUnits(input.quantity);
    const unitPriceFils = jodStringToFils(input.unitPriceJod);
    const netFils = mulFilsRoundHalfUp(unitPriceFils, qtyMilli, 1000n);
    const taxRateBasisPoints = input.taxRateBasisPoints ?? STANDARD_TAX_RATE_BASIS_POINTS;
    const taxFils = taxForLine(netFils, BigInt(taxRateBasisPoints));

    await tx.insert(purchaseOrderLine).values({
      companyId: req.auth!.companyId,
      purchaseOrderId: id,
      rawMaterialId: input.rawMaterialId,
      quantity: input.quantity,
      unitPriceFils,
      taxRateBasisPoints,
      netFils,
      taxFils,
      totalFils: addFils(netFils, taxFils),
      createdBy: req.auth!.userId,
    });
    await recomputePurchaseOrderTotals(tx, id);
    return { kind: "ok" as const, body: (await loadPurchaseOrderDetail(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Purchase order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "purchase order must be draft to add lines" }));
    return;
  }
  res.status(201).json(result.body);
});

function poTransitionRoute(
  path: string,
  from: readonly PurchaseOrderRow["status"][],
  to: PurchaseOrderRow["status"],
  action: "edit" | "approve",
  takesReason: boolean,
  extraCheck?: (row: PurchaseOrderRow) => string | null,
) {
  procurementRouter.post(path, requireAuth, requirePermission(PO_MODULE, action), async (req, res) => {
    let reason: string | null = null;
    if (takesReason) {
      const parsed = RejectPurchaseOrderBody.safeParse(req.body ?? {});
      reason = parsed.success ? (parsed.data.reason ?? null) : null;
    }
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const [before] = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, id), isNull(purchaseOrder.voidedAt)));
      if (!before) return { kind: "not_found" as const };
      if (!from.includes(before.status)) return { kind: "invalid_status" as const };
      if (to === "submitted") {
        const lineCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(purchaseOrderLine)
          .where(and(eq(purchaseOrderLine.purchaseOrderId, id), isNull(purchaseOrderLine.voidedAt)));
        if ((lineCount[0]?.count ?? 0) === 0) return { kind: "no_lines" as const };
      }
      const extra = extraCheck?.(before);
      if (extra) return { kind: "extra_check_failed" as const, message: extra };
      assertPurchaseOrderTransition(before.status, to);

      const [row] = await tx.update(purchaseOrder).set({ status: to, updatedAt: new Date() }).where(eq(purchaseOrder.id, id)).returning();
      if (!row) throw new Error("purchase order transition returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "purchase_order",
        entityId: row.id,
        action: `transition:${to}`,
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadPurchaseOrderDetail(tx, id))! };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Purchase order"));
      return;
    }
    if (result.kind === "no_lines") {
      res.status(400).json(validationError({ lines: "purchase order needs at least one line to submit" }));
      return;
    }
    if (result.kind === "extra_check_failed") {
      res.status(400).json(validationError({ status: result.message }));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: `purchase order must be in one of [${from.join(", ")}]` }));
      return;
    }
    res.status(200).json(result.body);
  });
}

poTransitionRoute("/purchase-orders/:id/submit", ["draft"], "submitted", "edit", false);
poTransitionRoute("/purchase-orders/:id/approve", ["submitted"], "approved", "approve", false);
poTransitionRoute("/purchase-orders/:id/reject", ["submitted"], "rejected", "approve", true);
poTransitionRoute("/purchase-orders/:id/cancel", ["draft", "submitted", "approved"], "cancelled", "edit", false);

// ---------- Goods Receipts ----------

function grToApi(row: GoodsReceiptRow): Omit<GoodsReceiptDetail, "lines"> {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    purchaseOrderId: row.purchaseOrderId,
    receiptNumber: row.receiptNumber,
    receivedBy: row.receivedBy,
    receivedAt: row.receivedAt.toISOString(),
    notes: row.notes,
    photos: row.photos,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function grLineToApi(row: GoodsReceiptLineRow) {
  return {
    id: row.id,
    goodsReceiptId: row.goodsReceiptId,
    purchaseOrderLineId: row.purchaseOrderLineId,
    quantityReceived: row.quantityReceived,
    unitCostJod: filsToJodString(fils(row.unitCostFils)),
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadGoodsReceiptDetail(tx: Tx, id: string): Promise<GoodsReceiptDetail | null> {
  const [row] = await tx.select().from(goodsReceipt).where(and(eq(goodsReceipt.id, id), isNull(goodsReceipt.voidedAt)));
  if (!row) return null;
  const lines = await tx.select().from(goodsReceiptLine).where(eq(goodsReceiptLine.goodsReceiptId, id));
  return { ...grToApi(row), lines: lines.map(grLineToApi) };
}

procurementRouter.post("/goods-receipts", requireAuth, requirePermission(GR_MODULE, "create"), idempotent(), async (req, res) => {
  const parsed = CreateGoodsReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [poRow] = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, input.purchaseOrderId), isNull(purchaseOrder.voidedAt)));
    if (!poRow) return { kind: "not_found" as const };
    if (poRow.status !== "approved" && poRow.status !== "received") return { kind: "invalid_status" as const };

    const poLines = await tx
      .select()
      .from(purchaseOrderLine)
      .where(and(eq(purchaseOrderLine.purchaseOrderId, input.purchaseOrderId), isNull(purchaseOrderLine.voidedAt)));
    const poLineById = new Map(poLines.map((l) => [l.id, l]));

    for (const line of input.lines) {
      if (!poLineById.has(line.purchaseOrderLineId)) {
        return { kind: "invalid_line" as const, message: `Line ${line.purchaseOrderLineId} does not belong to this purchase order.` };
      }
      if (decimalStringToMilliUnits(line.quantityReceived) <= 0n) {
        return { kind: "invalid_line" as const, message: "quantityReceived must be positive." };
      }
    }

    const [branchRow] = await tx.select().from(branch).where(eq(branch.id, poRow.branchId));
    if (!branchRow) throw new Error("purchase order branch missing");
    const receiptNumber = await allocateDocumentNumber(tx, req.auth!.companyId, poRow.branchId, "GRN", `GRN-${branchRow.code}`);

    const [receiptRow] = await tx
      .insert(goodsReceipt)
      .values({
        companyId: req.auth!.companyId,
        branchId: poRow.branchId,
        purchaseOrderId: input.purchaseOrderId,
        receiptNumber,
        receivedBy: req.auth!.userId,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        notes: input.notes ?? null,
        photos: input.photos ?? [],
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!receiptRow) throw new Error("goods receipt insert returned no row");

    for (const line of input.lines) {
      const poLine = poLineById.get(line.purchaseOrderLineId)!;
      const unitCostFils = line.unitCostJod ? jodStringToFils(line.unitCostJod) : fils(poLine.unitPriceFils);
      const qtyMilli = decimalStringToMilliUnits(line.quantityReceived);

      await tx.insert(goodsReceiptLine).values({
        companyId: req.auth!.companyId,
        goodsReceiptId: receiptRow.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantityReceived: line.quantityReceived,
        unitCostFils,
        createdBy: req.auth!.userId,
      });

      const balance = await findOrCreateBalance(tx, req.auth!.companyId, poRow.branchId, poLine.rawMaterialId);
      const applied = applyStockReceipt(
        { quantityMilliUnits: decimalStringToMilliUnits(balance.quantityOnHand), averageCostFils: fils(balance.averageCostFils) },
        qtyMilli,
        unitCostFils,
      );
      await tx
        .update(stockBalance)
        .set({
          quantityOnHand: milliUnitsToDecimalString(applied.quantityMilliUnits),
          averageCostFils: applied.averageCostFils,
          updatedAt: new Date(),
        })
        .where(eq(stockBalance.id, balance.id));
    }

    if (poRow.status === "approved") {
      assertPurchaseOrderTransition(poRow.status, "received");
      await tx.update(purchaseOrder).set({ status: "received", updatedAt: new Date() }).where(eq(purchaseOrder.id, poRow.id));
    }

    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "goods_receipt",
      entityId: receiptRow.id,
      action: "create",
      after: receiptRow,
    });

    return { kind: "ok" as const, body: (await loadGoodsReceiptDetail(tx, receiptRow.id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Purchase order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "purchase order must be approved or already received" }));
    return;
  }
  if (result.kind === "invalid_line") {
    res.status(400).json(validationError({ lines: result.message }));
    return;
  }
  res.status(201).json(result.body);
});

procurementRouter.get("/goods-receipts", requireAuth, requirePermission(GR_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const purchaseOrderId = queryString(req, "purchaseOrderId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(goodsReceipt.voidedAt), purchaseOrderId ? eq(goodsReceipt.purchaseOrderId, purchaseOrderId) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(goodsReceipt).where(where).orderBy(desc(goodsReceipt.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(goodsReceipt).where(where),
    ]);
    return { items: rows.map(grToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/goods-receipts/:id", requireAuth, requirePermission(GR_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadGoodsReceiptDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Goods receipt"));
    return;
  }
  res.status(200).json(body);
});

// ---------- Vendor Bills ----------

async function totalAllocatedForBill(tx: Tx, vendorBillId: string): Promise<Fils> {
  const rows = await tx
    .select()
    .from(paymentAllocation)
    .where(and(eq(paymentAllocation.vendorBillId, vendorBillId), isNull(paymentAllocation.voidedAt)));
  return addFils(...rows.map((r) => fils(r.amountFils)), ZERO_FILS);
}

async function billToApi(tx: Tx, row: VendorBillRow): Promise<Omit<VendorBillDetail, "lines">> {
  const allocatedFils = await totalAllocatedForBill(tx, row.id);
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    vendorId: row.vendorId,
    purchaseOrderId: row.purchaseOrderId,
    billNumber: row.billNumber,
    vendorReference: row.vendorReference,
    status: row.status,
    subtotalJod: filsToJodString(fils(row.subtotalFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    billDate: row.billDate.toISOString(),
    dueDate: row.dueDate.toISOString(),
    allocatedJod: filsToJodString(allocatedFils),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function billLineToApi(row: VendorBillLineRow) {
  return {
    id: row.id,
    vendorBillId: row.vendorBillId,
    purchaseOrderLineId: row.purchaseOrderLineId,
    description: row.description,
    quantity: row.quantity,
    netJod: filsToJodString(fils(row.netFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadVendorBillDetail(tx: Tx, id: string): Promise<VendorBillDetail | null> {
  const [row] = await tx.select().from(vendorBill).where(and(eq(vendorBill.id, id), isNull(vendorBill.voidedAt)));
  if (!row) return null;
  const lines = await tx.select().from(vendorBillLine).where(eq(vendorBillLine.vendorBillId, id));
  return { ...(await billToApi(tx, row)), lines: lines.map(billLineToApi) };
}

procurementRouter.post("/vendor-bills", requireAuth, requirePermission(BILL_MODULE, "create"), idempotent(), async (req, res) => {
  const parsed = CreateVendorBillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [poRow] = await tx.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, input.purchaseOrderId), isNull(purchaseOrder.voidedAt)));
    if (!poRow) return { kind: "not_found" as const };
    if (poRow.status !== "received" && poRow.status !== "billed") return { kind: "invalid_status" as const };

    const poLines = await tx
      .select()
      .from(purchaseOrderLine)
      .where(and(eq(purchaseOrderLine.purchaseOrderId, input.purchaseOrderId), isNull(purchaseOrderLine.voidedAt)));
    const poLineById = new Map(poLines.map((l) => [l.id, l]));

    const existingBillLines = await tx
      .select({ poLineId: vendorBillLine.purchaseOrderLineId, quantity: vendorBillLine.quantity })
      .from(vendorBillLine)
      .innerJoin(vendorBill, eq(vendorBillLine.vendorBillId, vendorBill.id))
      .where(and(eq(vendorBill.purchaseOrderId, input.purchaseOrderId), isNull(vendorBill.voidedAt)));
    const alreadyBilledMilliByLine = new Map<string, bigint>();
    for (const r of existingBillLines) {
      alreadyBilledMilliByLine.set(r.poLineId, (alreadyBilledMilliByLine.get(r.poLineId) ?? 0n) + decimalStringToMilliUnits(r.quantity));
    }

    const preparedLines: { poLine: PurchaseOrderLineRow; description: string; quantity: string; netFils: Fils; taxFils: Fils; totalFils: Fils }[] = [];
    for (const line of input.lines) {
      const poLine = poLineById.get(line.purchaseOrderLineId);
      if (!poLine) return { kind: "invalid_line" as const, message: `Line ${line.purchaseOrderLineId} does not belong to this purchase order.` };
      const qtyMilli = decimalStringToMilliUnits(line.quantity);
      if (qtyMilli <= 0n) return { kind: "invalid_line" as const, message: "quantity must be positive." };
      const orderedMilli = decimalStringToMilliUnits(poLine.quantity);
      const alreadyBilledMilli = alreadyBilledMilliByLine.get(poLine.id) ?? 0n;
      if (alreadyBilledMilli + qtyMilli > orderedMilli) {
        return { kind: "invalid_line" as const, message: `Line ${line.purchaseOrderLineId} would bill more than remains unbilled on the PO line.` };
      }
      const netFils = mulFilsRoundHalfUp(fils(poLine.unitPriceFils), qtyMilli, 1000n);
      const taxFils = taxForLine(netFils, BigInt(poLine.taxRateBasisPoints));
      preparedLines.push({ poLine, description: line.description, quantity: line.quantity, netFils, taxFils, totalFils: addFils(netFils, taxFils) });
    }

    const [branchRow] = await tx.select().from(branch).where(eq(branch.id, poRow.branchId));
    if (!branchRow) throw new Error("purchase order branch missing");
    const billNumber = await allocateDocumentNumber(tx, req.auth!.companyId, poRow.branchId, "BILL", `BILL-${branchRow.code}`);

    const subtotalFils = addFils(...preparedLines.map((l) => l.netFils), ZERO_FILS);
    const taxFils = addFils(...preparedLines.map((l) => l.taxFils), ZERO_FILS);

    const [billRow] = await tx
      .insert(vendorBill)
      .values({
        companyId: req.auth!.companyId,
        branchId: poRow.branchId,
        vendorId: poRow.vendorId,
        purchaseOrderId: input.purchaseOrderId,
        billNumber,
        vendorReference: input.vendorReference ?? null,
        subtotalFils,
        taxFils,
        totalFils: addFils(subtotalFils, taxFils),
        dueDate: new Date(input.dueDate),
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!billRow) throw new Error("vendor bill insert returned no row");

    for (const l of preparedLines) {
      await tx.insert(vendorBillLine).values({
        companyId: req.auth!.companyId,
        vendorBillId: billRow.id,
        purchaseOrderLineId: l.poLine.id,
        description: l.description,
        quantity: l.quantity,
        netFils: l.netFils,
        taxFils: l.taxFils,
        totalFils: l.totalFils,
        createdBy: req.auth!.userId,
      });
    }

    if (poRow.status === "received") {
      assertPurchaseOrderTransition(poRow.status, "billed");
      await tx.update(purchaseOrder).set({ status: "billed", updatedAt: new Date() }).where(eq(purchaseOrder.id, poRow.id));
    }

    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "vendor_bill",
      entityId: billRow.id,
      action: "create",
      after: billRow,
    });

    return { kind: "ok" as const, body: (await loadVendorBillDetail(tx, billRow.id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Purchase order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "purchase order must have goods received before it can be billed" }));
    return;
  }
  if (result.kind === "invalid_line") {
    res.status(400).json(validationError({ lines: result.message }));
    return;
  }
  res.status(201).json(result.body);
});

procurementRouter.get("/vendor-bills", requireAuth, requirePermission(BILL_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const vendorId = queryString(req, "vendorId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(vendorBill.voidedAt),
      status ? eq(vendorBill.status, status as VendorBillRow["status"]) : undefined,
      vendorId ? eq(vendorBill.vendorId, vendorId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(vendorBill).where(where).orderBy(desc(vendorBill.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(vendorBill).where(where),
    ]);
    return { items: await Promise.all(rows.map((r) => billToApi(tx, r))), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/vendor-bills/:id", requireAuth, requirePermission(BILL_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadVendorBillDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Vendor bill"));
    return;
  }
  res.status(200).json(body);
});

procurementRouter.post("/vendor-bills/:id/approve", requireAuth, requirePermission(BILL_MODULE, "approve"), async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [before] = await tx.select().from(vendorBill).where(and(eq(vendorBill.id, id), isNull(vendorBill.voidedAt)));
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "draft") return { kind: "invalid_status" as const };
    assertVendorBillTransition(before.status, "approved");

    const lines = await tx.select().from(vendorBillLine).where(eq(vendorBillLine.vendorBillId, id));
    const netFils = addFils(...lines.map((l) => fils(l.netFils)), ZERO_FILS);
    const taxFils = addFils(...lines.map((l) => fils(l.taxFils)), ZERO_FILS);

    const inventoryAccountId = await findWellKnownAccount(tx, req.auth!.companyId, WELL_KNOWN_ACCOUNT_CODES.inventory);
    const taxInputAccountId = await findWellKnownAccount(tx, req.auth!.companyId, WELL_KNOWN_ACCOUNT_CODES.taxInput);
    const apAccountId = await findWellKnownAccount(tx, req.auth!.companyId, WELL_KNOWN_ACCOUNT_CODES.accountsPayable);

    const journalLines = [
      { accountId: inventoryAccountId, debitFils: netFils, creditFils: ZERO_FILS },
      ...(taxFils > ZERO_FILS ? [{ accountId: taxInputAccountId, debitFils: taxFils, creditFils: ZERO_FILS }] : []),
      { accountId: apAccountId, debitFils: ZERO_FILS, creditFils: fils(before.totalFils) },
    ];
    await postJournalEntry(tx, req.auth!.companyId, before.branchId, new Date(), `Vendor bill ${before.billNumber} approved`, "vendor_bill", before.id, journalLines);

    const [row] = await tx.update(vendorBill).set({ status: "approved", updatedAt: new Date() }).where(eq(vendorBill.id, id)).returning();
    if (!row) throw new Error("vendor bill transition returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "vendor_bill",
      entityId: row.id,
      action: "transition:approved",
      before,
      after: row,
    });
    return { kind: "ok" as const, body: (await loadVendorBillDetail(tx, id))! };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Vendor bill"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "vendor bill must be draft to approve" }));
    return;
  }
  res.status(200).json(result.body);
});

// ---------- Payments ----------

function paymentToApi(row: PaymentRow): Payment {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    vendorId: row.vendorId,
    method: row.method,
    receiptNumber: row.receiptNumber,
    amountJod: filsToJodString(fils(row.amountFils)),
    paidAt: row.paidAt.toISOString(),
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function paymentAllocationToApi(row: PaymentAllocationRow): PaymentAllocationItem {
  return {
    id: row.id,
    paymentId: row.paymentId,
    vendorBillId: row.vendorBillId,
    amountJod: filsToJodString(fils(row.amountFils)),
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function loadPaymentDetail(tx: Tx, id: string): Promise<PaymentDetail | null> {
  const [row] = await tx.select().from(payment).where(and(eq(payment.id, id), isNull(payment.voidedAt)));
  if (!row) return null;
  const allocations = await tx.select().from(paymentAllocation).where(eq(paymentAllocation.paymentId, id));
  return { ...paymentToApi(row), allocations: allocations.map(paymentAllocationToApi) };
}

procurementRouter.post("/payments", requireAuth, requirePermission(PAYMENT_MODULE, "create"), idempotent(), async (req, res) => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  if (input.allocationMode === "manual" && (!input.allocations || input.allocations.length === 0)) {
    res.status(400).json(validationError({ allocations: "allocationMode 'manual' requires at least one allocation line" }));
    return;
  }

  const amountFils = jodStringToFils(input.amountJod);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [vendorRow] = await tx.select().from(vendor).where(eq(vendor.id, input.vendorId));
    if (!vendorRow) return { kind: "vendor_not_found" as const };
    const [branchRow] = await tx.select().from(branch).where(eq(branch.id, input.branchId));
    if (!branchRow) return { kind: "branch_not_found" as const };

    const openBills = await tx
      .select()
      .from(vendorBill)
      .where(and(eq(vendorBill.vendorId, input.vendorId), inArray(vendorBill.status, ["approved", "partially_paid"]), isNull(vendorBill.voidedAt)))
      .for("update");

    const outstandingByBillId = new Map<string, Fils>();
    for (const bill of openBills) {
      const allocated = await totalAllocatedForBill(tx, bill.id);
      outstandingByBillId.set(bill.id, subFils(fils(bill.totalFils), allocated));
    }

    let planLines: { vendorBillId: string; amountFils: Fils }[];
    if (input.allocationMode === "fifo") {
      const { lines, unallocatedFils } = planFifoPaymentAllocation(
        amountFils,
        openBills.map((b) => ({ vendorBillId: b.id, dueDate: b.dueDate, outstandingFils: outstandingByBillId.get(b.id)! })),
      );
      if (unallocatedFils > ZERO_FILS) {
        return {
          kind: "invalid_allocation" as const,
          reason: "Payment amount exceeds total outstanding across this vendor's open bills — use allocationMode 'manual' to record a partial application.",
        };
      }
      planLines = lines;
    } else {
      const lines = (input.allocations ?? []).map((a) => ({ vendorBillId: a.vendorBillId, amountFils: jodStringToFils(a.amountJod) }));
      const validation = validateManualPaymentAllocation(amountFils, lines, outstandingByBillId);
      if (!validation.ok) return { kind: "invalid_allocation" as const, reason: validation.reason };
      planLines = lines;
    }

    if (planLines.length === 0) {
      return { kind: "invalid_allocation" as const, reason: "This vendor has no open bills to allocate against." };
    }

    const receiptNumber = await allocateDocumentNumber(tx, req.auth!.companyId, input.branchId, "PMT", `PMT-${branchRow.code}`);

    const [paymentRow] = await tx
      .insert(payment)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        vendorId: input.vendorId,
        method: input.method,
        receiptNumber,
        amountFils,
        paidAt: new Date(input.paidAt),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!paymentRow) throw new Error("payment insert returned no row");

    for (const line of planLines) {
      await tx.insert(paymentAllocation).values({
        companyId: req.auth!.companyId,
        paymentId: paymentRow.id,
        vendorBillId: line.vendorBillId,
        amountFils: line.amountFils,
        createdBy: req.auth!.userId,
      });

      const bill = openBills.find((b) => b.id === line.vendorBillId)!;
      const totalAllocatedNow = await totalAllocatedForBill(tx, line.vendorBillId);
      const nextStatus = deriveVendorBillStatusFromAllocations(true, fils(bill.totalFils), totalAllocatedNow);
      if (nextStatus !== bill.status) {
        assertVendorBillTransition(bill.status, nextStatus);
        await tx.update(vendorBill).set({ status: nextStatus, updatedAt: new Date() }).where(eq(vendorBill.id, line.vendorBillId));
      }
    }

    const apAccountId = await findWellKnownAccount(tx, req.auth!.companyId, WELL_KNOWN_ACCOUNT_CODES.accountsPayable);
    const cashAccountId = await findWellKnownAccount(tx, req.auth!.companyId, WELL_KNOWN_ACCOUNT_CODES.cash);
    await postJournalEntry(
      tx,
      req.auth!.companyId,
      input.branchId,
      new Date(input.paidAt),
      `Payment ${receiptNumber} to vendor`,
      "payment",
      paymentRow.id,
      [
        { accountId: apAccountId, debitFils: amountFils, creditFils: ZERO_FILS },
        { accountId: cashAccountId, debitFils: ZERO_FILS, creditFils: amountFils },
      ],
    );

    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "payment",
      entityId: paymentRow.id,
      action: "create",
      after: paymentRow,
    });

    return { kind: "ok" as const, body: (await loadPaymentDetail(tx, paymentRow.id))! };
  });

  if (result.kind === "vendor_not_found") {
    res.status(400).json(validationError({ vendorId: "unknown vendor" }));
    return;
  }
  if (result.kind === "branch_not_found") {
    res.status(400).json(validationError({ branchId: "unknown branch" }));
    return;
  }
  if (result.kind === "invalid_allocation") {
    res.status(400).json(validationError({ allocations: result.reason }));
    return;
  }
  res.status(201).json(result.body);
});

procurementRouter.get("/payments", requireAuth, requirePermission(PAYMENT_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const vendorId = queryString(req, "vendorId");
  const method = queryString(req, "method");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(payment.voidedAt),
      vendorId ? eq(payment.vendorId, vendorId) : undefined,
      method ? eq(payment.method, method as PaymentRow["method"]) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(payment).where(where).orderBy(desc(payment.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(payment).where(where),
    ]);
    return { items: rows.map(paymentToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/payments/:id", requireAuth, requirePermission(PAYMENT_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadPaymentDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Payment"));
    return;
  }
  res.status(200).json(body);
});

// ---------- GL: Accounts / Cost Centers ----------

type AccountRow = typeof account.$inferSelect;

function accountToApi(row: AccountRow) {
  return {
    id: row.id,
    companyId: row.companyId,
    code: row.code,
    name: row.name,
    type: row.type,
    parentAccountId: row.parentAccountId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

procurementRouter.post("/gl/accounts", requireAuth, requirePermission(GL_ACCOUNTS_MODULE, "create"), async (req, res) => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const row = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [inserted] = await tx
      .insert(account)
      .values({
        companyId: req.auth!.companyId,
        code: input.code,
        name: input.name,
        type: input.type,
        parentAccountId: input.parentAccountId ?? null,
        createdBy: req.auth!.userId,
      })
      .onConflictDoNothing()
      .returning();
    return inserted;
  });
  if (!row) {
    res.status(400).json(validationError({ code: "an account with this code already exists" }));
    return;
  }
  res.status(201).json(accountToApi(row));
});

procurementRouter.get("/gl/accounts", requireAuth, requirePermission(GL_ACCOUNTS_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const type = queryString(req, "type");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(account.voidedAt), type ? eq(account.type, type as AccountRow["type"]) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(account).where(where).orderBy(account.code).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(account).where(where),
    ]);
    return { items: rows.map(accountToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

procurementRouter.get("/gl/accounts/:id", requireAuth, requirePermission(GL_ACCOUNTS_MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [r] = await tx.select().from(account).where(and(eq(account.id, paramId(req)), isNull(account.voidedAt)));
    return r;
  });
  if (!row) {
    res.status(404).json(notFound("Account"));
    return;
  }
  res.status(200).json(accountToApi(row));
});

procurementRouter.put("/gl/accounts/:id", requireAuth, requirePermission(GL_ACCOUNTS_MODULE, "edit"), async (req, res) => {
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const row = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [existing] = await tx.select().from(account).where(and(eq(account.id, id), isNull(account.voidedAt)));
    if (!existing) return null;
    const [updated] = await tx
      .update(account)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.parentAccountId !== undefined && { parentAccountId: input.parentAccountId }),
        updatedAt: new Date(),
      })
      .where(eq(account.id, id))
      .returning();
    return updated;
  });
  if (!row) {
    res.status(404).json(notFound("Account"));
    return;
  }
  res.status(200).json(accountToApi(row));
});
