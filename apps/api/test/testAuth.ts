import { eq } from "drizzle-orm";
import { appUser, permission, role, userRole, withTenant } from "@rmixerp/db";
import { db } from "../src/db";
import { signAccessToken } from "../src/auth/accessToken";
import { config } from "../src/config";

const seedAdminEmail = process.env.TEST_SEED_ADMIN_EMAIL ?? "admin@test.local";

/** A bearer token for the seeded admin (all permissions). Used across master-data tests. */
export async function adminToken(): Promise<string> {
  return withTenant(db, config.companyId, async (tx) => {
    const [user] = await tx.select().from(appUser).where(eq(appUser.email, seedAdminEmail));
    if (!user) throw new Error("seeded admin not found — did you run db:seed against rmixerp_test?");

    const perms = await tx.select({ module: permission.module, action: permission.action }).from(permission);

    return signAccessToken({
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      permissions: perms.map((p) => `${p.module}:${p.action}`),
    });
  });
}

/** A bearer token for a freshly-created user with zero permissions, to test permission denial. */
export async function noPermissionsToken(): Promise<string> {
  return withTenant(db, config.companyId, async (tx) => {
    const [emptyRole] = await tx
      .insert(role)
      .values({ companyId: config.companyId, name: `no-permissions-${crypto.randomUUID()}` })
      .returning();
    if (!emptyRole) throw new Error("failed to create fixture role");

    const [user] = await tx
      .insert(appUser)
      .values({
        companyId: config.companyId,
        email: `no-perms-${crypto.randomUUID()}@test.local`,
        passwordHash: "unused",
        displayName: "No Permissions",
      })
      .returning();
    if (!user) throw new Error("failed to create fixture user");

    // No rolePermission rows are inserted for `emptyRole` — it grants nothing.
    await tx.insert(userRole).values({ companyId: config.companyId, userId: user.id, roleId: emptyRole.id });

    return signAccessToken({
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      permissions: [],
    });
  });
}
