import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { appUser, branch, company, permission, role, rolePermission, userRole, withTenant } from "@rmixerp/db";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { signAccessToken } from "../src/auth/accessToken";
import { adminToken } from "./testAuth";

/**
 * Adversarial cross-tenant isolation suite, run at the HTTP API level
 * (not packages/db's lower-level withTenant/RLS primitive test — this one
 * proves the whole stack: route handler + withTenant + RLS + FK
 * constraints behave correctly when a second company's authenticated
 * user tries to read, write, reference, or aggregate the first company's
 * data).
 *
 * NOTE on how Company B logs in here: `POST /auth/login` is hardcoded to
 * `config.companyId` (see apps/api/src/config.ts's "single-tenant at
 * go-live" comment and production-readiness-audit.md's top finding) — a
 * second company's user cannot reach it through the real endpoint at all
 * today. This suite constructs Company B's access token directly via
 * `signAccessToken`, the same claims the login route would produce if
 * multi-company login existed, so it tests AUTHORIZATION (does the rest
 * of the stack correctly isolate two companies once each has a valid
 * token) independently of that separate, already-documented gap.
 */

const app = createApp();
let companyAAdmin: string;
let companyBAdmin: string;
let companyBId: string;

let companyACustomerId: string;
let companyABranchId: string;

beforeAll(async () => {
  companyAAdmin = await adminToken();

  // Company A fixtures, created through the real API as its own admin.
  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${companyAAdmin}`)
    .send({ name: `Tenant Isolation Plant A ${Date.now()}`, code: `TIA${Date.now() % 100000}` });
  companyABranchId = branchRes.body.id;

  const customerRes = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${companyAAdmin}`)
    .send({ name: `Tenant Isolation Secret Customer A ${Date.now()}` });
  companyACustomerId = customerRes.body.id;

  // Company B: a second, independent tenant, provisioned directly at the
  // data layer (there is no multi-company provisioning API yet — see the
  // note above) with its own branch, an all-permissions role, and an
  // admin user, mirroring what packages/db/seed/run.ts does for Company A.
  const [newCompany] = await db
    .insert(company)
    .values({ name: `Tenant Isolation Co B ${crypto.randomUUID()}` })
    .returning({ id: company.id });
  if (!newCompany) throw new Error("failed to create Company B fixture");
  companyBId = newCompany.id;

  await withTenant(db, companyBId, async (tx) => {
    const [branchB] = await tx
      .insert(branch)
      .values({ companyId: companyBId, name: "B Plant", code: `TIB${Date.now() % 100000}` })
      .returning();
    if (!branchB) throw new Error("failed to create Company B branch");

    const allPerms = await tx.select({ id: permission.id, module: permission.module, action: permission.action }).from(permission);
    const [roleB] = await tx.insert(role).values({ companyId: companyBId, name: "Admin" }).returning();
    if (!roleB) throw new Error("failed to create Company B role");
    if (allPerms.length > 0) {
      await tx.insert(rolePermission).values(allPerms.map((p) => ({ companyId: companyBId, roleId: roleB.id, permissionId: p.id })));
    }

    const [userB] = await tx
      .insert(appUser)
      .values({
        companyId: companyBId,
        branchId: branchB.id,
        email: `tenant-b-admin-${crypto.randomUUID()}@test.local`,
        passwordHash: "unused",
        displayName: "Company B Admin",
      })
      .returning();
    if (!userB) throw new Error("failed to create Company B user");
    await tx.insert(userRole).values({ companyId: companyBId, userId: userB.id, roleId: roleB.id });

    companyBAdmin = await signAccessToken({
      sub: userB.id,
      companyId: companyBId,
      branchId: branchB.id,
      permissions: allPerms.map((p) => `${p.module}:${p.action}`),
    });
  });
});

