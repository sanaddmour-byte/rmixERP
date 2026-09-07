import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notification, withTenant } from "@rmixerp/db";
import type { Notification } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound } from "../lib/errors";
import { paramId } from "../lib/params";

export const notificationsRouter = Router();

type NotificationRow = typeof notification.$inferSelect;

function toApi(row: NotificationRow): Notification {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    readBy: row.readBy,
  };
}

/**
 * Broadcast, not per-user targeted (see `packages/db`'s `notification.ts`
 * doc comment) — every authenticated user in the company can list and
 * mark-read, gated only by tenancy, not a `module:action` permission.
 * Phase 10 owns the real per-user inbox.
 */
notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  const pagination = parsePagination(req);
  const unreadOnly = req.query.unreadOnly === "true";

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = unreadOnly ? isNull(notification.readAt) : undefined;
    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(notification)
        .where(where)
        .orderBy(desc(notification.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(notification).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

notificationsRouter.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const id = paramId(req);

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .update(notification)
      .set({ readAt: new Date(), readBy: req.auth!.userId })
      .where(and(eq(notification.id, id), isNull(notification.readAt)))
      .returning();
    if (row) return row;
    const [existing] = await tx.select().from(notification).where(eq(notification.id, id));
    return existing ?? null;
  });

  if (!result) {
    res.status(404).json(notFound("Notification"));
    return;
  }
  res.status(200).json(toApi(result));
});
