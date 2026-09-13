import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Sales Order Test Plant ${Date.now()}`, code: `SO${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C35", code: `C35-${Date.now()}` });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Sales Order Test Prices ${Date.now()}` });
  const priceListId = priceListRes.body.id;

  await request(app)
    .post(`/api/price-lists/${priceListId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({
      productId,
      concreteUnitPriceJod: "20.000",
      deliveryUnitPriceJod: "0.000",
      taxRateBasisPoints: 1600,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
});

async function createCustomer(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Sales Order Test Customer ${Date.now()}-${Math.random()}`, ...overrides });
  return res.body.id as string;
}

async function createOrderWithLine(customerId: string, quantityM3: string) {
  const created = await request(app)
    .post("/api/sales-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ customerId, branchId });
  await request(app)
    .post(`/api/sales-orders/${created.body.id}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  return created.body.id as string;
}

/**
 * Creates a real *issued* invoice for a customer — since Phase 8's
 * credit-exposure computation (`apps/api/src/lib/creditExposure.ts`) sums
 * real outstanding invoice balances instead of Phase 2's original
 * confirmed/fulfilled-sales-order proxy, tests exercising the "over the
 * limit" path need an actual invoice, not just a confirmed order.
 */
async function createIssuedInvoiceForCustomer(customerId: string, quantityM3: string): Promise<void> {
  const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
  const lineRes = await request(app)
    .post(`/api/sales-orders/${orderRes.body.id}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  const salesOrderLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);

  const deliveryRes = await request(app)
    .post("/api/delivery-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, salesOrderId: orderRes.body.id, salesOrderLineId, quantityM3, scheduledAt: "2026-01-15T08:00:00.000Z" });
  const truck = await request(app)
    .post("/api/trucks")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, plateNumber: `SOBKLG-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  const driver = await request(app)
    .post("/api/drivers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, name: `Sales Order Backlog Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ truckId: truck.body.id, driverId: driver.body.id });
  await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/deliver`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ receivedQuantityM3: quantityM3, signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });

  const invoiceRes = await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/invoice`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ mode: "combined" });
  const invoiceId = invoiceRes.body.invoices[0].id as string;
  await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
  await request(app).post(`/api/invoices/${invoiceId}/issue`).set("Authorization", `Bearer ${admin}`).send();
}

describe("sales orders — confirm and credit check", () => {
  it("rejects confirming an order with no lines", async () => {
    const customerId = await createCustomer();
    const created = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });

    const res = await request(app)
      .post(`/api/sales-orders/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("confirms freely under credit policy 'none', even far over any notion of a limit", async () => {
    const customerId = await createCustomer({ creditPolicy: "none", creditLimitJod: "1.000" });
    const orderId = await createOrderWithLine(customerId, "100"); // 100 m3 * 20 JOD = 2000 JOD, way over the 1 JOD "limit"

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.creditCheckPolicy).toBe("none");
  });

  it("confirms with a warning under credit policy 'warning', reporting how far it exceeds", async () => {
    const customerId = await createCustomer({ creditPolicy: "warning", creditLimitJod: "100.000" });
    const orderId = await createOrderWithLine(customerId, "10"); // 10 * 20 = 200 JOD net, well over 100

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.creditCheckPolicy).toBe("warning");
    expect(Number(res.body.creditCheckExceedsByJod)).toBeGreaterThan(0);
  });

  it("blocks confirming under credit policy 'block' when the limit is exceeded, with no override", async () => {
    const customerId = await createCustomer({ creditPolicy: "block", creditLimitJod: "50.000" });
    const orderId = await createOrderWithLine(customerId, "10"); // 200 JOD net, over the 50 JOD limit

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("credit_blocked");

    const after = await request(app).get(`/api/sales-orders/${orderId}`).set("Authorization", `Bearer ${admin}`);
    expect(after.body.status).toBe("draft");
  });

  it("confirms a blocked order when a mandatory-reason override is supplied, and audits it", async () => {
    const customerId = await createCustomer({ creditPolicy: "block", creditLimitJod: "50.000" });
    const orderId = await createOrderWithLine(customerId, "10");

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ override: { reason: "Manager approved: customer paying on delivery" } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.creditOverride).toBe(true);
    expect(res.body.creditOverrideReason).toBe("Manager approved: customer paying on delivery");
  });

  it("allows a customer within their limit under policy 'block'", async () => {
    const customerId = await createCustomer({ creditPolicy: "block", creditLimitJod: "1000.000" });
    const orderId = await createOrderWithLine(customerId, "1"); // 20 JOD, well within 1000

    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.creditCheckExceedsByJod).toBe("0.000");
  });

  it("cancels a draft order", async () => {
    const customerId = await createCustomer();
    const created = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });

    const res = await request(app)
      .post(`/api/sales-orders/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Customer changed their mind" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("fulfills a confirmed order", async () => {
    const customerId = await createCustomer({ creditPolicy: "none" });
    const orderId = await createOrderWithLine(customerId, "1");
    await request(app).post(`/api/sales-orders/${orderId}/confirm`).set("Authorization", `Bearer ${admin}`);

    const res = await request(app).post(`/api/sales-orders/${orderId}/fulfill`).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("fulfilled");
  });

  it("rejects fulfilling a draft order directly", async () => {
    const customerId = await createCustomer();
    const orderId = await createOrderWithLine(customerId, "1");

    const res = await request(app).post(`/api/sales-orders/${orderId}/fulfill`).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("counts a customer's real outstanding invoice balance toward its exposure (Phase 8 supersedes the confirmed-sales-order proxy)", async () => {
    const customerId = await createCustomer({ creditPolicy: "block", creditLimitJod: "50.000" });
    // A confirmed-but-not-yet-invoiced order carries no exposure under
    // Phase 8's real-invoice-balance model — confirming it freely is the
    // point of this first assertion, not an oversight.
    const uninvoicedOrderId = await createOrderWithLine(customerId, "2"); // 40 JOD, would have blocked under the old proxy
    const uninvoicedConfirm = await request(app)
      .post(`/api/sales-orders/${uninvoicedOrderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(uninvoicedConfirm.status).toBe(200);

    // A real issued invoice for 40 JOD DOES count.
    await createIssuedInvoiceForCustomer(customerId, "2");

    const secondOrderId = await createOrderWithLine(customerId, "1"); // 20 JOD more -> 60 JOD combined, over 50
    const secondConfirm = await request(app)
      .post(`/api/sales-orders/${secondOrderId}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(secondConfirm.status).toBe(409);
  });
});
