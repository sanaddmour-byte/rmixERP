import { and, eq } from "drizzle-orm";
import { devicePushToken, permission, rolePermission, userRole, type Tx } from "@rmixerp/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Real integration against Expo's documented push API (POST a JSON array
 * of messages, Expo replies with one delivery ticket per message) --
 * built to match Expo's published request/response shape the same way
 * Phase 7's JoFotara `ClearanceProvider` shell was, but never exercised
 * against a live device or a real Expo project. Fire-and-forget by
 * design: callers never `await` this (see `pushForNotification` below),
 * so every failure is caught and logged here rather than thrown --
 * a push send can never affect the notification row or the caller's
 * transaction that triggered it.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error(`Expo push send failed: HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as { data?: Array<{ status: string; message?: string }> };
    for (const [i, ticket] of (body.data ?? []).entries()) {
      if (ticket.status === "error") {
        console.error(`Expo push ticket error for ${messages[i]?.to}: ${ticket.message ?? "unknown error"}`);
      }
    }
  } catch (err) {
    console.error("Expo push send threw:", err);
  }
}

/**
 * Device tokens for every user in `companyId` who holds `requiredPermission`
 * ("module:action"), or every registered token in the company when no
 * permission is required -- mirrors `routes/notifications.ts`'s
 * `visibleTypesFor` visibility rule so a push never reaches a device whose
 * user couldn't see the notification in their own in-app inbox anyway.
 */
async function collectPushTokens(tx: Tx, companyId: string, requiredPermission: string | null): Promise<string[]> {
  if (!requiredPermission) {
    const rows = await tx.select({ token: devicePushToken.token }).from(devicePushToken).where(eq(devicePushToken.companyId, companyId));
    return rows.map((r) => r.token);
  }
  const [module, action] = requiredPermission.split(":");
  const rows = await tx
    .selectDistinct({ token: devicePushToken.token })
    .from(devicePushToken)
    .innerJoin(userRole, and(eq(userRole.userId, devicePushToken.userId), eq(userRole.companyId, companyId)))
    .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
    .innerJoin(permission, and(eq(permission.id, rolePermission.permissionId), eq(permission.module, module ?? ""), eq(permission.action, action ?? "")))
    .where(eq(devicePushToken.companyId, companyId));
  return rows.map((r) => r.token);
}

/**
 * Sends a push for one notification: to a single user's devices if
 * `userId` is set (individually-targeted notification), otherwise to
 * every device belonging to a user who holds `requiredPermission` in
 * `companyId` (role-based broadcast, matching how the in-app inbox scopes
 * the same notification). The token lookup runs inside the caller's
 * transaction (a cheap local read); the actual outbound call to Expo is
 * deliberately never awaited by this function's caller-visible contract --
 * see `sendExpoPushNotifications`.
 */
export async function pushForNotification(
  tx: Tx,
  params: {
    companyId: string;
    userId?: string | null;
    requiredPermission: string | null;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const tokens = params.userId
    ? (
        await tx
          .select({ token: devicePushToken.token })
          .from(devicePushToken)
          .where(and(eq(devicePushToken.companyId, params.companyId), eq(devicePushToken.userId, params.userId)))
      ).map((r) => r.token)
    : await collectPushTokens(tx, params.companyId, params.requiredPermission);
  if (tokens.length === 0) return;
  void sendExpoPushNotifications(tokens.map((token) => ({ to: token, title: params.title, body: params.body, ...(params.data && { data: params.data }) })));
}
