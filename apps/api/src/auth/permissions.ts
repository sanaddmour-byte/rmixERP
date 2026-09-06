import { eq } from "drizzle-orm";
import { permission, rolePermission, userRole } from "@rmixerp/db";
import type { Tx } from "../types";

/** Every `${module}:${action}` permission granted to `userId` via their roles. */
export async function loadPermissions(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ module: permission.module, action: permission.action })
    .from(userRole)
    .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
    .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
    .where(eq(userRole.userId, userId));

  return [...new Set(rows.map((r) => `${r.module}:${r.action}`))];
}
