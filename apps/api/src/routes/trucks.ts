import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { truck, withTenant, type Tx } from "@rmixerp/db";
import { CreateTruckBody, UpdateTruckBody, VoidTruckBody, type Truck } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const trucksRouter = Router();
const MODULE = "trucks";

type TruckRow = typeof truck.$inferSelect;

function toApi(row: TruckRow): Truck {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    plateNumber: row.plateNumber,
    capacityM3: row.capacityM3,
    registrationExpiresAt: row.registrationExpiresAt?.toISOString() ?? null,
    insuranceExpiresAt: row.insuranceExpiresAt?.toISOString() ?? null,
    inspectionExpiresAt: row.inspectionExpiresAt?.toISOString() ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<TruckRow | undefined> {
  const [row] = await tx
    .select()
    .from(truck)
    .where(and(eq(truck.id, id), isNull(truck.voidedAt)));
  return row;
}

trucksRouter.get("/trucks", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(truck.voidedAt),
      q ? ilike(truck.plateNumber, `%${q}%`) : undefined,
      branchId ? eq(truck.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(truck).where(where).orderBy(desc(truck.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(truck).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

trucksRouter.get("/trucks/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Truck"));
    return;
  }
  res.status(200).json(toApi(row));
});

trucksRouter.post("/trucks", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateTruckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(truck)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        plateNumber: input.plateNumber,
        capacityM3: input.capacityM3 ?? null,
        registrationExpiresAt: input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
        insuranceExpiresAt: input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
        inspectionExpiresAt: input.inspectionExpiresAt ? new Date(input.inspectionExpiresAt) : null,
        isActive: input.isActive ?? true,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: input.branchId,
      actorUserId: req.auth!.userId,
      entityType: "truck",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

trucksRouter.put("/trucks/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateTruckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const updated = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(truck)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.plateNumber !== undefined && { plateNumber: input.plateNumber }),
        ...(input.capacityM3 !== undefined && { capacityM3: input.capacityM3 }),
        ...(input.registrationExpiresAt !== undefined && {
          registrationExpiresAt: input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
        }),
        ...(input.insuranceExpiresAt !== undefined && {
          insuranceExpiresAt: input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
        }),
        ...(input.inspectionExpiresAt !== undefined && {
          inspectionExpiresAt: input.inspectionExpiresAt ? new Date(input.inspectionExpiresAt) : null,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(truck.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "truck",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Truck"));
    return;
  }
  res.status(200).json(toApi(updated));
});

trucksRouter.delete("/trucks/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidTruckBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(truck).set({ voidedAt: new Date() }).where(eq(truck.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "truck",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Truck"));
    return;
  }
  res.status(204).send();
});