describe("tenant isolation: Company B's token must never reach Company A's data", () => {
  it("list: Company B's customer list never includes Company A's customer", async () => {
    const res = await request(app).get("/api/customers").set("Authorization", `Bearer ${companyBAdmin}`);
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(companyACustomerId);
  });

  it("get-by-id: Company B cannot fetch Company A's customer by its real id", async () => {
    const res = await request(app).get(`/api/customers/${companyACustomerId}`).set("Authorization", `Bearer ${companyBAdmin}`);
    expect(res.status).toBe(404);
  });

  it("search: filtering by Company A's exact customer name from Company B returns nothing", async () => {
    const custRes = await request(app).get(`/api/customers/${companyACustomerId}`).set("Authorization", `Bearer ${companyAAdmin}`);
    const name = custRes.body.name as string;
    const res = await request(app).get("/api/customers").query({ q: name }).set("Authorization", `Bearer ${companyBAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("branch reference: Company B cannot create a customer against Company A's branch id", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${companyBAdmin}`)
      .send({ name: "Cross-tenant attempt", branchId: companyABranchId });
    // customers.ts's branchBelongsToTenant re-check (added alongside this
    // test) re-validates the branch id inside Company B's own
    // tenant-scoped transaction — RLS filters out Company A's branch row,
    // so the lookup comes back empty and this 400s instead of silently
    // storing a live cross-tenant reference.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("cross-tenant FK reference: Company B creating a sales order against Company A's real customer id is rejected, not silently accepted", async () => {
    const companyBBranch = await withTenant(db, companyBId, (tx) => tx.select().from(branch));
    const res = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${companyBAdmin}`)
      .send({ branchId: companyBBranch[0]?.id, customerId: companyACustomerId });
    // Before the fix added alongside this test, this 201'd: the handler
    // inserted customerId without re-validating tenant ownership, relying
    // on the FK constraint alone — and Postgres FK validation does not go
    // through RLS. A 201 here would mean Company B now holds a live
    // reference to Company A's customer, a real cross-tenant leak (see
    // docs/architecture/production-readiness-audit.md).
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("reports: Company B's GL trial balance never reflects Company A's postings", async () => {
    // Give Company A a real GL posting to try to leak: approve a vendor
    // bill (Dr Inventory/Input Tax, Cr Accounts Payable).
    const vendorRes = await request(app)
      .post("/api/vendors")
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({ name: `Tenant Isolation Vendor A ${Date.now()}` });
    const rawMaterialRes = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({ name: `Tenant Isolation Material A ${Date.now()}`, code: `TIM-${Date.now()}`, unit: "ton" });
    const poRes = await request(app)
      .post("/api/purchase-orders")
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({ branchId: companyABranchId, vendorId: vendorRes.body.id });
    const poLineRes = await request(app)
      .post(`/api/purchase-orders/${poRes.body.id}/lines`)
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({ rawMaterialId: rawMaterialRes.body.id, quantity: "999999", unitPriceJod: "500.000" });
    const poLineId = poLineRes.body.lines[0].id;
    await request(app).post(`/api/purchase-orders/${poRes.body.id}/submit`).set("Authorization", `Bearer ${companyAAdmin}`).send();
    await request(app).post(`/api/purchase-orders/${poRes.body.id}/approve`).set("Authorization", `Bearer ${companyAAdmin}`).send();
    await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({ purchaseOrderId: poRes.body.id, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "999999" }] });
    const billRes = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${companyAAdmin}`)
      .send({
        purchaseOrderId: poRes.body.id,
        dueDate: "2026-02-10T00:00:00.000Z",
        lines: [{ purchaseOrderLineId: poLineId, description: "Huge distinctive A-only posting", quantity: "999999" }],
      });
    await request(app).post(`/api/vendor-bills/${billRes.body.id}/approve`).set("Authorization", `Bearer ${companyAAdmin}`).send();

    const bTrialBalance = await request(app).get("/api/gl/reports/trial-balance").set("Authorization", `Bearer ${companyBAdmin}`);
    expect(bTrialBalance.status).toBe(200);
    // Company B has posted nothing — total debits/credits must be zero,
    // and no row (even if Company B happens to share account codes)
    // carries a nonzero balance leaked from Company A's posting.
    expect(bTrialBalance.body.totalDebitJod).toBe("0.000");
    expect(bTrialBalance.body.totalCreditJod).toBe("0.000");
    const nonZeroRows = (bTrialBalance.body.rows as Array<{ balanceJod: string }>).filter((r) => r.balanceJod !== "0.000");
    expect(nonZeroRows).toEqual([]);
  });

  it("CSV export: Company B's customer export never contains Company A's customer name", async () => {
    const custRes = await request(app).get(`/api/customers/${companyACustomerId}`).set("Authorization", `Bearer ${companyAAdmin}`);
    const name = custRes.body.name as string;
    const res = await request(app).get("/api/customers").query({ format: "csv" }).set("Authorization", `Bearer ${companyBAdmin}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(name);
  });

  it("void: Company B cannot void Company A's customer", async () => {
    const res = await request(app).delete(`/api/customers/${companyACustomerId}`).set("Authorization", `Bearer ${companyBAdmin}`);
    expect(res.status).toBe(404);

    // Prove it's still alive from Company A's own side.
    const check = await request(app).get(`/api/customers/${companyACustomerId}`).set("Authorization", `Bearer ${companyAAdmin}`);
    expect(check.status).toBe(200);
    expect(check.body.voidedAt).toBeNull();
  });

  it("a request with no tenant context at all, on a pooled connection previously used by withTenant, fails loudly rather than leaking rows", async () => {
    // packages/db/test/tenancy.test.ts already proves the brand-new-
    // connection case returns zero rows (current_setting(..., true) is
    // NULL, NULL::uuid casts fine, RLS default-denies). This is the other
    // realistic case under a connection pool: a physical connection that
    // has already run a withTenant transaction. Postgres resets a custom
    // GUC set via SET LOCAL back to '' (empty string), not NULL, once
    // that transaction ends if the GUC was never set at session level —
    // so current_setting(..., true)::uuid raises invalid_text_representation
    // instead of evaluating to NULL. Either way nothing leaks: this
    // asserts the actual failure mode (a thrown error) rather than the
    // "zero rows" the tenancy.ts docstring describes, which only holds on
    // a connection's first use — see production-readiness-audit.md.
    let thrown: unknown;
    try {
      await db.select().from(appUser).where(eq(appUser.companyId, companyBId));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const cause = (thrown as Error & { cause?: { message?: string } }).cause;
    expect(cause?.message ?? (thrown as Error).message).toMatch(/invalid input syntax for type uuid/);
  });
});
