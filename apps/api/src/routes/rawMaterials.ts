import { Router } from "express";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { rawMaterial, withTenant, type Tx } from "@rmixerp/db";
import { CreateRawMaterialBody, UpdateRawMaterialBody, VoidRawMaterialBody, type RawMaterial } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const rawMaterialsRouter = Router();
const MODULE = "rawMaterials";

type RawMaterialRow = typeof rawMaterial.$inferSelect;

function toApi(row: RawMaterialRow): RawMaterial {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    name: row.name,
    code: row.code,
    unit: row.unit,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<RawMaterialRow | undefined> {
  const [row] = await tx
    .select()
    .from(rawMaterial)
    .where(and(eq(rawMaterial.id, id), isNull(rawMaterial.voidedAt)));
  return row;
}

rawMaterialsRouter.get("/raw-materials", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(rawMaterial.voidedAt), q ? ilike(rawMaterial.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(rawMaterial).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(rawMaterial).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "raw-materials.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "code", header: "Code" },
      { key: "unit", header: "Unit" },
      { key: "category", header: "Category" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

rawMaterialsRouter.get("/raw-materials/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Raw material"));
    return;
  }
  res.status(200).json(toApi(row));
});

rawMaterialsRouter.post("/raw-materials", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateRawMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(rawMaterial)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId ?? null,
        name: input.name,
        code: input.code,
        unit: input.unit,
        category: input.category ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "raw_material",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

rawMaterialsRouter.put("/raw-materials/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateRawMaterialBody.safeParse(req.body);
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
      .update(rawMaterial)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.code !== undefined && { code: input.code }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.category !== undefined && { category: input.category }),
        updatedAt: new Date(),
      })
      .where(eq(rawMaterial.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "raw_material",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Raw material"));
    return;
  }
  res.status(200).json(toApi(updated));
});

rawMaterialsRouter.delete("/raw-materials/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidRawMaterialBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(rawMaterial)
      .set({ voidedAt: new Date() })
      .where(eq(rawMaterial.id, id))
      .returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "raw_material",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Raw material"));
    return;
  }
  res.status(204).send();
});
