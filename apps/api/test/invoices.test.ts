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
    .send({ name: `Invoice Test Plant ${Date.now()}`, code: `IV${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C40", code: `C40IV-${Date.now()}` });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Invoice Test Prices ${Date.now()}` });
  const priceListId = priceListRes.body.id;

  await request(app)
    .post(`/api/price-lists/${priceListId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({
      productId,
      concreteUnitPriceJod: "20.000",
      deliveryUnitPriceJod: "5.000",
      taxRateBasisPoints: 1600,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
});

async function createCustomer() {
  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Invoice Test Customer ${Date.now()}-${Math.random()}` });
  return res.body.id as string;
}

/** Creates a customer, confirmed sales order + line, dispatched + delivered delivery order. */
async function setupDeliveredDeliveryOrder(quantityM3: string) {
  const customerId = await createCustomer();
  const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
  const salesOrderId = orderRes.body.id as string;
  const lineRes = await request(app)
    .post(`/api/sales-orders/${salesOrderId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  const salesOrderLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/sales-orders/${salesOrderId}/confirm`).set("Authorization", `Bearer ${admin}`);

  const deliveryRes = await request(app)
    .post("/api/delivery-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, salesOrderId, salesOrderLineId, quantityM3, scheduledAt: "2026-01-15T08:00:00.000Z" });
  const deliveryOrderId = deliveryRes.body.id as string;

  const truck = await request(app)
    .post("/api/trucks")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, plateNumber: `IVTRK-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  const driver = await request(app)
    .post("/api/drivers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, name: `Invoice Test Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  await request(app)
    .post(`/api/delivery-orders/${deliveryOrderId}/dispatch`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ truckId: truck.body.id, driverId: driver.body.id });
  await request(app)
    .post(`/api/delivery-orders/${deliveryOrderId}/deliver`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ receivedQuantityM3: quantityM3, signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });

  return { deliveryOrderId, customerId };
}

describe("invoice generation — combined mode", () => {
  it("computes taxable concrete + exempt delivery lines correctly and transitions the delivery order to invoiced", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("10");

    const res = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    expect(res.status).toBe(201);
    expect(res.body.invoices).toHaveLength(1);

    const inv = res.body.invoices[0];
    expect(inv.status).toBe("draft");
    expect(inv.relatedInvoiceId).toBeNull();
    expect(inv.lines).toHaveLength(2);
    expect(inv.subtotalJod).toBe("250.000"); // 20*10 + 5*10
    expect(inv.taxJod).toBe("32.000"); // 16% of concrete's 200.000 only
    expect(inv.totalJod).toBe("282.000");
    expect(/^[A-Z0-9]+-\d{4}-\d{4}$/.test(inv.invoiceNumber)).toBe(true);

    const taxableLine = inv.lines.find((l: { taxTreatment: string }) => l.taxTreatment === "taxable");
    const exemptLine = inv.lines.find((l: { taxTreatment: string }) => l.taxTreatment === "exempt");
    expect(taxableLine.netJod).toBe("200.000");
    expect(taxableLine.taxJod).toBe("32.000");
    expect(exemptLine.netJod).toBe("50.000");
    expect(exemptLine.taxJod).toBe("0.000");

    const deliveryAfter = await request(app).get(`/api/delivery-orders/${deliveryOrderId}`).set("Authorization", `Bearer ${admin}`);
    expect(deliveryAfter.body.status).toBe("invoiced");
  });

  it("400s generating an invoice for a delivery order that isn't delivered yet", async () => {
    const customerId = await createCustomer();
    const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
    const lineRes = await request(app)
      .post(`/api/sales-orders/${orderRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        branchId,
        salesOrderId: orderRes.body.id,
        salesOrderLineId: lineRes.body.lines[0].id,
        quantityM3: "5",
        scheduledAt: "2026-01-15T08:00:00.000Z",
      });

    const res = await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    expect(res.status).toBe(400);
  });

  it("400s generating an invoice when the delivery order has no sales-order-line reference", async () => {
    const customerId = await createCustomer();
    const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
    await request(app)
      .post(`/api/sales-orders/${orderRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);
    // No salesOrderLineId supplied.
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId: orderRes.body.id, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const truck = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `IVTRK2-${Date.now()}` });
    const driver = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `Invoice Test Driver 2 ${Date.now()}` });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truck.body.id, driverId: driver.body.id });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/deliver`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ receivedQuantityM3: "5", signedByName: "X", signatureData: "data:image/png;base64,AAAA" });

    const res = await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    expect(res.status).toBe(400);
  });
});

describe("invoice generation — split mode", () => {
  it("produces a cross-referencing pair, each with one line", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("4");

    const res = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "split" });
    expect(res.status).toBe(201);
    expect(res.body.invoices).toHaveLength(2);

    const [a, b] = res.body.invoices;
    expect(a.lines).toHaveLength(1);
    expect(b.lines).toHaveLength(1);
    expect(a.relatedInvoiceId).toBe(b.id);
    expect(b.relatedInvoiceId).toBe(a.id);
    const treatments = [a.lines[0].taxTreatment, b.lines[0].taxTreatment].sort();
    expect(treatments).toEqual(["exempt", "taxable"]);
  });
});

describe("double-billing prevention (DOMAIN.md Invariant 1)", () => {
  it("409s a second invoicing attempt against the same delivery order", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("6");

    const first = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    expect(second.status).toBe(400); // already transitioned to "invoiced" — fails the status check
  });

  it("exactly one of two simultaneous invoicing requests against the same delivery order succeeds", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("7");

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/delivery-orders/${deliveryOrderId}/invoice`).set("Authorization", `Bearer ${admin}`).send({ mode: "combined" }),
      request(app).post(`/api/delivery-orders/${deliveryOrderId}/invoice`).set("Authorization", `Bearer ${admin}`).send({ mode: "combined" }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBeLessThan(300); // one succeeded (201)
    expect(statuses[1]).toBeGreaterThanOrEqual(400); // the other was rejected (400 or 409)

    const deliveryAfter = await request(app).get(`/api/delivery-orders/${deliveryOrderId}`).set("Authorization", `Bearer ${admin}`);
    expect(deliveryAfter.body.status).toBe("invoiced");
  });
});

