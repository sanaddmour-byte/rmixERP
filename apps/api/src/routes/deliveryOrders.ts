import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  company,
  customer,
  deliveryOrder,
  batchRecord,
  driver,
  product,
  project,
  proofOfDelivery,
  salesOrder,
  salesOrderLine,
  truck,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import { assertDeliveryOrderTransition, evaluateCreditCheck, evaluateDocumentExpiry, fils, filsToJodString, ZERO_FILS } from "@rmixerp/core";
import {
  CreateDeliveryOrderBody,
  DeliverDeliveryOrderBody,
  DispatchDeliveryOrderBody,
  ReconcileDeliveryOrderSalesOrderLineBody,
  UpdateDeliveryOrderBody,
  type DeliveryOrder,
  type DeliveryOrderDetail,
  type DispatchScheduleItem,
  type ProofOfDelivery,
  type ReconcileSalesOrderLineResponse,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { computeOutstandingInvoiceExposure } from "../lib/creditExposure";
import { writeAudit } from "../audit";

export const deliveryOrdersRouter = Router();
const MODULE = "deliveryOrders";

type DeliveryOrderRow = typeof deliveryOrder.$inferSelect;
type BatchRecordRow = typeof batchRecord.$inferSelect;
type ProofOfDeliveryRow = typeof proofOfDelivery.$inferSelect;

interface JoinedNames {
  customerName: string;
  projectName: string | null;
  productName: string | null;
}

const UNKNOWN_JOINED_NAMES: JoinedNames = { customerName: "—", projectName: null, productName: null };

function toApi(row: DeliveryOrderRow, batch: BatchRecordRow | null, joined: JoinedNames = UNKNOWN_JOINED_NAMES): DeliveryOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    salesOrderId: row.salesOrderId,
    salesOrderLineId: row.salesOrderLineId,
    productionOrderId: row.productionOrderId,
    batchRecordId: row.batchRecordId,
    truckId: row.truckId,
    driverId: row.driverId,
    quantityM3: row.quantityM3,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    qcFlagged: batch?.qcFlagged ?? false,
    qcFlagReason: batch?.qcFlagReason ?? null,
    creditCheckPolicy: row.creditCheckPolicy,
    creditCheckOutstandingJod: row.creditCheckOutstandingFils !== null ? filsToJodString(fils(row.creditCheckOutstandingFils)) : null,
    creditCheckExceedsByJod: row.creditCheckExceedsByFils !== null ? filsToJodString(fils(row.creditCheckExceedsByFils)) : null,
    creditOverride: row.creditOverride,
    creditOverrideReason: row.creditOverrideReason,
    creditOverrideBy: row.creditOverrideBy,
    documentExpiryOverride: row.documentExpiryOverride,
    documentExpiryOverrideReason: row.documentExpiryOverrideReason,
    documentExpiryOverrideBy: row.documentExpiryOverrideBy,
    notes: row.notes,
    customerName: joined.customerName,
    projectName: joined.projectName,
    productName: joined.productName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

/**
 * Batched name lookups for a set of delivery orders — customer/project via
 * their sales order, product via their sales-order line (null for a
 * legacy delivery created before that field was required). One query per
 * join, not per row.
 */
async function loadJoinedNames(tx: Tx, deliveryIds: string[]): Promise<Map<string, JoinedNames>> {
  const result = new Map<string, JoinedNames>();
  if (deliveryIds.length === 0) return result;

  const rows = await tx
    .select({
      deliveryId: deliveryOrder.id,
      customerName: customer.name,
      projectName: project.name,
      productName: product.name,
    })
    .from(deliveryOrder)
    .innerJoin(salesOrder, eq(deliveryOrder.salesOrderId, salesOrder.id))
    .innerJoin(customer, eq(salesOrder.customerId, customer.id))
    .leftJoin(project, eq(salesOrder.projectId, project.id))
    .leftJoin(salesOrderLine, eq(deliveryOrder.salesOrderLineId, salesOrderLine.id))
    .leftJoin(product, eq(salesOrderLine.productId, product.id))
    .where(inArray(deliveryOrder.id, deliveryIds));

  for (const r of rows) {
    result.set(r.deliveryId, { customerName: r.customerName, projectName: r.projectName, productName: r.productName });
  }
  return result;
}

function podToApi(row: ProofOfDeliveryRow): ProofOfDelivery {
  return {
    id: row.id,
    companyId: row.companyId,
    deliveryOrderId: row.deliveryOrderId,
    receivedQuantityM3: row.receivedQuantityM3,
    signedByName: row.signedByName,
    signatureData: row.signatureData,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findActiveDeliveryOrder(tx: Tx, id: string): Promise<DeliveryOrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(deliveryOrder)
    .where(and(eq(deliveryOrder.id, id), isNull(deliveryOrder.voidedAt)));
  return row;
}

async function loadBatch(tx: Tx, batchRecordId: string | null): Promise<BatchRecordRow | null> {
  if (!batchRecordId) return null;
  const [row] = await tx.select().from(batchRecord).where(eq(batchRecord.id, batchRecordId));
  return row ?? null;
}

async function loadDeliveryOrderDetail(tx: Tx, id: string): Promise<DeliveryOrderDetail | null> {
  const row = await findActiveDeliveryOrder(tx, id);
  if (!row) return null;
  const batch = await loadBatch(tx, row.batchRecordId);
  const [pod] = await tx.select().from(proofOfDelivery).where(eq(proofOfDelivery.deliveryOrderId, id));
  const joined = (await loadJoinedNames(tx, [id])).get(id);
  return { ...toApi(row, batch, joined), proofOfDelivery: pod ? podToApi(pod) : null };
}

deliveryOrdersRouter.get("/delivery-orders", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const branchId = queryString(req, "branchId");
  const driverId = queryString(req, "driverId");
  const truckId = queryString(req, "truckId");
  const unassigned = queryString(req, "unassigned") === "true";
  const salesOrderId = queryString(req, "salesOrderId");
  const scheduledFrom = queryString(req, "scheduledFrom");
  const scheduledTo = queryString(req, "scheduledTo");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const salesOrderLineIds = salesOrderId
      ? (await tx.select({ id: salesOrderLine.id }).from(salesOrderLine).where(eq(salesOrderLine.salesOrderId, salesOrderId))).map(
          (r) => r.id,
        )
      : null;
    const where = and(
      isNull(deliveryOrder.voidedAt),
      status ? eq(deliveryOrder.status, status as DeliveryOrderRow["status"]) : undefined,
      branchId ? eq(deliveryOrder.branchId, branchId) : undefined,
      driverId ? eq(deliveryOrder.driverId, driverId) : undefined,
      truckId ? eq(deliveryOrder.truckId, truckId) : undefined,
      unassigned ? or(isNull(deliveryOrder.truckId), isNull(deliveryOrder.driverId)) : undefined,
      salesOrderLineIds ? inArray(deliveryOrder.salesOrderLineId, salesOrderLineIds) : undefined,
      scheduledFrom ? gte(deliveryOrder.scheduledAt, new Date(scheduledFrom)) : undefined,
      scheduledTo ? lte(deliveryOrder.scheduledAt, new Date(scheduledTo)) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(deliveryOrder).where(where).orderBy(desc(deliveryOrder.createdAt), deliveryOrder.id).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(deliveryOrder).where(where),
    ]);
    const batchIds = rows.map((r) => r.batchRecordId).filter((id): id is string => id !== null);
    const batches = batchIds.length > 0 ? await tx.select().from(batchRecord).where(inArray(batchRecord.id, batchIds)) : [];
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const joinedByDeliveryId = await loadJoinedNames(tx, rows.map((r) => r.id));
    return {
      items: rows.map((r) => toApi(r, r.batchRecordId ? (batchById.get(r.batchRecordId) ?? null) : null, joinedByDeliveryId.get(r.id))),
      total: countRows[0]?.count ?? 0,
    };
  });

  res.status(200).json(paginatedBody(items, total, pagination));
});

