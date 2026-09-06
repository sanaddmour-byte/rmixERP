import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let customerId: string;
let productId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Quotation Test Plant ${Date.now()}`, code: `QT${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const customerRes = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Quotation Test Customer ${Date.now()}` });
  customerId = customerRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C30", code: `C30-${Date.now()}` });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Quotation Test Prices ${Date.now()}` });
  const priceListId = priceListRes.body.id;

  await request(app)
    .post(`/api/price-lists/${priceListId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({
      productId,
      concreteUnitPriceJod: "10.000",
      deliveryUnitPriceJod: "2.000",
      taxRateBasisPoints: 1600,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
});

describe("quotations — lifecycle and price/tax math", () => {
  it("creates a draft quotation with zero totals and no lines", async () => {
    const res = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.lines).toEqual([]);
    expect(res.body.totalJod).toBe("0.000");
  });

  it("adding a line resolves the company-tier price and computes concrete-taxable/delivery-exempt tax", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const quotationId = created.body.id;

    const res = await request(app)
      .post(`/api/quotations/${quotationId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });

    expect(res.status).toBe(201);
    const line = res.body.lines[0];
    expect(line.priceResolutionTier).toBe("company");
    expect(line.concreteUnitPriceJod).toBe("10.000");
    expect(line.deliveryUnitPriceJod).toBe("2.000");
    // concrete net = 10 * 5 = 50, delivery net = 2 * 5 = 10 -> net = 60
    expect(line.netJod).toBe("60.000");
    // tax = 16% of concrete net only (delivery is exempt) = 8.000
    expect(line.taxJod).toBe("8.000");
    expect(line.totalJod).toBe("68.000");
    // header totals mirror the single line
    expect(res.body.subtotalJod).toBe("60.000");
    expect(res.body.taxJod).toBe("8.000");
    expect(res.body.totalJod).toBe("68.000");
  });

  it("rejects a line for a product with no configured price", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const noPriceProduct = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "No Price Product", code: `NP-${Date.now()}` });

    const res = await request(app)
      .post(`/api/quotations/${created.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId: noPriceProduct.body.id, quantityM3: "1" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid quantity", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });

    const res = await request(app)
      .post(`/api/quotations/${created.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "not-a-number" });
    expect(res.status).toBe(400);
  });

  it("voiding a line recomputes the header totals back to zero", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const quotationId = created.body.id;

    const withLine = await request(app)
      .post(`/api/quotations/${quotationId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "2" });
    const lineId = withLine.body.lines[0].id;

    const voided = await request(app)
      .delete(`/api/quotations/${quotationId}/lines/${lineId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({});
    expect(voided.status).toBe(200);
    expect(voided.body.lines).toEqual([]);
    expect(voided.body.totalJod).toBe("0.000");
  });

  it("applies a flat commercial charge to a line and folds it into the line/header totals", async () => {
    const chargeTypeRes = await request(app)
      .post("/api/charge-types")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Pumping ${Date.now()}`, calculationMethod: "flat", defaultAmountJod: "5.000", taxRateBasisPoints: 1600 });
    const chargeTypeId = chargeTypeRes.body.id;

    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const quotationId = created.body.id;

    const withLine = await request(app)
      .post(`/api/quotations/${quotationId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "1" });
    const lineId = withLine.body.lines[0].id;
    // line before charge: concrete net 10, delivery net 2, tax 1.6 -> total 13.600

    const res = await request(app)
      .post(`/api/quotations/${quotationId}/lines/${lineId}/charges`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ chargeTypeId });
    expect(res.status).toBe(201);
    const line = res.body.lines[0];
    expect(line.charges).toHaveLength(1);
    expect(line.charges[0].amountJod).toBe("5.000");
    expect(line.charges[0].taxJod).toBe("0.800");
    // net = 12 (concrete+delivery) + 5 (charge) = 17; tax = 1.6 (concrete) + 0.8 (charge) = 2.4; total = 19.4
    expect(line.netJod).toBe("17.000");
    expect(line.taxJod).toBe("2.400");
    expect(line.totalJod).toBe("19.400");
  });

  it("only allows mutating lines while the quotation is in draft status", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const quotationId = created.body.id;

    const sent = await request(app).post(`/api/quotations/${quotationId}/send`).set("Authorization", `Bearer ${admin}`);
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("sent");

    const lineAttempt = await request(app)
      .post(`/api/quotations/${quotationId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "1" });
    expect(lineAttempt.status).toBe(400);
  });

  it("rejects converting an accepted quotation with no lines", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    await request(app).post(`/api/quotations/${created.body.id}/send`).set("Authorization", `Bearer ${admin}`);
    await request(app).post(`/api/quotations/${created.body.id}/accept`).set("Authorization", `Bearer ${admin}`);

    const res = await request(app)
      .post(`/api/quotations/${created.body.id}/convert`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-order transition", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });

    const res = await request(app)
      .post(`/api/quotations/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("send -> accept -> convert produces a draft sales order carrying the same lines and totals", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const quotationId = created.body.id;

    await request(app)
      .post(`/api/quotations/${quotationId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "3" });

    await request(app).post(`/api/quotations/${quotationId}/send`).set("Authorization", `Bearer ${admin}`);
    const accepted = await request(app)
      .post(`/api/quotations/${quotationId}/accept`)
      .set("Authorization", `Bearer ${admin}`);
    expect(accepted.body.status).toBe("accepted");

    const converted = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set("Authorization", `Bearer ${admin}`);
    expect(converted.status).toBe(201);
    expect(converted.body.status).toBe("draft");
    expect(converted.body.quotationId).toBe(quotationId);
    expect(converted.body.lines).toHaveLength(1);
    expect(converted.body.lines[0].productId).toBe(productId);
    expect(converted.body.totalJod).not.toBe("0.000");

    const quotationAfter = await request(app)
      .get(`/api/quotations/${quotationId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(quotationAfter.body.status).toBe("converted");
  });

  it("rejects a sent quotation with a reason recorded", async () => {
    const created = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    await request(app).post(`/api/quotations/${created.body.id}/send`).set("Authorization", `Bearer ${admin}`);

    const res = await request(app)
      .post(`/api/quotations/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Customer went with a competitor" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });
});

describe("quotations — permission denial", () => {
  it("403s creating a quotation without the quotations:create permission", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app)
      .post("/api/quotations")
      .set("Authorization", `Bearer ${noPerms}`)
      .send({ customerId, branchId });
    expect(res.status).toBe(403);
  });

  it("403s listing quotations without the quotations:view permission", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app).get("/api/quotations").set("Authorization", `Bearer ${noPerms}`);
    expect(res.status).toBe(403);
  });
});
