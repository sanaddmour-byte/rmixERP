import { Router } from "express";
import { devicePushToken, withTenant } from "@rmixerp/db";
import { RegisterDevicePushTokenBody, type DevicePushToken } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { validationError } from "../lib/errors";

export const devicePushTokensRouter = Router();

type DevicePushTokenRow = typeof devicePushToken.$inferSelect;

function toApi(row: DevicePushTokenRow): DevicePushToken {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    token: row.token,
    platform: row.platform,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Registers (or, on a repeat login, refreshes) the calling user's Expo
 * push token -- see `packages/db/schema/devicePushToken.ts` for why there
 * is no unregister route. Upserts on the unique `token` column: a device
 * always owns at most one row, re-pointed to whichever user is currently
 * signed in on it rather than accumulating stale rows across logins.
 */
devicePushTokensRouter.post("/device-push-tokens", requireAuth, async (req, res) => {
  const parsed = RegisterDevicePushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(devicePushToken)
      .values({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        token: parsed.data.token,
        platform: parsed.data.platform,
      })
      .onConflictDoUpdate({
        target: devicePushToken.token,
        set: { userId: req.auth!.userId, companyId: req.auth!.companyId, platform: parsed.data.platform, updatedAt: new Date() },
      })
      .returning();
    return row;
  });

  if (!result) throw new Error("upsert returned no row");
  res.status(201).json(toApi(result));
});