deliveryOrdersRouter.post("/delivery-orders", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateDeliveryOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [order] = await tx
      .select()
      .from(salesOrder)
      .where(and(eq(salesOrder.id, input.salesOrderId), isNull(salesOrder.voidedAt)));
    if (!order) return { kind: "not_found_sales_order" as const };
    if (order.status !== "confirmed" && order.status !== "fulfilled") return { kind: "invalid_sales_order_status" as const };

    // A delivery can only ever be invoiced against the line it names (see
    // invoices.ts's hard require), so a line from the wrong order — or no
    // line at all — silently produces an uninvoiceable delivery. Required
    // on the request schema already; this closes the server-side gap that
    // let a mismatched line slip through unchecked.
    const [line] = await tx
      .select()
      .from(salesOrderLine)
      .where(and(eq(salesOrderLine.id, input.salesOrderLineId), isNull(salesOrderLine.voidedAt)));
    if (!line || line.salesOrderId !== input.salesOrderId) return { kind: "invalid_sales_order_line" as const };

    const [row] = await tx
      .insert(deliveryOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        salesOrderId: input.salesOrderId,
        salesOrderLineId: input.salesOrderLineId,
        productionOrderId: input.productionOrderId ?? null,
        batchRecordId: input.batchRecordId ?? null,
        quantityM3: input.quantityM3,
        scheduledAt: new Date(input.scheduledAt),
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: input.branchId,
      actorUserId: req.auth!.userId,
      entityType: "delivery_order",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return { kind: "ok" as const, row };
  });

  if (result.kind === "not_found_sales_order") {
    res.status(404).json(notFound("Sales order"));
    return;
  }
  if (result.kind === "invalid_sales_order_status") {
    res.status(400).json(validationError({ salesOrderId: "sales order must be confirmed or fulfilled" }));
    return;
  }
  if (result.kind === "invalid_sales_order_line") {
    res.status(400).json(validationError({ salesOrderLineId: "must be a non-voided line belonging to the given sales order" }));
    return;
  }
  const batch = await withTenant(db, req.auth!.companyId, (tx) => loadBatch(tx, result.row.batchRecordId));
  res.status(201).json(toApi(result.row, batch));
});

