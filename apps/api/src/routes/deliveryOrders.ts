import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { customer, deliveryOrder, batchRecord, proofOfDelivery, salesOrder, withTenant, type Tx } from "@rmixerp/db";
import { assertDeliveryOrderTransition, evaluateCreditCheck, fils, filsToJodString, ZERO_FILS } from "@rmixerp/core";
import {
  CreateDeliveryOrderBody,
  DeliverDeliveryOrderBody,
  DispatchDeliveryOrderBody,
  UpdateDeliveryOrderBody,
  type DeliveryOrder,
  type DeliveryOrderDetail,
  type DispatchScheduleItem,
  type ProofOfDelivery,
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

function toApi(row: DeliveryOrderRow, batch: BatchRecordRow | null): DeliveryOrder {
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
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
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
  return { ...toApi(row, batch), proofOfDelivery: pod ? podToApi(pod) : null };
}

deliveryOrdersRouter.get("/delivery-orders", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const branchId = queryString(req, "branchId");
  const driverId = queryString(req, "driverId");
  const scheduledFrom = queryString(req, "scheduledFrom");
  const scheduledTo = queryString(req, "scheduledTo");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(deliveryOrder.voidedAt),
      status ? eq(deliveryOrder.status, status as DeliveryOrderRow["status"]) : undefined,
      branchId ? eq(deliveryOrder.branchId, branchId) : undefined,
      driverId ? eq(deliveryOrder.driverId, driverId) : undefined,
      scheduledFrom ? gte(deliveryOrder.scheduledAt, new Date(scheduledFrom)) : undefined,
      scheduledTo ? lte(deliveryOrder.scheduledAt, new Date(scheduledTo)) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(deliveryOrder).where(where).orderBy(desc(deliveryOrder.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(deliveryOrder).where(where),
    ]);
    const batchIds = rows.map((r) => r.batchRecordId).filter((id): id is string => id !== null);
    const batches = batchIds.length > 0 ? await tx.select().from(batchRecord).where(inArray(batchRecord.id, batchIds)) : [];
    const batchById = new Map(batches.map((b) => [b.id, b]));
    return {
      items: rows.map((r) => toApi(r, r.batchRecordId ? (batchById.get(r.batchRecordId) ?? null) : null)),
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

    const [row] = await tx
      .insert(deliveryOrder)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        salesOrderId: input.salesOrderId,
        salesOrderLineId: input.salesOrderLineId ?? null,
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
  const batch = await withTenant(db, req.auth!.companyId, (tx) => loadBatch(tx, result.row.batchRecordId));
  res.status(201).json(toApi(result.row, batch));
});

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

      if (creditCheck.outcome === "blocked" && !input.override) {
        return { kind: "blocked" as const, creditCheck };
      }
      let appliedOverride = false;
      if (creditCheck.outcome === "blocked" && input.override) {
        if (!(req.auth!.permissions ?? []).includes(`${MODULE}:approve`)) {
          return { kind: "override_forbidden" as const };
        }
        appliedOverride = true;
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
          creditOverride: appliedOverride,
          creditOverrideReason: appliedOverride ? (input.override?.reason ?? null) : null,
          creditOverrideBy: appliedOverride ? req.auth!.userId : null,
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
      if (appliedOverride) {
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

    return rows.map((r) => {
      const batch = r.delivery.batchRecordId ? (batchById.get(r.delivery.batchRecordId) ?? null) : null;
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
        qcFlagged: batch?.qcFlagged ?? false,
      };
    });
  });

  res.status(200).json({ items });
});
