import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDb } from "../src/client";
import { appUser, branch, company, permission, role, rolePermission, userRole } from "../src/schema/index";

/**
 * Explicit, one-time bootstrap for a fresh environment. Never imported by
 * application code — run only via `pnpm db:seed`. Connects with the
 * migration/owner credentials (bypasses RLS) since it is creating the very
 * first company row that RLS would otherwise scope everything against.
 */

const ROLE_NAMES = [
  "Admin",
  "Company Manager",
  "Plant Manager",
  "Dispatcher",
  "Sales Rep",
  "Collector",
  "Procurement",
  "QC Technician",
  "Accountant",
  "Driver",
  "Operator",
] as const;

const PERMISSION_MODULES = [
  "company",
  "users",
  "roles",
  "branches",
  "customers",
  "projects",
  "products",
  "priceLists",
  "chargeTypes",
  "rawMaterials",
  "vendors",
  "quotations",
  "salesOrders",
  "mixDesigns",
  "inventory",
  "productionOrders",
  "qc",
] as const;
const PERMISSION_ACTIONS = ["view", "create", "edit", "approve", "void"] as const;

async function main() {
  const connectionString = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!connectionString) {
    throw new Error("MIGRATE_DATABASE_URL (or DATABASE_URL) is required to seed");
  }
  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to seed");
  }

  const db = createDb(connectionString);

  const companyId = process.env.SEED_COMPANY_ID;
  const [seededCompany] = await db
    .insert(company)
    .values({ ...(companyId ? { id: companyId } : {}), name: "RMC ERP", taxNumber: null })
    .onConflictDoNothing()
    .returning();
  const companyRow =
    seededCompany ?? (await db.query.company.findFirst());
  if (!companyRow) {
    throw new Error("Failed to create or find the company row");
  }

  for (let i = 1; i <= 11; i++) {
    await db
      .insert(branch)
      .values({
        companyId: companyRow.id,
        name: `Plant ${i}`,
        code: `P${String(i).padStart(2, "0")}`,
      })
      .onConflictDoNothing();
  }

  const permissionIds: string[] = [];
  for (const module of PERMISSION_MODULES) {
    for (const action of PERMISSION_ACTIONS) {
      const [row] = await db
        .insert(permission)
        .values({ module, action })
        .onConflictDoNothing()
        .returning();
      if (row) permissionIds.push(row.id);
    }
  }
  const allPermissions = await db.query.permission.findMany();

  const roleIdByName = new Map<string, string>();
  for (const name of ROLE_NAMES) {
    const [row] = await db
      .insert(role)
      .values({ companyId: companyRow.id, name })
      .onConflictDoNothing()
      .returning();
    const roleRow =
      row ?? (await db.query.role.findFirst({ where: eq(role.name, name) }));
    if (roleRow) roleIdByName.set(name, roleRow.id);
  }

  const adminRoleId = roleIdByName.get("Admin");
  if (adminRoleId) {
    for (const perm of allPermissions) {
      await db
        .insert(rolePermission)
        .values({ companyId: companyRow.id, roleId: adminRoleId, permissionId: perm.id })
        .onConflictDoNothing();
    }
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const [seededAdmin] = await db
    .insert(appUser)
    .values({
      companyId: companyRow.id,
      email: adminEmail,
      passwordHash,
      displayName: "Admin",
    })
    .onConflictDoNothing()
    .returning();
  const adminUser =
    seededAdmin ?? (await db.query.appUser.findFirst({ where: eq(appUser.email, adminEmail) }));

  if (adminUser && adminRoleId) {
    await db
      .insert(userRole)
      .values({ companyId: companyRow.id, userId: adminUser.id, roleId: adminRoleId })
      .onConflictDoNothing();
  }

  console.log(`Seed complete. Company: ${companyRow.id}. Admin: ${adminEmail}.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
