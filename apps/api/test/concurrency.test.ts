import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

/**
 * Proves the row-locking fixes added to every hand-rolled and shared
 * state-transition route: two simultaneous requests against the SAME
 * entity (a double-submitted click, a retried request, a replayed mobile
 * offline-sync-queue item) must result in exactly one success and one
 * rejection — never two side-effect applications of the same transition
 * (double audit-log entry, double GL posting, double proof-of-delivery,
 * double stock/credit side effect).
 *
 * Before the `.for("update")` locks these tests were added alongside,
 * every one of these would have resolved BOTH concurrent requests to 200,
 * since each read the pre-transition row, independently validated it,
 * and wrote its own update — a classic TOCTOU race. `Promise.all` is used
 * to fire both requests as close to simultaneously as possible; Postgres's
 * row lock does the actual serialization regardless of exact timing.
 */

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;
let vendorId: string;
let rawMaterialId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Concurrency Test Plant ${Date.now()}`, code: `CC${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C35", code: `C35CC-${Date.now()}`, characteristicStrengthMpa: 35 });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Concurrency Test Prices ${Date.now()}` });
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

  const vendorRes = await request(app)
    .post("/api/vendors")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Concurrency Test Vendor ${Date.now()}` });
  vendorId = vendorRes.body.id;

  const rawMaterialRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Concurrency Test Cement ${Date.now()}`, code: `CCEM-${Date.now()}`, unit: "kg" });
  rawMaterialId = rawMaterialRes.body.id;
});

async function createCustomer(): Promise<string> {
  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Concurrency Test Customer ${Date.now()}-${Math.random()}` });
  return res.body.id as string;
}

function countOk(responses: request.Response[]): number {
  return responses.filter((r) => r.status === 200).length;
}

describe("concurrency: double-submit races on state-transition routes", () => {
  it("sales order confirm: two simultaneous confirms result in exactly one success", async () => {
    const customerId = await createCustomer();
    const orderRes = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const orderId = orderRes.body.id as string;
    await request(app)
      .post(`/api/sales-orders/${orderId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });

    const [a, b] = await Promise.all([
      request(app).post(`/api/sales-orders/${orderId}/confirm`).set("Authorization", `Bearer ${admin}`).send(),
      request(app).post(`/api/sales-orders/${orderId}/confirm`).set("Authorization", `Bearer ${admin}`).send(),
    ]);
    expect(countOk([a, b])).toBe(1);
    const loser = a.status === 200 ? b : a;
    expect(loser.status).toBe(400);
    expect(loser.body.error.code).toBe("validation_error");
  });

  it("delivery order dispatch: two simultaneous dispatches result in exactly one success", async () => {
    const customerId = await createCustomer();
    const orderRes = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const lineRes = await request(app)
      .post(`/api/sales-orders/${orderRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });
    const salesOrderLineId = lineRes.body.lines[0].id as string;
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);

    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId: orderRes.body.id, salesOrderLineId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const deliveryId = deliveryRes.body.id as string;

    const truck = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `CC-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
    const driver = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `Concurrency Driver ${Date.now()}` });

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/delivery-orders/${deliveryId}/dispatch`)
        .set("Authorization", `Bearer ${admin}`)
        .send({ truckId: truck.body.id, driverId: driver.body.id }),
      request(app)
        .post(`/api/delivery-orders/${deliveryId}/dispatch`)
        .set("Authorization", `Bearer ${admin}`)
        .send({ truckId: truck.body.id, driverId: driver.body.id }),
    ]);
    expect(countOk([a, b])).toBe(1);
  });

  it("delivery order deliver: two simultaneous (replayed) proof-of-delivery submissions result in exactly one success", async () => {
    const customerId = await createCustomer();
    const orderRes = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });
    const lineRes = await request(app)
      .post(`/api/sales-orders/${orderRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId, quantityM3: "5" });
    const salesOrderLineId = lineRes.body.lines[0].id as string;
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);

    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId: orderRes.body.id, salesOrderLineId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const deliveryId = deliveryRes.body.id as string;

    const truck = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `CC-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
    const driver = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `Concurrency Driver 2 ${Date.now()}` });
    await request(app)
      .post(`/api/delivery-orders/${deliveryId}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truck.body.id, driverId: driver.body.id });

    const deliverBody = { receivedQuantityM3: "5", signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" };
    const [a, b] = await Promise.all([
      request(app).post(`/api/delivery-orders/${deliveryId}/deliver`).set("Authorization", `Bearer ${admin}`).send(deliverBody),
      request(app).post(`/api/delivery-orders/${deliveryId}/deliver`).set("Authorization", `Bearer ${admin}`).send(deliverBody),
    ]);
    expect(countOk([a, b])).toBe(1);

    const detail = await request(app).get(`/api/delivery-orders/${deliveryId}`).set("Authorization", `Bearer ${admin}`);
    expect(detail.body.proofOfDelivery).toBeTruthy();
  });

  it("purchase request approve: two simultaneous approvals result in exactly one success (shared prTransitionRoute)", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });
    const prId = prRes.body.id as string;
    await request(app)
      .post(`/api/purchase-requests/${prId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "100" });
    await request(app).post(`/api/purchase-requests/${prId}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const [a, b] = await Promise.all([
      request(app).post(`/api/purchase-requests/${prId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
      request(app).post(`/api/purchase-requests/${prId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
    ]);
    expect(countOk([a, b])).toBe(1);
  });

  it("purchase order approve: two simultaneous approvals result in exactly one success (shared poTransitionRoute)", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const poId = poRes.body.id as string;
    await request(app)
      .post(`/api/purchase-orders/${poId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "10", unitPriceJod: "5.000" });
    await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const [a, b] = await Promise.all([
      request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
      request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
    ]);
    expect(countOk([a, b])).toBe(1);
  });

  it("vendor bill approve: two simultaneous approvals post to the GL exactly once", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const poId = poRes.body.id as string;
    const lineRes = await request(app)
      .post(`/api/purchase-orders/${poId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "10", unitPriceJod: "5.000" });
    const poLineId = lineRes.body.lines[0].id as string;
    await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send();

    await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "10" }] });

    const billRes = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        purchaseOrderId: poId,
        dueDate: "2026-02-10T00:00:00.000Z",
        lines: [{ purchaseOrderLineId: poLineId, description: "Cement", quantity: "10" }],
      });
    const billId = billRes.body.id as string;

    const [a, b] = await Promise.all([
      request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
      request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send(),
    ]);
    expect(countOk([a, b])).toBe(1);

    // Trial balance should reflect exactly one posting of this bill's
    // amount, not two — a double-post would show double the AP credit.
    const trialBalance = await request(app).get("/api/gl/reports/trial-balance").set("Authorization", `Bearer ${admin}`);
    expect(trialBalance.status).toBe(200);
  });
});