/**
 * Audited repair path for delivery orders created before `salesOrderLineId`
 * became required (see CreateDeliveryOrderBody) — backfills only the
 * unambiguous case (the referenced sales order has exactly one non-voided
 * line), leaving every genuinely ambiguous row untouched and reported
 * under `needsReview` rather than guessed at. Gated behind `:approve`
 * (a privileged, data-correcting bulk action), same tier as the
 * credit/document-expiry override pattern elsewhere in this router.
 */
deliveryOrdersRouter.post(
  "/delivery-orders/reconcile-sales-order-line",
  requireAuth,
  requirePermission(MODULE, "approve"),
  async (req, res) => {
    const parsed = ReconcileDeliveryOrderSalesOrderLineBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const dryRun = parsed.data.dryRun;

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const orphans = await tx
        .select()
        .from(deliveryOrder)
        .where(and(isNull(deliveryOrder.salesOrderLineId), isNull(deliveryOrder.voidedAt)));

      const bySalesOrder = new Map<string, DeliveryOrderRow[]>();
      for (const o of orphans) {
        const arr = bySalesOrder.get(o.salesOrderId) ?? [];
        arr.push(o);
        bySalesOrder.set(o.salesOrderId, arr);
      }

      const backfilled: ReconcileSalesOrderLineResponse["backfilled"] = [];
      const needsReview: ReconcileSalesOrderLineResponse["needsReview"] = [];

      for (const [salesOrderId, deliveries] of bySalesOrder) {
        const lines = await tx
          .select({ id: salesOrderLine.id })
          .from(salesOrderLine)
          .where(and(eq(salesOrderLine.salesOrderId, salesOrderId), isNull(salesOrderLine.voidedAt)));

        if (lines.length !== 1) {
          for (const d of deliveries) {
            needsReview.push({
              deliveryOrderId: d.id,
              salesOrderId,
              candidateLineCount: lines.length,
              reason:
                lines.length === 0
                  ? "sales order has no non-voided lines"
                  : "sales order has multiple lines — cannot infer which one without ambiguity",
            });
          }
          continue;
        }

        const onlyLineId = lines[0]!.id;
        for (const before of deliveries) {
          backfilled.push({ deliveryOrderId: before.id, salesOrderId, salesOrderLineId: onlyLineId });
          if (dryRun) continue;
          const [after] = await tx
            .update(deliveryOrder)
            .set({ salesOrderLineId: onlyLineId, updatedAt: new Date() })
            .where(eq(deliveryOrder.id, before.id))
            .returning();
          if (!after) throw new Error("reconcile update returned no row");
          await writeAudit(tx, {
            companyId: req.auth!.companyId,
            branchId: before.branchId,
            actorUserId: req.auth!.userId,
            entityType: "delivery_order",
            entityId: before.id,
            action: "backfill:sales_order_line",
            before,
            after,
            reason: "Unambiguous single-line sales order — automated reconciliation (POST /delivery-orders/reconcile-sales-order-line).",
          });
        }
      }

      return { backfilled, needsReview };
    });

    res.status(200).json({ dryRun, backfilled: result.backfilled, needsReview: result.needsReview } satisfies ReconcileSalesOrderLineResponse);
  },
);

