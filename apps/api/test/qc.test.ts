import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let cementId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `QC Test Plant ${Date.now()}`, code: `QT${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const cementRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `QC Cement ${Date.now()}`, code: `QCEM-${Date.now()}`, unit: "kg" });
  cementId = cementRes.body.id;
});

async function createProduct(characteristicStrengthMpa?: number) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({
      name: `C30-${Date.now()}-${Math.random()}`,
      code: `C30-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      ...(characteristicStrengthMpa !== undefined && { characteristicStrengthMpa }),
    });
  return res.body.id as string;
}

async function createMixDesign(productId: string) {
  const res = await request(app)
    .post("/api/mix-designs")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, productId, name: `QC Mix ${Date.now()}-${Math.random()}` });
  const mixDesignId = res.body.id as string;
  await request(app)
    .post(`/api/mix-designs/${mixDesignId}/ingredients`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ rawMaterialId: cementId, quantityPerM3: "300.000" });
  return mixDesignId;
}

async function receiveStock(quantityDelta: string, unitCostJod: string) {
  return request(app)
    .post("/api/stock-adjustments")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, rawMaterialId: cementId, quantityDelta, unitCostJod });
}

async function createBatch(productId: string, mixDesignId: string) {
  const orderRes = await request(app)
    .post("/api/production-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, productId, mixDesignId, plannedQuantityM3: "5" });
  const orderId = orderRes.body.id as string;

  const batchRes = await request(app)
    .post(`/api/production-orders/${orderId}/batches`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ targetQuantityM3: "5", actualQuantityM3: "5" });
  const batchId = batchRes.body.batches[0].id as string;
  return { orderId, batchId };
}

describe("fresh tests", () => {
  it("records a fresh test for a batch", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);

    const res = await request(app)
      .post(`/api/batches/${batchId}/fresh-tests`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ slumpMm: "120.0", concreteTemperatureC: "24.5", airContentPercent: "1.80" });
    expect(res.status).toBe(201);
    expect(res.body.slumpMm).toBe("120.0");
    expect(res.body.batchRecordId).toBe(batchId);

    const list = await request(app).get(`/api/batches/${batchId}/fresh-tests`).set("Authorization", `Bearer ${admin}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("403s without qc:create permission", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);
    const noPerms = await noPermissionsToken();

    const res = await request(app)
      .post(`/api/batches/${batchId}/fresh-tests`)
      .set("Authorization", `Bearer ${noPerms}`)
      .send({ slumpMm: "100.0" });
    expect(res.status).toBe(403);
  });
});

describe("cube tests — pass/fail evaluation", () => {
  it("passes at the design age when the average meets the characteristic strength", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);

    const res = await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 28, specimenStrengthsMpa: ["31.0", "32.0", "33.0"] });
    expect(res.status).toBe(201);
    expect(res.body.averageStrengthMpa).toBe("32.00");
    expect(res.body.pass).toBe(true);
    expect(res.body.specimens).toHaveLength(3);
  });

  it("does not render a verdict before the design age (7-day)", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);

    const res = await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 7, specimenStrengthsMpa: ["18.0", "19.0", "20.0"] });
    expect(res.status).toBe(201);
    expect(res.body.pass).toBeNull();
  });

  it("fails at the design age, flags the batch, and raises a notification", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { orderId, batchId } = await createBatch(productId, mixDesignId);

    const res = await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 28, specimenStrengthsMpa: ["20.0", "21.0", "19.0"] });
    expect(res.status).toBe(201);
    expect(res.body.pass).toBe(false);

    const orderRes = await request(app).get(`/api/production-orders/${orderId}`).set("Authorization", `Bearer ${admin}`);
    const batch = orderRes.body.batches.find((b: { id: string }) => b.id === batchId);
    expect(batch.qcFlagged).toBe(true);
    expect(batch.qcFlagReason).toMatch(/Failed 28-day cube test/);

    const notifications = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${admin}`);
    expect(notifications.status).toBe(200);
    const notif = notifications.body.items.find((n: { entityId: string }) => n.entityId === batchId);
    expect(notif).toBeTruthy();
    expect(notif.type).toBe("qc_cube_test_failed");

    const markRead = await request(app).post(`/api/notifications/${notif.id}/read`).set("Authorization", `Bearer ${admin}`);
    expect(markRead.status).toBe(200);
    expect(markRead.body.readAt).not.toBeNull();
  });

  it("400s recording a cube test for a product with no characteristic strength configured", async () => {
    const productId = await createProduct();
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);

    const res = await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 28, specimenStrengthsMpa: ["30.0"] });
    expect(res.status).toBe(400);
  });
});

describe("cube test traceability", () => {
  it("lists cube test sets with batch/mix-design context, filterable by result", async () => {
    const productId = await createProduct(30);
    const mixDesignId = await createMixDesign(productId);
    await receiveStock("10000", "0.040");
    const { batchId } = await createBatch(productId, mixDesignId);

    await request(app)
      .post(`/api/batches/${batchId}/cube-test-sets`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ageDays: 28, specimenStrengthsMpa: ["35.0", "36.0", "37.0"] });

    const res = await request(app).get("/api/qc/cube-test-sets?result=pass").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { batchRecordId: string }) => i.batchRecordId === batchId);
    expect(item).toBeTruthy();
    expect(item.mixDesignId).toBe(mixDesignId);
    expect(item.productId).toBe(productId);
    expect(item.pass).toBe(true);

    const detail = await request(app).get(`/api/qc/cube-test-sets/${item.id}`).set("Authorization", `Bearer ${admin}`);
    expect(detail.status).toBe(200);
    expect(detail.body.specimens).toHaveLength(3);
  });
});
