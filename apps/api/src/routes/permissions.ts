import { Router } from "express";
import { permission } from "@rmixerp/db";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";

export const permissionsRouter = Router();

/**
 * The permission catalog is system-defined (seeded, extended only by
 * future migrations) and not company-scoped, so this reads directly from
 * `db`, not through `withTenant` — there is nothing to scope.
 */
permissionsRouter.get("/permissions", requireAuth, async (_req, res) => {
  const rows = await db.select().from(permission);
  res.status(200).json(rows.map((row) => ({ id: row.id, module: row.module, action: row.action })));
});