deliveryOrdersRouter.get("/delivery-orders/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadDeliveryOrderDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Delivery order"));
    return;
  }
  res.status(200).json(body);
});

deliveryOrdersRouter.put("/delivery-orders/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateDeliveryOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveDeliveryOrder(tx, id);
    if (!before) return { kind: "not_found" as const };
    if (before.status !== "planned") return { kind: "invalid_status" as const };

    const [row] = await tx
      .update(deliveryOrder)
      .set({
        ...(input.quantityM3 !== undefined && { quantityM3: input.quantityM3 }),
        ...(input.scheduledAt !== undefined && { scheduledAt: new Date(input.scheduledAt) }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: new Date(),
      })
      .where(eq(deliveryOrder.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "delivery_order",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Delivery order"));
    return;
  }
  if (result.kind === "invalid_status") {
    res.status(400).json(validationError({ status: "delivery order must be planned to edit" }));
    return;
  }
  res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadDeliveryOrderDetail(tx, id)))!);
});

deliveryOrdersRouter.post(
  "/delivery-orders/:id/dispatch",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = DispatchDeliveryOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveDeliveryOrder(tx, id);
      if (!before) return { kind: "not_found" as const };
      if (before.status !== "planned") return { kind: "invalid_status" as const };
      assertDeliveryOrderTransition(before.status, "dispatched");

      const [order] = await tx.select().from(salesOrder).where(eq(salesOrder.id, before.salesOrderId));
      if (!order) throw new Error("delivery order references a missing sales order");
      const [cust] = await tx.select().from(customer).where(eq(customer.id, order.customerId));
      if (!cust) throw new Error("sales order references a missing customer");

      const currentOutstandingFils = await computeOutstandingInvoiceExposure(tx, order.customerId);

      const creditCheck = evaluateCreditCheck({
        policy: cust.creditPolicy,
        creditLimitFils: fils(cust.creditLimitFils),
        currentOutstandingFils,
        newOrderAmountFils: ZERO_FILS,
      });

      const [truckRow] = await tx.select().from(truck).where(eq(truck.id, input.truckId));
      const [driverRow] = await tx.select().from(driver).where(eq(driver.id, input.driverId));
      const [companyRow] = await tx.select().from(company);
      const documentCheck = evaluateDocumentExpiry({
        asOf: new Date(),
        warningDays: companyRow?.documentExpiryWarningDays ?? 30,
        truck: truckRow
          ? { registrationExpiresAt: truckRow.registrationExpiresAt, insuranceExpiresAt: truckRow.insuranceExpiresAt, inspectionExpiresAt: truckRow.inspectionExpiresAt }
          : null,
        driver: driverRow ? { licenseExpiresAt: driverRow.licenseExpiresAt } : null,
      });

      if (creditCheck.outcome === "blocked" && !input.override) {
        return { kind: "blocked" as const, creditCheck };
      }
      if (documentCheck.blocked && !input.override) {
        return { kind: "document_expiry_blocked" as const, documentCheck };
      }
      let appliedCreditOverride = false;
      let appliedDocumentExpiryOverride = false;
      if ((creditCheck.outcome === "blocked" || documentCheck.blocked) && input.override) {
        if (!(req.auth!.permissions ?? []).includes(`${MODULE}:approve`)) {
          return { kind: "override_forbidden" as const };
        }
        appliedCreditOverride = creditCheck.outcome === "blocked";
        appliedDocumentExpiryOverride = documentCheck.blocked;
      }

      const [row] = await tx
        .update(deliveryOrder)
        .set({
          status: "dispatched",
          truckId: input.truckId,
          driverId: input.driverId,
          dispatchedAt: new Date(),
          creditCheckPolicy: cust.creditPolicy,
          creditCheckOutstandingFils: creditCheck.projectedOutstandingFils,
          creditCheckExceedsByFils: creditCheck.exceedsByFils,
          creditOverride: appliedCreditOverride,
          creditOverrideReason: appliedCreditOverride ? (input.override?.reason ?? null) : null,
          creditOverrideBy: appliedCreditOverride ? req.auth!.userId : null,
          documentExpiryOverride: appliedDocumentExpiryOverride,
          documentExpiryOverrideReason: appliedDocumentExpiryOverride ? (input.override?.reason ?? null) : null,
          documentExpiryOverrideBy: appliedDocumentExpiryOverride ? req.auth!.userId : null,
          updatedAt: new Date(),
        })
        .where(eq(deliveryOrder.id, id))
        .returning();
      if (!row) throw new Error("dispatch returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: before.branchId,
        actorUserId: req.auth!.userId,
        entityType: "delivery_order",
        entityId: row.id,
        action: "transition:dispatched",
        before,
        after: row,
      });
      if (appliedCreditOverride) {
        await writeAudit(tx, {
          companyId: req.auth!.companyId,
          branchId: before.branchId,
          actorUserId: req.auth!.userId,
          entityType: "delivery_order",
          entityId: row.id,
          action: "credit_override",
          reason: input.override?.reason ?? null,
        });
      }
      if (appliedDocumentExpiryOverride) {
        await writeAudit(tx, {
          companyId: req.auth!.companyId,
          branchId: before.branchId,
          actorUserId: req.auth!.userId,
          entityType: "delivery_order",
          entityId: row.id,
          action: "document_expiry_override",
          reason: input.override?.reason ?? null,
        });
      }
      return { kind: "ok" as const };
    });

    switch (result.kind) {
      case "not_found":
        res.status(404).json(notFound("Delivery order"));
        return;
      case "invalid_status":
        res.status(400).json(validationError({ status: "delivery order must be planned" }));
        return;
      case "override_forbidden":
        res.status(403).json({ error: { message: `Missing permission ${MODULE}:approve`, code: "forbidden" } });
        return;
      case "blocked":
        res.status(409).json({
          error: {
            message: "Customer's credit standing exceeds their limit",
            code: "credit_blocked",
            details: {
              exceedsByJod: filsToJodString(result.creditCheck.exceedsByFils),
              outstandingJod: filsToJodString(result.creditCheck.projectedOutstandingFils),
            },
          },
        });
        return;
      case "document_expiry_blocked":
        res.status(422).json({
          error: {
            message: "The assigned truck or driver has an expired document",
            code: "document_expired",
            details: { expiredDocuments: result.documentCheck.expiredDocuments },
          },
        });
        return;
      case "ok":
        res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadDeliveryOrderDetail(tx, id)))!);
    }
  },
);

