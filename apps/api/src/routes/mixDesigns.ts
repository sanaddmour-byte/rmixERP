import { Router } from "express";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { mixDesign, mixDesignIngredient, withTenant, type Tx } from "@rmixerp/db";
import {
  CreateMixDesignBody,
  CreateMixDesignIngredientBody,
  UpdateMixDesignBody,
  VoidMixDesignBody,
  VoidMixDesignIngredientBody,
  type MixDesign,
  type MixDesignIngredient,
  type MixDesignWithIngredients,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const mixDesignsRouter = Router();
const MODULE = "mixDesigns";

type MixDesignRow = typeof mixDesign.$inferSelect;
type MixDesignIngredientRow = typeof mixDesignIngredient.$inferSelect;

function toApi(row: MixDesignRow): MixDesign {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    productId: row.productId,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function ingredientToApi(row: MixDesignIngredientRow): MixDesignIngredient {
  return {
    id: row.id,
    companyId: row.companyId,
    mixDesignId: row.mixDesignId,
    rawMaterialId: row.rawMaterialId,
    quantityPerM3: row.quantityPerM3,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

export async function findActiveMixDesign(tx: Tx, id: string): Promise<MixDesignRow | undefined> {
  const [row] = await tx
    .select()
    .from(mixDesign)
    .where(and(eq(mixDesign.id, id), isNull(mixDesign.voidedAt)));
  return row;
}

export async function loadMixDesignWithIngredients(tx: Tx, id: string): Promise<MixDesignWithIngredients | null> {
  const row = await findActiveMixDesign(tx, id);
  if (!row) return null;
  const ingredients = await tx
    .select()
    .from(mixDesignIngredient)
    .where(and(eq(mixDesignIngredient.mixDesignId, id), isNull(mixDesignIngredient.voidedAt)));
  return { ...toApi(row), ingredients: ingredients.map(ingredientToApi) };
}

mixDesignsRouter.get("/mix-designs", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(mixDesign.voidedAt),
      q ? ilike(mixDesign.name, `%${q}%`) : undefined,
      branchId ? eq(mixDesign.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(mixDesign).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(mixDesign).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

mixDesignsRouter.post("/mix-designs", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateMixDesignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(mixDesign)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        productId: input.productId,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "mix_design",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json({ ...toApi(created), ingredients: [] });
});

mixDesignsRouter.get("/mix-designs/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadMixDesignWithIngredients(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Mix design"));
    return;
  }
  res.status(200).json(body);
});

mixDesignsRouter.put("/mix-designs/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateMixDesignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const updated = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveMixDesign(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(mixDesign)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(mixDesign.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "mix_design",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Mix design"));
    return;
  }
  res.status(200).json((await withTenant(db, req.auth!.companyId, (tx) => loadMixDesignWithIngredients(tx, id)))!);
});

mixDesignsRouter.delete("/mix-designs/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidMixDesignBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActiveMixDesign(tx, id);
    if (!before) return null;

    const [row] = await tx.update(mixDesign).set({ voidedAt: new Date() }).where(eq(mixDesign.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "mix_design",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Mix design"));
    return;
  }
  res.status(204).send();
});

mixDesignsRouter.post(
  "/mix-designs/:mixDesignId/ingredients",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = CreateMixDesignIngredientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const mixDesignId = paramId(req, "mixDesignId");

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveMixDesign(tx, mixDesignId);
      if (!parent) return null;

      const [row] = await tx
        .insert(mixDesignIngredient)
        .values({
          companyId: req.auth!.companyId,
          mixDesignId,
          rawMaterialId: input.rawMaterialId,
          quantityPerM3: input.quantityPerM3,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "mix_design_ingredient",
        entityId: row.id,
        action: "create",
        after: row,
      });
      return (await loadMixDesignWithIngredients(tx, mixDesignId))!;
    });

    if (!result) {
      res.status(404).json(notFound("Mix design"));
      return;
    }
    res.status(201).json(result);
  },
);

mixDesignsRouter.delete(
  "/mix-designs/:mixDesignId/ingredients/:id",
  requireAuth,
  requirePermission(MODULE, "edit"),
  async (req, res) => {
    const parsed = VoidMixDesignIngredientBody.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? null) : null;
    const mixDesignId = paramId(req, "mixDesignId");
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const parent = await findActiveMixDesign(tx, mixDesignId);
      if (!parent) return { kind: "not_found_design" as const };

      const [before] = await tx
        .select()
        .from(mixDesignIngredient)
        .where(
          and(
            eq(mixDesignIngredient.id, id),
            eq(mixDesignIngredient.mixDesignId, mixDesignId),
            isNull(mixDesignIngredient.voidedAt),
          ),
        );
      if (!before) return { kind: "not_found_ingredient" as const };

      const [row] = await tx
        .update(mixDesignIngredient)
        .set({ voidedAt: new Date() })
        .where(eq(mixDesignIngredient.id, id))
        .returning();
      if (!row) throw new Error("void returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        actorUserId: req.auth!.userId,
        entityType: "mix_design_ingredient",
        entityId: row.id,
        action: "void",
        before,
        after: row,
        reason,
      });
      return { kind: "ok" as const, body: (await loadMixDesignWithIngredients(tx, mixDesignId))! };
    });

    if (result.kind === "not_found_design") {
      res.status(404).json(notFound("Mix design"));
      return;
    }
    if (result.kind === "not_found_ingredient") {
      res.status(404).json(notFound("Mix design ingredient"));
      return;
    }
    res.status(200).json(result.body);
  },
);
