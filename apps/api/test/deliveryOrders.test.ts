import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;
let cementId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Delivery Test Plant ${Date.now()}`, code: `DT${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C35", code: `C35D-${Date.now()}`, characteristicStrengthMpa: 35 });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Delivery Test Prices ${Date.now()}` });
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

  const cementRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Delivery Test Cement ${Date.now()}`, code: `DCEM-${Date.now()}`, unit: "kg" });
  cementId = cementRes.body.id;
});

async function createCustomer(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Delivery Test Customer ${Date.now()}-${Math.random()}`, ...overrides });
  return res.body.id as string;
}

async function createConfirmedSalesOrder(customerId: string, quantityM3: string) {
  const created = await request(app)
    .post("/api/sales-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ customerId, branchId });
  await request(app)
    .post(`/api/sales-orders/${created.body.id}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  await request(app).post(`/api/sales-orders/${created.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);
  return created.body.id as string;
}

async function createTruckAndDriver() {
  const truck = await request(app)
    .post("/api/trucks")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, plateNumber: `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  const driver = await request(app)
    .post("/api/drivers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, name: `Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  return { truckId: truck.body.id as string, driverId: driver.body.id as string };
}

/**
 * Creates a real *issued* invoice for a customer — Phase 8's
 * credit-exposure computation (`apps/api/src/lib/creditExposure.ts`) sums
 * real outstanding invoice balances instead of Phase 2's original
 * confirmed/fulfilled-sales-order proxy, so a dispatch-time credit-block
 * test needs an actual invoice already outstanding, not just a confirmed
 * order sitting elsewhere.
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
  const { truckId, driverId } = await createTruckAndDriver();
  await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ truckId, driverId });
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

describe("delivery orders — creation", () => {
  it("creates a planned delivery order against a confirmed sales order", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "10");

    const res = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "10", scheduledAt: "2026-01-15T08:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("planned");
    expect(res.body.qcFlagged).toBe(false);
  });

  it("400s creating a delivery order against a draft (unconfirmed) sales order", async () => {
    const customerId = await createCustomer();
    const created = await request(app)
      .post("/api/sales-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId });

    const res = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId: created.body.id, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    expect(res.status).toBe(400);
  });
});

describe("delivery orders — dispatch and deliver lifecycle", () => {
  it("dispatches, then delivers with proof of delivery", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "10");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "10", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const id = created.body.id as string;
    const { truckId, driverId } = await createTruckAndDriver();

    const dispatchRes = await request(app)
      .post(`/api/delivery-orders/${id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId });
    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.status).toBe("dispatched");
    expect(dispatchRes.body.truckId).toBe(truckId);
    expect(dispatchRes.body.creditCheckPolicy).toBe("none");

    const deliverRes = await request(app)
      .post(`/api/delivery-orders/${id}/deliver`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ receivedQuantityM3: "9.800", signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });
    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.status).toBe("delivered");
    expect(deliverRes.body.proofOfDelivery).toBeTruthy();
    expect(deliverRes.body.proofOfDelivery.signedByName).toBe("Site Foreman");
    expect(deliverRes.body.proofOfDelivery.receivedQuantityM3).toBe("9.800");
  });

  it("cannot be delivered without going through dispatch (no separate mark-delivered path)", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const id = created.body.id as string;

    const res = await request(app)
      .post(`/api/delivery-orders/${id}/deliver`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ receivedQuantityM3: "5", signedByName: "X", signatureData: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(400);
  });

  // Dispatch-time exposure is Phase 8's real outstanding-invoice-balance
  // computation (`apps/api/src/lib/creditExposure.ts`), not the delivery
  // order being dispatched itself (its own contribution is always zero —
  // the order's total is already reflected via any invoice raised against
  // it). So triggering a block here means giving the customer a real
  // backlog invoice that alone exceeds their limit, built under 'warning'
  // (never blocks) and then flipping the customer to 'block' afterwards —
  // modeling the real scenario dispatch-time re-check exists for: the
  // customer's standing changed after their order was confirmed.
  it("blocks dispatch under credit policy 'block' when the limit is exceeded, with no override", async () => {
    const customerId = await createCustomer({ creditPolicy: "warning", creditLimitJod: "50.000" });
    await createIssuedInvoiceForCustomer(customerId, "3"); // 60 JOD outstanding, over the 50 JOD limit on its own
    const salesOrderId = await createConfirmedSalesOrder(customerId, "10");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "10", scheduledAt: "2026-01-15T08:00:00.000Z" });
    expect(created.status).toBe(201);
    await request(app)
      .put(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ creditPolicy: "block" });
    const { truckId, driverId } = await createTruckAndDriver();

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("credit_blocked");

    const after = await request(app)
      .get(`/api/delivery-orders/${created.body.id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(after.body.status).toBe("planned");
  });

  it("dispatches a blocked delivery order with a mandatory-reason override, and audits it", async () => {
    const customerId = await createCustomer({ creditPolicy: "warning", creditLimitJod: "50.000" });
    await createIssuedInvoiceForCustomer(customerId, "3"); // 60 JOD outstanding, over the 50 JOD limit on its own
    const salesOrderId = await createConfirmedSalesOrder(customerId, "10");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "10", scheduledAt: "2026-01-15T08:00:00.000Z" });
    expect(created.status).toBe(201);
    await request(app)
      .put(`/api/customers/${customerId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ creditPolicy: "block" });
    const { truckId, driverId } = await createTruckAndDriver();

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId, override: { reason: "Plant manager approved" } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dispatched");
    expect(res.body.creditOverride).toBe(true);
    expect(res.body.creditOverrideReason).toBe("Plant manager approved");
  });
});

describe("delivery orders — document-expiry hard block at dispatch (Phase 10)", () => {
  it("422s dispatch when the assigned truck has an already-expired registration, with no override", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const truckRes = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `TRKX-${Date.now()}`, registrationExpiresAt: "2020-01-01T00:00:00.000Z" });
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `DriverX ${Date.now()}` });

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truckRes.body.id, driverId: driverRes.body.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("document_expired");
    expect(res.body.error.details.expiredDocuments).toEqual(["truck.registration"]);

    const after = await request(app).get(`/api/delivery-orders/${created.body.id}`).set("Authorization", `Bearer ${admin}`);
    expect(after.body.status).toBe("planned");
  });

  it("422s dispatch when the assigned driver's license has expired", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const { truckId } = await createTruckAndDriver();
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `DriverExpired ${Date.now()}`, licenseExpiresAt: "2020-01-01T00:00:00.000Z" });

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId: driverRes.body.id });
    expect(res.status).toBe(422);
    expect(res.body.error.details.expiredDocuments).toEqual(["driver.license"]);
  });

  it("dispatches an expired-document truck/driver with a mandatory-reason override, and audits it", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const truckRes = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `TRKO-${Date.now()}`, registrationExpiresAt: "2020-01-01T00:00:00.000Z" });
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `DriverO ${Date.now()}` });

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truckRes.body.id, driverId: driverRes.body.id, override: { reason: "Renewal in progress, dispatcher approved" } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dispatched");
    expect(res.body.documentExpiryOverride).toBe(true);
    expect(res.body.documentExpiryOverrideReason).toBe("Renewal in progress, dispatcher approved");
  });

  it("does not block or warn on a truck/driver with no tracked expiry dates", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const { truckId, driverId } = await createTruckAndDriver();

    const res = await request(app)
      .post(`/api/delivery-orders/${created.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId });
    expect(res.status).toBe(200);
    expect(res.body.documentExpiryOverride).toBe(false);
  });
});

describe("QC flag propagation onto deliveries (DOMAIN.md Invariant 6)", () => {
  it("surfaces qcFlagged/qcFlagReason from the batch a delivery was drawn from", async () => {
    const mixDesignRes = await request(app)
      .post("/api/mix-designs")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, productId, name: `Delivery QC Mix ${Date.now()}` });
    const mixDesignId = mixDesignRes.body.id as string;
    await request(app)
      .post(`/api/mix-designs/${mixDesignId}/ingredients`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId: cementId, quantityPerM3: "300.000" });
    await request(app)
      .post("/api/stock-adjustments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, rawMaterialId: cementId, quantityDelta: "10000", unitCostJod: "0.040" });

    const orderRes = await request(app)
      .post("/api/production-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, productId, mixDesignId, plannedQuantityM3: "5" });
    const productionOrderId = orderRes.body.id as string;
    const batchRes = await request(app)
      .post(`/api/production-orders/${productionOrderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "5", actualQuantityM3: "5" });
    const batchId = batchRes.body.batches[0].id as string;

    await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 28, specimenStrengthsMpa: ["20.0", "21.0", "19.0"] }); // fails vs characteristicStrengthMpa 35

    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        branchId,
        salesOrderId,
        productionOrderId,
        batchRecordId: batchId,
        quantityM3: "5",
        scheduledAt: "2026-01-15T08:00:00.000Z",
      });
    expect(deliveryRes.status).toBe(201);
    expect(deliveryRes.body.qcFlagged).toBe(true);
    expect(deliveryRes.body.qcFlagReason).toMatch(/Failed 28-day cube test/);

    const listRes = await request(app)
      .get(`/api/delivery-orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${admin}`);
    const listed = listRes.body.items.find((d: { id: string }) => d.id === deliveryRes.body.id);
    expect(listed.qcFlagged).toBe(true);
  });
});

describe("dispatch schedule", () => {
  it("returns planned-vs-actual timings for a branch/date range, with customer name", async () => {
    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "5");
    const scheduledAt = "2026-03-01T09:00:00.000Z";
    const created = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, quantityM3: "5", scheduledAt });

    const res = await request(app)
      .get(`/api/dispatch/schedule?branchId=${branchId}&from=2026-03-01T00:00:00.000Z&to=2026-03-01T23:59:59.000Z`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === created.body.id);
    expect(item).toBeTruthy();
    expect(item.status).toBe("planned");
    expect(typeof item.customerName).toBe("string");
  });
});

describe("yield variance closes with real delivered m3 (Phase 3 forward reference)", () => {
  it("computes deliveryVarianceM3 once a delivery has landed", async () => {
    const mixDesignRes = await request(app)
      .post("/api/mix-designs")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, productId, name: `Yield Mix ${Date.now()}` });
    const mixDesignId = mixDesignRes.body.id as string;
    await request(app)
      .post(`/api/mix-designs/${mixDesignId}/ingredients`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId: cementId, quantityPerM3: "300.000" });
    await request(app)
      .post("/api/stock-adjustments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, rawMaterialId: cementId, quantityDelta: "10000", unitCostJod: "0.040" });

    const orderRes = await request(app)
      .post("/api/production-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, productId, mixDesignId, plannedQuantityM3: "10" });
    const productionOrderId = orderRes.body.id as string;
    await request(app)
      .post(`/api/production-orders/${productionOrderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "10", actualQuantityM3: "10" });

    const beforeDelivery = await request(app)
      .get(`/api/production-orders/${productionOrderId}/yield-variance`)
      .set("Authorization", `Bearer ${admin}`);
    expect(beforeDelivery.body.deliveryVarianceM3).toBeNull();

    const customerId = await createCustomer();
    const salesOrderId = await createConfirmedSalesOrder(customerId, "10");
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId, productionOrderId, quantityM3: "10", scheduledAt: "2026-01-15T08:00:00.000Z" });
    const { truckId, driverId } = await createTruckAndDriver();
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId, driverId });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/deliver`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ receivedQuantityM3: "9.750", signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });

    const afterDelivery = await request(app)
      .get(`/api/production-orders/${productionOrderId}/yield-variance`)
      .set("Authorization", `Bearer ${admin}`);
    expect(afterDelivery.body.netProducedM3).toBe("10.000");
    // netProduced (10.000) - delivered (9.750) = 0.250
    expect(afterDelivery.body.deliveryVarianceM3).toBe("0.250");
  });
});
