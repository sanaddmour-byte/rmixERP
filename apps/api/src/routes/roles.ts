import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { role, rolePermission, withTenant, type Tx } from "@rmixerp/db";
import { CreateRoleBody, UpdateRoleBody, VoidRoleBody, type Role } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const rolesRouter = Router();
const MODULE = "roles";

type RoleRow = typeof role.$inferSelect;

async function permissionIdsFor(tx: Tx, roleId: string): Promise<string[]> {
  const rows = await tx
    .select({ permissionId: rolePermission.permissionId })
    .from(rolePermission)
    .where(eq(rolePermission.roleId, roleId));
  return rows.map((r) => r.permissionId);
}

async function toApi(tx: Tx, row: RoleRow): Promise<Role> {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    permissionIds: await permissionIdsFor(tx, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<RoleRow | undefined> {
  const [row] = await tx
    .select()
    .from(role)
    .where(and(eq(role.id, id), isNull(role.voidedAt)));
  return row;
}

async function setPermissions(tx: Tx, companyId: string, roleId: string, permissionIds: string[]): Promise<void> {
  await tx.delete(rolePermission).where(eq(rolePermission.roleId, roleId));
  if (permissionIds.length === 0) return;
  await tx.insert(rolePermission).values(
    permissionIds.map((permissionId) => ({ companyId, roleId, permissionId })),
  );
}

rolesRouter.get("/roles", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(role.voidedAt), q ? ilike(role.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(role).where(where).orderBy(desc(role.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(role).where(where),
    ]);
    const apiRows = await Promise.all(rows.map((r) => toApi(tx, r)));
    return { items: apiRows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items, total, pagination));
});

rolesRouter.get("/roles/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const row = await findActive(tx, paramId(req));
    return row ? toApi(tx, row) : null;
  });
  if (!body) {
    res.status(404).json(notFound("Role"));
    return;
  }
  res.status(200).json(body);
});

rolesRouter.post("/roles", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(role)
      .values({ companyId: req.auth!.companyId, name: input.name, createdBy: req.auth!.userId })
      .returning();
    if (!row) throw new Error("insert returned no row");
    if (input.permissionIds) {
      await setPermissions(tx, req.auth!.companyId, row.id, input.permissionIds);
    }
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "role",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return toApi(tx, row);
  });

  res.status(201).json(body);
});

rolesRouter.put("/roles/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(role)
      .set({ ...(input.name !== undefined && { name: input.name }), updatedAt: new Date() })
      .where(eq(role.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    if (input.permissionIds !== undefined) {
      await setPermissions(tx, req.auth!.companyId, id, input.permissionIds);
    }
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "role",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return toApi(tx, row);
  });

  if (!body) {
    res.status(404).json(notFound("Role"));
    return;
  }
  res.status(200).json(body);
});

rolesRouter.delete("/roles/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidRoleBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(role).set({ voidedAt: new Date() }).where(eq(role.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "role",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Role"));
    return;
  }
  res.status(204).send();
});
