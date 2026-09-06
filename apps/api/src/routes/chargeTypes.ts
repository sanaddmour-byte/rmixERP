import { Router } from "express";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { chargeType, withTenant, type Tx } from "@rmixerp/db";
import { fils, filsToJodString, jodStringToFils } from "@rmixerp/core";
import { CreateChargeTypeBody, UpdateChargeTypeBody, VoidChargeTypeBody, type ChargeType } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const chargeTypesRouter = Router();
const MODULE = "chargeTypes";

type ChargeTypeRow = typeof chargeType.$inferSelect;

function toApi(row: ChargeTypeRow): ChargeType {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    calculationMethod: row.calculationMethod,
    defaultAmountJod: row.defaultAmountFils === null ? null : filsToJodString(fils(row.defaultAmountFils)),
    percentageBasisPoints: row.percentageBasisPoints,
    taxRateBasisPoints: row.taxRateBasisPoints,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<ChargeTypeRow | undefined> {
  const [row] = await tx
    .select()
    .from(chargeType)
    .where(and(eq(chargeType.id, id), isNull(chargeType.voidedAt)));
  return row;
}

chargeTypesRouter.get("/charge-types", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(chargeType.voidedAt), q ? ilike(chargeType.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(chargeType).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(chargeType).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "charge-types.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "calculationMethod", header: "Calculation Method" },
      { key: "defaultAmountJod", header: "Default Amount (JOD)" },
      { key: "isActive", header: "Active" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

chargeTypesRouter.get("/charge-types/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Charge type"));
    return;
  }
  res.status(200).json(toApi(row));
});

chargeTypesRouter.post("/charge-types", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateChargeTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(chargeType)
      .values({
        companyId: req.auth!.companyId,
        name: input.name,
        calculationMethod: input.calculationMethod ?? "flat",
        defaultAmountFils: input.defaultAmountJod != null ? jodStringToFils(input.defaultAmountJod) : null,
        percentageBasisPoints: input.percentageBasisPoints ?? null,
        taxRateBasisPoints: input.taxRateBasisPoints ?? 1600,
        isActive: input.isActive ?? true,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "charge_type",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

chargeTypesRouter.put("/charge-types/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateChargeTypeBody.safeParse(req.body);
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
      .update(chargeType)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.calculationMethod !== undefined && { calculationMethod: input.calculationMethod }),
        ...(input.defaultAmountJod !== undefined && {
          defaultAmountFils: input.defaultAmountJod != null ? jodStringToFils(input.defaultAmountJod) : null,
        }),
        ...(input.percentageBasisPoints !== undefined && { percentageBasisPoints: input.percentageBasisPoints }),
        ...(input.taxRateBasisPoints !== undefined && { taxRateBasisPoints: input.taxRateBasisPoints }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(chargeType.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "charge_type",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Charge type"));
    return;
  }
  res.status(200).json(toApi(updated));
});

chargeTypesRouter.delete("/charge-types/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidChargeTypeBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(chargeType)
      .set({ voidedAt: new Date() })
      .where(eq(chargeType.id, id))
      .returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "charge_type",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Charge type"));
    return;
  }
  res.status(204).send();
});
