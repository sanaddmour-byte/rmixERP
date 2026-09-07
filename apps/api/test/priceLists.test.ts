import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;
let productId: string;
let branchId: string;

beforeAll(async () => {
  admin = await adminToken();

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C25", code: `C25-${Date.now()}` });
  productId = productRes.body.id;

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Test Plant ${Date.now()}`, code: `TP${Date.now() % 100000}` });
  branchId = branchRes.body.id;
});

describe("price lists — tier/FK validation", () => {
  it("rejects a company-tier price list that also sets branchId", async () => {
    const res = await request(app)
      .post("/api/price-lists")
      .set("Authorization", `Bearer ${admin}`)
      .send({ tier: "company", name: "Bad company list", branchId });
    expect(res.status).toBe(400);
  });

  it("rejects a branch-tier price list with no branchId set", async () => {
    const res = await request(app)
      .post("/api/price-lists")
      .set("Authorization", `Bearer ${admin}`)
      .send({ tier: "branch", name: "Bad branch list" });
    expect(res.status).toBe(400);
  });

  it("accepts a company-tier price list with no scope FKs", async () => {
    const res = await request(app)
      .post("/api/price-lists")
      .set("Authorization", `Bearer ${admin}`)
      .send({ tier: "company", name: "Company default 2026" });
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe("company");
  });

  it("accepts a branch-tier price list with branchId set", async () => {
    const res = await request(app)
      .post("/api/price-lists")
      .set("Authorization", `Bearer ${admin}`)
      .send({ tier: "branch", name: "Branch prices", branchId });
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe("branch");
    expect(res.body.branchId).toBe(branchId);
  });
});

describe("price list lines", () => {
  let priceListId: string;
  let lineId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/price-lists")
      .set("Authorization", `Bearer ${admin}`)
      .send({ tier: "company", name: `Lines test list ${Date.now()}` });
    priceListId = res.body.id;
  });

  it("adds a line with a JOD decimal price, stored and returned exactly", async () => {
    const res = await request(app)
      .post(`/api/price-lists/${priceListId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        productId,
        concreteUnitPriceJod: "42.500",
        deliveryUnitPriceJod: "3.250",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    expect(res.body.concreteUnitPriceJod).toBe("42.500");
    expect(res.body.deliveryUnitPriceJod).toBe("3.250");
    expect(res.body.taxRateBasisPoints).toBe(1600);
    lineId = res.body.id;
  });

  it("404s adding a line to an unknown price list", async () => {
    const res = await request(app)
      .post("/api/price-lists/00000000-0000-4000-8000-999999999999/lines")
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, concreteUnitPriceJod: "1.000", deliveryUnitPriceJod: "1.000", effectiveFrom: "2026-01-01T00:00:00.000Z" });
    expect(res.status).toBe(404);
  });

  it("the price list detail view includes its lines", async () => {
    const res = await request(app)
      .get(`/api/price-lists/${priceListId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.lines.some((l: { id: string }) => l.id === lineId)).toBe(true);
  });

  it("updates a line's price", async () => {
    const res = await request(app)
      .put(`/api/price-lists/${priceListId}/lines/${lineId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ concreteUnitPriceJod: "45.000" });
    expect(res.status).toBe(200);
    expect(res.body.concreteUnitPriceJod).toBe("45.000");
    expect(res.body.deliveryUnitPriceJod).toBe("3.250");
  });

  it("voids a line, after which it drops out of the price list detail view", async () => {
    const voidRes = await request(app)
      .delete(`/api/price-lists/${priceListId}/lines/${lineId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(voidRes.status).toBe(204);

    const detailRes = await request(app)
      .get(`/api/price-lists/${priceListId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(detailRes.body.lines.some((l: { id: string }) => l.id === lineId)).toBe(false);
  });
});
