import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { driver, withTenant, type Tx } from "@rmixerp/db";
import { CreateDriverBody, UpdateDriverBody, VoidDriverBody, type Driver } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const driversRouter = Router();
const MODULE = "drivers";

type DriverRow = typeof driver.$inferSelect;

function toApi(row: DriverRow): Driver {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    name: row.name,
    phone: row.phone,
    licenseNumber: row.licenseNumber,
    isActive: row.isActive,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<DriverRow | undefined> {
  const [row] = await tx
    .select()
    .from(driver)
    .where(and(eq(driver.id, id), isNull(driver.voidedAt)));
  return row;
}

driversRouter.get("/drivers", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(driver.voidedAt),
      q ? ilike(driver.name, `%${q}%`) : undefined,
      branchId ? eq(driver.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(driver).where(where).orderBy(desc(driver.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(driver).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

driversRouter.get("/drivers/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Driver"));
    return;
  }
  res.status(200).json(toApi(row));
});

driversRouter.post("/drivers", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(driver)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        name: input.name,
        phone: input.phone ?? null,
        licenseNumber: input.licenseNumber ?? null,
        isActive: input.isActive ?? true,
        userId: input.userId ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: input.branchId,
      actorUserId: req.auth!.userId,
      entityType: "driver",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

driversRouter.put("/drivers/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateDriverBody.safeParse(req.body);
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
      .update(driver)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.licenseNumber !== undefined && { licenseNumber: input.licenseNumber }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.userId !== undefined && { userId: input.userId }),
        updatedAt: new Date(),
      })
      .where(eq(driver.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "driver",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Driver"));
    return;
  }
  res.status(200).json(toApi(updated));
});

driversRouter.delete("/drivers/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidDriverBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(driver).set({ voidedAt: new Date() }).where(eq(driver.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "driver",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Driver"));
    return;
  }
  res.status(204).send();
});
