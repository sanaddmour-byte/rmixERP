import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

/**
 * Lighter coverage for the remaining master-data resources: proves each
 * one is wired correctly end to end (create -> appears in list -> get ->
 * update -> void -> 404s) and that RBAC/tenancy apply, without repeating
 * every field-level and edge case already covered in depth for
 * customers.test.ts and priceLists.test.ts.
 */

const app = createApp();
let admin: string;
let noPerms: string;
let customerIdForProject: string;

beforeAll(async () => {
  admin = await adminToken();
  noPerms = await noPermissionsToken();

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Project fixture customer ${Date.now()}` });
  customerIdForProject = res.body.id;
});

interface ResourceCase {
  name: string;
  basePath: string;
  permissionModule: string;
  createBody: () => Record<string, unknown>;
  updateBody: Record<string, unknown>;
  assertUpdated: (body: Record<string, unknown>) => void;
}

const cases: ResourceCase[] = [
  {
    name: "projects",
    basePath: "/api/projects",
    permissionModule: "projects",
    createBody: () => ({ customerId: customerIdForProject, name: `Site ${Date.now()}` }),
    updateBody: { address: "New address" },
    assertUpdated: (b) => expect(b.address).toBe("New address"),
  },
  {
    name: "products",
    basePath: "/api/products",
    permissionModule: "products",
    createBody: () => ({ name: `Grade ${Date.now()}`, code: `G${Date.now() % 100000}` }),
    updateBody: { characteristicStrengthMpa: 30 },
    assertUpdated: (b) => expect(b.characteristicStrengthMpa).toBe(30),
  },
  {
    name: "charge-types",
    basePath: "/api/charge-types",
    permissionModule: "chargeTypes",
    createBody: () => ({ name: `Pumping ${Date.now()}` }),
    updateBody: { defaultAmountJod: "15.000" },
    assertUpdated: (b) => expect(b.defaultAmountJod).toBe("15.000"),
  },
  {
    name: "raw-materials",
    basePath: "/api/raw-materials",
    permissionModule: "rawMaterials",
    createBody: () => ({ name: `Cement ${Date.now()}`, code: `RM${Date.now() % 100000}`, unit: "kg" }),
    updateBody: { category: "Binder" },
    assertUpdated: (b) => expect(b.category).toBe("Binder"),
  },
  {
    name: "vendors",
    basePath: "/api/vendors",
    permissionModule: "vendors",
    createBody: () => ({ name: `Supplier ${Date.now()}` }),
    updateBody: { paymentTermsDays: 45 },
    assertUpdated: (b) => expect(b.paymentTermsDays).toBe(45),
  },
  {
    name: "branches",
    basePath: "/api/branches",
    permissionModule: "branches",
    createBody: () => ({ name: `Plant ${Date.now()}`, code: `PL${Date.now() % 100000}` }),
    updateBody: { name: "Renamed Plant" },
    assertUpdated: (b) => expect(b.name).toBe("Renamed Plant"),
  },
];

describe.each(cases)("$name master-data resource", (c) => {
  let id: string;

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get(c.basePath);
    expect(res.status).toBe(401);
  });

  it("rejects a user with no permissions on create", async () => {
    const res = await request(app).post(c.basePath).set("Authorization", `Bearer ${noPerms}`).send(c.createBody());
    expect(res.status).toBe(403);
  });

  it("creates, lists, gets, updates, and voids", async () => {
    const createRes = await request(app)
      .post(c.basePath)
      .set("Authorization", `Bearer ${admin}`)
      .send(c.createBody());
    expect(createRes.status).toBe(201);
    id = createRes.body.id;

    const listRes = await request(app).get(c.basePath).set("Authorization", `Bearer ${admin}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((item: { id: string }) => item.id === id)).toBe(true);

    const getRes = await request(app).get(`${c.basePath}/${id}`).set("Authorization", `Bearer ${admin}`);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .put(`${c.basePath}/${id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send(c.updateBody);
    expect(updateRes.status).toBe(200);
    c.assertUpdated(updateRes.body);

    const voidRes = await request(app).delete(`${c.basePath}/${id}`).set("Authorization", `Bearer ${admin}`);
    expect(voidRes.status).toBe(204);

    const getAfterVoidRes = await request(app).get(`${c.basePath}/${id}`).set("Authorization", `Bearer ${admin}`);
    expect(getAfterVoidRes.status).toBe(404);
  });
});

describe("roles and permission assignment", () => {
  it("creates a role with permissions, then updates its permission set", async () => {
    const permsRes = await request(app).get("/api/permissions").set("Authorization", `Bearer ${admin}`);
    const firstTwo = permsRes.body.slice(0, 2).map((p: { id: string }) => p.id);

    const createRes = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Test Role ${Date.now()}`, permissionIds: firstTwo });
    expect(createRes.status).toBe(201);
    expect(createRes.body.permissionIds.sort()).toEqual([...firstTwo].sort());

    const updateRes = await request(app)
      .put(`/api/roles/${createRes.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ permissionIds: [] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.permissionIds).toEqual([]);
  });
});

describe("users and role assignment", () => {
  it("creates a user with a role, then updates their role assignment", async () => {
    const roleRes = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `User-test role ${Date.now()}` });
    const roleId = roleRes.body.id;

    const createRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        email: `newuser-${Date.now()}@test.local`,
        displayName: "New User",
        password: "SecurePass123!",
        roleIds: [roleId],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.roleIds).toEqual([roleId]);
    expect(createRes.body).not.toHaveProperty("passwordHash");

    const updateRes = await request(app)
      .put(`/api/users/${createRes.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ isActive: false, roleIds: [] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.isActive).toBe(false);
    expect(updateRes.body.roleIds).toEqual([]);
  });
});

describe("company settings", () => {
  it("gets and updates the single company row", async () => {
    const getRes = await request(app).get("/api/company").set("Authorization", `Bearer ${admin}`);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .put("/api/company")
      .set("Authorization", `Bearer ${admin}`)
      .send({ taxNumber: "JO-123456" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.taxNumber).toBe("JO-123456");
  });
});