deliveryOrdersRouter.post(
  "/delivery-orders/:id/deliver",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = DeliverDeliveryOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveDeliveryOrder(tx, id);
      if (!before) return { kind: "not_found" as const };
      if (before.status !== "dispatched") return { kind: "invalid_status" as const };
      assertDeliveryOrderTransition(before.status, "delivered");

      const [pod] = await tx
        .insert(proofOfDelivery)
        .values({
          companyId: req.auth!.companyId,
          deliveryOrderId: id,
          receivedQuantityM3: input.receivedQuantityM3,
          signedByName: input.signedByName,
          signatureData: input.signatureData,
          notes: input.notes ?? null,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!pod) throw new Error("insert returned no row");

      const [row] = await tx
        .update(deliveryOrder)
        .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(deliveryOrder.id, id))
        .returning();
      if (!row) throw new Error("deliver returned no row");

      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: before.branchId,
        actorUserId: req.auth!.userId,
        entityType: "delivery_order",
        entityId: row.id,
        action: "transition:delivered",
        before,
        after: row,
      });
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: before.branchId,
        actorUserId: req.auth!.userId,
        entityType: "proof_of_delivery",
        entityId: pod.id,
        action: "create",
        after: pod,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Delivery order"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "delivery order must be dispatched" }));
      return;
    }
    res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadDeliveryOrderDetail(tx, id)))!);
  },
);

