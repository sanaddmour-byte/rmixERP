import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { refreshToken as refreshTokenTable } from "@rmixerp/db";
import { config } from "../config";
import type { Tx } from "../types";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Issues a new opaque refresh token and stores only its hash. */
export async function issueRefreshToken(
  tx: Tx,
  companyId: string,
  userId: string,
): Promise<IssuedRefreshToken> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
  await tx.insert(refreshTokenTable).values({
    companyId,
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export type RefreshTokenLookup =
  | { valid: true; row: typeof refreshTokenTable.$inferSelect }
  | { valid: false; reason: "not_found" | "revoked" | "expired" };

export async function lookupRefreshToken(tx: Tx, token: string): Promise<RefreshTokenLookup> {
  const [row] = await tx
    .select()
    .from(refreshTokenTable)
    .where(eq(refreshTokenTable.tokenHash, hashToken(token)));
  if (!row) return { valid: false, reason: "not_found" };
  if (row.revokedAt) return { valid: false, reason: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { valid: false, reason: "expired" };
  return { valid: true, row };
}

/** Rotation: the presented token is revoked whether or not a new one is issued. */
export async function revokeRefreshToken(tx: Tx, id: string): Promise<void> {
  await tx.update(refreshTokenTable).set({ revokedAt: new Date() }).where(eq(refreshTokenTable.id, id));
}
