import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { priceList, priceListLine, withTenant, type Tx } from "@rmixerp/db";
import { fils, filsToJodString, jodStringToFils } from "@rmixerp/core";
import {
  CreatePriceListBody,
  CreatePriceListLineBody,
  UpdatePriceListBody,
  UpdatePriceListLineBody,
  VoidPriceListBody,
  VoidPriceListLineBody,
  type PriceList,
  type PriceListLine,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const priceListsRouter = Router();
const MODULE = "priceLists";

type PriceListRow = typeof priceList.$inferSelect;
type PriceListLineRow = typeof priceListLine.$inferSelect;

function toApi(row: PriceListRow): PriceList {
  return {
    id: row.id,
    companyId: row.companyId,
    tier: row.tier,
    projectId: row.projectId,
    customerId: row.customerId,
    branchId: row.branchId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function lineToApi(row: PriceListLineRow): PriceListLine {
  return {
    id: row.id,
    companyId: row.companyId,
    priceListId: row.priceListId,
    productId: row.productId,
    concreteUnitPriceJod: filsToJodString(fils(row.concreteUnitPriceFils)),
    deliveryUnitPriceJod: filsToJodString(fils(row.deliveryUnitPriceFils)),
    taxRateBasisPoints: row.taxRateBasisPoints,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<PriceListRow | undefined> {
  const [row] = await tx
    .select()
    .from(priceList)
    .where(and(eq(priceList.id, id), isNull(priceList.voidedAt)));
  return row;
}

async function findActiveLine(tx: Tx, priceListId: string, id: string): Promise<PriceListLineRow | undefined> {
  const [row] = await tx
    .select()
    .from(priceListLine)
    .where(
      and(eq(priceListLine.id, id), eq(priceListLine.priceListId, priceListId), isNull(priceListLine.voidedAt)),
    );
  return row;
}

/** Exactly one of projectId/customerId/branchId must be set, matching `tier`. */
function tierFkMatches(
  tier: string,
  body: { projectId?: string | null | undefined; customerId?: string | null | undefined; branchId?: string | null | undefined },
): boolean {
  const projectId = body.projectId ?? null;
  const customerId = body.customerId ?? null;
  const branchId = body.branchId ?? null;
  switch (tier) {
    case "project":
      return projectId !== null && customerId === null && branchId === null;
    case "customer":
      return customerId !== null && projectId === null && branchId === null;
    case "branch":
      return branchId !== null && projectId === null && customerId === null;
    case "company":
      return projectId === null && customerId === null && branchId === null;
    default:
      return false;
  }
}

priceListsRouter.get("/price-lists", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(priceList.voidedAt), q ? ilike(priceList.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(priceList).where(where).orderBy(desc(priceList.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(priceList).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "price-lists.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "tier", header: "Tier" },
      { key: "isActive", header: "Active" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

priceListsRouter.get("/price-lists/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const row = await findActive(tx, paramId(req));
    if (!row) return null;
    const lines = await tx
      .select()
      .from(priceListLine)
      .where(and(eq(priceListLine.priceListId, row.id), isNull(priceListLine.voidedAt)));
    return { row, lines };
  });
  if (!result) {
    res.status(404).json(notFound("Price list"));
    return;
  }
  res.status(200).json({ ...toApi(result.row), lines: result.lines.map(lineToApi) });
});

priceListsRouter.post("/price-lists", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreatePriceListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  if (!tierFkMatches(input.tier, input)) {
    res.status(400).json(validationError({ tier: "must match exactly one of projectId/customerId/branchId" }));
    return;
  }

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(priceList)
      .values({
        companyId: req.auth!.companyId,
        tier: input.tier,
        projectId: input.projectId ?? null,
        customerId: input.customerId ?? null,
        branchId: input.branchId ?? null,
        name: input.name,
        isActive: input.isActive ?? true,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "price_list",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

priceListsRouter.put("/price-lists/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdatePriceListBody.safeParse(req.body);
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
      .update(priceList)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(priceList.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "price_list",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Price list"));
    return;
  }
  res.status(200).json(toApi(updated));
});

priceListsRouter.delete("/price-lists/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidPriceListBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(priceList).set({ voidedAt: new Date() }).where(eq(priceList.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "price_list",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Price list"));
    return;
  }
  res.status(204).send();
});

priceListsRouter.post(
  "/price-lists/:priceListId/lines",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = CreatePriceListLineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const priceListId = paramId(req, "priceListId");

    const created = await withTenant(db, req.auth!.companyId, async (tx) => {
      const list = await findActive(tx, priceListId);
      if (!list) return null;

      const [row] = await tx
        .insert(priceListLine)
        .values({
          companyId: req.auth!.companyId,
          priceListId,
          productId: input.productId,
          concreteUnitPriceFils: jodStringToFils(input.concreteUnitPriceJod),
          deliveryUnitPriceFils: jodStringToFils(input.deliveryUnitPriceJod),
          taxRateBasisPoints: input.taxRateBasisPoints ?? 1600,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "price_list_line",
        entityId: row.id,
        action: "create",
        after: row,
      });
      return row;
    });

    if (!created) {
      res.status(404).json(notFound("Price list"));
      return;
    }
    res.status(201).json(lineToApi(created));
  },
);

priceListsRouter.put(
  "/price-lists/:priceListId/lines/:id",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = UpdatePriceListLineBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const priceListId = paramId(req, "priceListId");
    const id = paramId(req);

    const updated = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveLine(tx, priceListId, id);
      if (!before) return null;

      const [row] = await tx
        .update(priceListLine)
        .set({
          ...(input.concreteUnitPriceJod !== undefined && {
            concreteUnitPriceFils: jodStringToFils(input.concreteUnitPriceJod),
          }),
          ...(input.deliveryUnitPriceJod !== undefined && {
            deliveryUnitPriceFils: jodStringToFils(input.deliveryUnitPriceJod),
          }),
          ...(input.taxRateBasisPoints !== undefined && { taxRateBasisPoints: input.taxRateBasisPoints }),
          ...(input.effectiveFrom !== undefined && { effectiveFrom: new Date(input.effectiveFrom) }),
          ...(input.effectiveTo !== undefined && {
            effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          }),
          updatedAt: new Date(),
        })
        .where(eq(priceListLine.id, id))
        .returning();
      if (!row) throw new Error("update returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "price_list_line",
        entityId: row.id,
        action: "update",
        before,
        after: row,
      });
      return row;
    });

    if (!updated) {
      res.status(404).json(notFound("Price list line"));
      return;
    }
    res.status(200).json(lineToApi(updated));
  },
);

priceListsRouter.delete(
  "/price-lists/:priceListId/lines/:id",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = VoidPriceListLineBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const priceListId = paramId(req, "priceListId");
    const id = paramId(req);

    const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
      const before = await findActiveLine(tx, priceListId, id);
      if (!before) return null;

      const [row] = await tx
        .update(priceListLine)
        .set({ voidedAt: new Date() })
        .where(eq(priceListLine.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "price_list_line",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return row;
    });

    if (!voided) {
      res.status(404).json(notFound("Price list line"));
      return;
    }
    res.status(204).send();
  },
);
