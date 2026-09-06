import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let noPerms: string;

beforeAll(async () => {
  admin = await adminToken();
  noPerms = await noPermissionsToken();
});

describe("customers CRUD", () => {
  let customerId: string;

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.status).toBe(401);
  });

  it("rejects a user with no permissions", async () => {
    const res = await request(app).get("/api/customers").set("Authorization", `Bearer ${noPerms}`);
    expect(res.status).toBe(403);
  });

  it("rejects an invalid create body", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${admin}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("creates a customer with defaults applied", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Acme Construction" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Acme Construction");
    expect(res.body.customerType).toBe("company");
    expect(res.body.creditLimitJod).toBe("0.000");
    expect(res.body.creditPolicy).toBe("none");
    expect(res.body.voidedAt).toBeNull();
    customerId = res.body.id;
  });

  it("a create with no permission is rejected", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${noPerms}`)
      .send({ name: "Should not be created" });
    expect(res.status).toBe(403);
  });

  it("appears in the list", async () => {
    const res = await request(app).get("/api/customers").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((c: { id: string }) => c.id === customerId)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("filters the list by name via ?q=", async () => {
    const res = await request(app)
      .get("/api/customers")
      .query({ q: "Acme" })
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((c: { name: string }) => c.name.includes("Acme"))).toBe(true);
  });

  it("exports the list as CSV", async () => {
    const res = await request(app)
      .get("/api/customers")
      .query({ format: "csv" })
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Acme Construction");
  });

  it("gets it by id", async () => {
    const res = await request(app)
      .get(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(customerId);
  });

  it("404s for an unknown id", async () => {
    const res = await request(app)
      .get("/api/customers/00000000-0000-4000-8000-999999999999")
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(404);
  });

  it("updates a subset of fields, leaving the rest untouched", async () => {
    const res = await request(app)
      .put(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ creditLimitJod: "5000.500", creditPolicy: "warning" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Acme Construction");
    expect(res.body.creditLimitJod).toBe("5000.500");
    expect(res.body.creditPolicy).toBe("warning");
  });

  it("voids it, after which it 404s and disappears from the list", async () => {
    const voidRes = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "duplicate entry" });
    expect(voidRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(getRes.status).toBe(404);

    const listRes = await request(app).get("/api/customers").set("Authorization", `Bearer ${admin}`);
    expect(listRes.body.items.some((c: { id: string }) => c.id === customerId)).toBe(false);
  });

  it("voiding again 404s (already void)", async () => {
    const res = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(404);
  });
});