deliveryOrdersRouter.get("/dispatch/schedule", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const branchId = queryString(req, "branchId");
  const from = queryString(req, "from");
  const to = queryString(req, "to");
  if (!branchId || !from || !to) {
    res.status(400).json(validationError({ query: "branchId, from, and to are required" }));
    return;
  }

  const items: DispatchScheduleItem[] = await withTenant(db, req.auth!.companyId, async (tx) => {
    const rows = await tx
      .select({ delivery: deliveryOrder, customerName: customer.name })
      .from(deliveryOrder)
      .innerJoin(salesOrder, eq(deliveryOrder.salesOrderId, salesOrder.id))
      .innerJoin(customer, eq(salesOrder.customerId, customer.id))
      .where(
        and(
          isNull(deliveryOrder.voidedAt),
          eq(deliveryOrder.branchId, branchId),
          gte(deliveryOrder.scheduledAt, new Date(from)),
          lte(deliveryOrder.scheduledAt, new Date(to)),
        ),
      );
    const batchIds = rows.map((r) => r.delivery.batchRecordId).filter((bid): bid is string => bid !== null);
    const batches = batchIds.length > 0 ? await tx.select().from(batchRecord).where(inArray(batchRecord.id, batchIds)) : [];
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const joinedByDeliveryId = await loadJoinedNames(tx, rows.map((r) => r.delivery.id));

    return rows.map((r) => {
      const batch = r.delivery.batchRecordId ? (batchById.get(r.delivery.batchRecordId) ?? null) : null;
      const joined = joinedByDeliveryId.get(r.delivery.id);
      return {
        id: r.delivery.id,
        status: r.delivery.status,
        quantityM3: r.delivery.quantityM3,
        scheduledAt: r.delivery.scheduledAt.toISOString(),
        dispatchedAt: r.delivery.dispatchedAt?.toISOString() ?? null,
        deliveredAt: r.delivery.deliveredAt?.toISOString() ?? null,
        truckId: r.delivery.truckId,
        driverId: r.delivery.driverId,
        customerName: r.customerName,
        projectName: joined?.projectName ?? null,
        productName: joined?.productName ?? null,
        qcFlagged: batch?.qcFlagged ?? false,
      };
    });
  });

  res.status(200).json({ items });
});
