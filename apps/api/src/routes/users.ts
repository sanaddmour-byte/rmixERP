import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { appUser, userRole, withTenant, type Tx } from "@rmixerp/db";
import { CreateUserBody, UpdateUserBody, VoidUserBody, type User } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const usersRouter = Router();
const MODULE = "users";

type UserRow = typeof appUser.$inferSelect;

async function roleIdsFor(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.select({ roleId: userRole.roleId }).from(userRole).where(eq(userRole.userId, userId));
  return rows.map((r) => r.roleId);
}

async function toApi(tx: Tx, row: UserRow): Promise<User> {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    email: row.email,
    displayName: row.displayName,
    isActive: row.isActive,
    roleIds: await roleIdsFor(tx, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<UserRow | undefined> {
  const [row] = await tx
    .select()
    .from(appUser)
    .where(and(eq(appUser.id, id), isNull(appUser.voidedAt)));
  return row;
}

async function setRoles(tx: Tx, companyId: string, userId: string, roleIds: string[]): Promise<void> {
  await tx.delete(userRole).where(eq(userRole.userId, userId));
  if (roleIds.length === 0) return;
  await tx.insert(userRole).values(roleIds.map((roleId) => ({ companyId, userId, roleId })));
}

usersRouter.get("/users", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(appUser.voidedAt), q ? ilike(appUser.displayName, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(appUser).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(appUser).where(where),
    ]);
    const apiRows = await Promise.all(rows.map((r) => toApi(tx, r)));
    return { items: apiRows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items, total, pagination));
});

usersRouter.get("/users/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const row = await findActive(tx, paramId(req));
    return row ? toApi(tx, row) : null;
  });
  if (!body) {
    res.status(404).json(notFound("User"));
    return;
  }
  res.status(200).json(body);
});

usersRouter.post("/users", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const passwordHash = await bcrypt.hash(input.password, 12);

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(appUser)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId ?? null,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    if (input.roleIds) {
      await setRoles(tx, req.auth!.companyId, row.id, input.roleIds);
    }
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "app_user",
      entityId: row.id,
      action: "create",
      after: { ...row, passwordHash: "[redacted]" },
    });
    return toApi(tx, row);
  });

  res.status(201).json(body);
});

usersRouter.put("/users/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateUserBody.safeParse(req.body);
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
      .update(appUser)
      .set({
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(appUser.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    if (input.roleIds !== undefined) {
      await setRoles(tx, req.auth!.companyId, id, input.roleIds);
    }
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "app_user",
      entityId: row.id,
      action: "update",
      before: { ...before, passwordHash: "[redacted]" },
      after: { ...row, passwordHash: "[redacted]" },
    });
    return toApi(tx, row);
  });

  if (!body) {
    res.status(404).json(notFound("User"));
    return;
  }
  res.status(200).json(body);
});

usersRouter.delete("/users/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidUserBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(appUser)
      .set({ isActive: false, voidedAt: new Date() })
      .where(eq(appUser.id, id))
      .returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "app_user",
      entityId: row.id,
      action: "void",
      before: { ...before, passwordHash: "[redacted]" },
      after: { ...row, passwordHash: "[redacted]" },
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("User"));
    return;
  }
  res.status(204).send();
});