describe("gapless per-branch-per-month invoice numbering", () => {
  it("allocates sequential numbers for consecutive invoices in the same branch/month", async () => {
    const a = await setupDeliveredDeliveryOrder("1");
    const b = await setupDeliveredDeliveryOrder("1");

    const resA = await request(app)
      .post(`/api/delivery-orders/${a.deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    const resB = await request(app)
      .post(`/api/delivery-orders/${b.deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });

    const numA = resA.body.invoices[0].invoiceNumber as string;
    const numB = resB.body.invoices[0].invoiceNumber as string;
    const seqA = Number(numA.split("-").pop());
    const seqB = Number(numB.split("-").pop());
    expect(seqB).toBe(seqA + 1);
    expect(numA.slice(0, numA.lastIndexOf("-"))).toBe(numB.slice(0, numB.lastIndexOf("-"))); // same {BRANCH}-{YYMM} prefix
  });
});

describe("credit and debit notes", () => {
  it("records a credit note and a debit note against an invoice", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("2");
    const invoiceRes = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ mode: "combined" });
    const invoiceId = invoiceRes.body.invoices[0].id as string;

    const creditRes = await request(app)
      .post(`/api/invoices/${invoiceId}/credit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "10.000", reason: "Pricing correction" });
    expect(creditRes.status).toBe(201);
    expect(creditRes.body.creditNotes).toHaveLength(1);
    expect(creditRes.body.creditNotes[0].amountJod).toBe("10.000");
    expect(creditRes.body.creditNotes[0].noteNumber).toMatch(/^CN-/);

    const debitRes = await request(app)
      .post(`/api/invoices/${invoiceId}/debit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "3.000", reason: "Additional charge" });
    expect(debitRes.status).toBe(201);
    expect(debitRes.body.debitNotes).toHaveLength(1);
    expect(debitRes.body.debitNotes[0].noteNumber).toMatch(/^DN-/);
  });
});

describe("Idempotency-Key dedup (CLAUDE.md Hard Rule)", () => {
  it("replays the original response for a repeated key with the same request, and rejects reuse with a different one", async () => {
    const { deliveryOrderId } = await setupDeliveredDeliveryOrder("3");
    const idempotencyKey = `test-key-${Date.now()}`;

    const first = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ mode: "combined" });
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ mode: "combined" });
    expect(replay.status).toBe(201);
    expect(replay.body.invoices[0].id).toBe(first.body.invoices[0].id); // same invoice, not a new one

    const reused = await request(app)
      .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
      .set("Authorization", `Bearer ${admin}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ mode: "split" }); // different body, same key
    expect(reused.status).toBe(422);
  });
});
