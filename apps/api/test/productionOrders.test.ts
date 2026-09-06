import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;
let cementId: string;
let sandId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Production Test Plant ${Date.now()}`, code: `PT${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C40", code: `C40-${Date.now()}` });
  productId = productRes.body.id;

  const cementRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Cement ${Date.now()}`, code: `CEM-${Date.now()}`, unit: "kg" });
  cementId = cementRes.body.id;

  const sandRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Sand ${Date.now()}`, code: `SND-${Date.now()}`, unit: "kg" });
  sandId = sandRes.body.id;
});

async function createMixDesign(ingredients: { rawMaterialId: string; quantityPerM3: string }[]) {
  const res = await request(app)
    .post("/api/mix-designs")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, productId, name: `Mix ${Date.now()}-${Math.random()}` });
  const mixDesignId = res.body.id as string;
  for (const ing of ingredients) {
    await request(app)
      .post(`/api/mix-designs/${mixDesignId}/ingredients`)
      .set("Authorization", `Bearer ${admin}`)
      .send(ing);
  }
  return mixDesignId;
}

async function receiveStock(rawMaterialId: string, quantityDelta: string, unitCostJod: string) {
  return request(app)
    .post("/api/stock-adjustments")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, rawMaterialId, quantityDelta, unitCostJod });
}

async function createOrder(mixDesignId: string, plannedQuantityM3 = "10") {
  const res = await request(app)
    .post("/api/production-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, productId, mixDesignId, plannedQuantityM3 });
  return res.body.id as string;
}

describe("mix designs", () => {
  it("creates a mix design with ingredients", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "350.000" }]);
    const res = await request(app).get(`/api/mix-designs/${mixDesignId}`).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.ingredients).toHaveLength(1);
    expect(res.body.ingredients[0].quantityPerM3).toBe("350.000");
  });

  it("403s creating a mix design without permission", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app)
      .post("/api/mix-designs")
      .set("Authorization", `Bearer ${noPerms}`)
      .send({ branchId, productId, name: "x" });
    expect(res.status).toBe(403);
  });
});

describe("stock adjustments — moving average", () => {
  it("sets the average cost on the first receipt", async () => {
    const material = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Gravel ${Date.now()}`, code: `GRV-${Date.now()}`, unit: "kg" });

    const res = await receiveStock(material.body.id, "1000", "0.050");
    expect(res.status).toBe(201);
    expect(res.body.resultingQuantityOnHand).toBe("1000.000");
    expect(res.body.resultingAverageCostJod).toBe("0.050");
  });

  it("re-averages cost across a second receipt", async () => {
    const material = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Admixture ${Date.now()}`, code: `ADM-${Date.now()}`, unit: "L" });

    await receiveStock(material.body.id, "100", "1.000");
    const second = await receiveStock(material.body.id, "100", "3.000");
    expect(second.status).toBe(201);
    // (100*1 + 100*3) / 200 = 2.000
    expect(second.body.resultingAverageCostJod).toBe("2.000");
    expect(second.body.resultingQuantityOnHand).toBe("200.000");
  });

  it("rejects a positive adjustment with no unit cost", async () => {
    const material = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Water ${Date.now()}`, code: `WTR-${Date.now()}`, unit: "L" });
    const res = await request(app)
      .post("/api/stock-adjustments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, rawMaterialId: material.body.id, quantityDelta: "500" });
    expect(res.status).toBe(400);
  });
});

describe("batch recording — back-flush consumption at moving-average cost", () => {
  it("consumes the recipe quantity x actual m3 at the material's average cost, no moisture adjustment", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    await receiveStock(cementId, "10000", "0.040"); // plenty of stock at 0.040 JOD/kg
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "5", actualQuantityM3: "5" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("in_progress"); // auto-transitioned from planned

    const batch = res.body.batches[0];
    expect(batch.batchNumber).toBe(1);
    const consumption = batch.consumptions.find((c: { rawMaterialId: string }) => c.rawMaterialId === cementId);
    // 300 kg/m3 * 5 m3 = 1500 kg
    expect(consumption.quantityConsumed).toBe("1500.000");
    expect(consumption.unitCostJod).toBe("0.040");
    // 1500 * 0.040 = 60.000 JOD
    expect(consumption.totalCostJod).toBe("60.000");
    expect(consumption.wentNegative).toBe(false);

    const balanceRes = await request(app)
      .get(`/api/stock-balances?rawMaterialId=${cementId}&branchId=${branchId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(balanceRes.body.items[0].quantityOnHand).toBe("8500.000"); // 10000 - 1500
  });

  it("applies a uniform moisture adjustment to the consumed quantity", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: sandId, quantityPerM3: "800.000" }]);
    await receiveStock(sandId, "50000", "0.010");
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "2", actualQuantityM3: "2", moistureAdjustmentBasisPoints: 500 }); // +5%
    expect(res.status).toBe(201);

    const consumption = res.body.batches[0].consumptions[0];
    // base = 800 * 2 = 1600; +5% = 1680
    expect(consumption.quantityConsumed).toBe("1680.000");
  });

  it("assigns sequential batch numbers within one production order", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    await receiveStock(cementId, "10000", "0.040");
    const orderId = await createOrder(mixDesignId);

    const first = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "1", actualQuantityM3: "1" });
    const second = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "1", actualQuantityM3: "1" });

    expect(first.body.batches.map((b: { batchNumber: number }) => b.batchNumber)).toEqual([1]);
    expect(second.body.batches.map((b: { batchNumber: number }) => b.batchNumber).sort()).toEqual([1, 2]);
  });

  it("blocks a batch that would take a material's stock negative, with no override", async () => {
    const scarceMaterial = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Scarce Cement ${Date.now()}`, code: `SCC-${Date.now()}`, unit: "kg" });
    const scarceMaterialId = scarceMaterial.body.id as string;
    const mixDesignId = await createMixDesign([{ rawMaterialId: scarceMaterialId, quantityPerM3: "300.000" }]);
    await receiveStock(scarceMaterialId, "100", "0.040"); // only 100 kg on hand
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "5", actualQuantityM3: "5" }); // needs 1500 kg
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("negative_stock_blocked");

    const orderAfter = await request(app).get(`/api/production-orders/${orderId}`).set("Authorization", `Bearer ${admin}`);
    expect(orderAfter.body.status).toBe("planned"); // unaffected — nothing was written
    expect(orderAfter.body.batches).toHaveLength(0);
  });

  it("allows a negative-stock batch with a mandatory-reason override, and records wentNegative", async () => {
    const scarceMaterial = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Scarce Cement ${Date.now()}`, code: `SCC2-${Date.now()}`, unit: "kg" });
    const scarceMaterialId = scarceMaterial.body.id as string;
    const mixDesignId = await createMixDesign([{ rawMaterialId: scarceMaterialId, quantityPerM3: "300.000" }]);
    await receiveStock(scarceMaterialId, "100", "0.040");
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        targetQuantityM3: "5",
        actualQuantityM3: "5",
        override: { reason: "Plant manager approved emergency batch" },
      });
    expect(res.status).toBe(201);
    const consumption = res.body.batches[0].consumptions[0];
    expect(consumption.wentNegative).toBe(true);

    const balanceRes = await request(app)
      .get(`/api/stock-balances?rawMaterialId=${scarceMaterialId}&branchId=${branchId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(Number(balanceRes.body.items[0].quantityOnHand)).toBeLessThan(0);
  });
});

describe("production order lifecycle", () => {
  it("cannot complete without at least one batch", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/complete`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("completes once it has a batch and is in_progress", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    await receiveStock(cementId, "10000", "0.040");
    const orderId = await createOrder(mixDesignId);
    await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "1", actualQuantityM3: "1" });

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/complete`)
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("cancels a planned order", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    const orderId = await createOrder(mixDesignId);

    const res = await request(app)
      .post(`/api/production-orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Order created by mistake" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("records returned concrete and computes yield variance", async () => {
    const mixDesignId = await createMixDesign([{ rawMaterialId: cementId, quantityPerM3: "300.000" }]);
    await receiveStock(cementId, "10000", "0.040");
    const orderId = await createOrder(mixDesignId);
    await request(app)
      .post(`/api/production-orders/${orderId}/batches`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ targetQuantityM3: "10", actualQuantityM3: "10" });

    const returnRes = await request(app)
      .post(`/api/production-orders/${orderId}/returns`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ quantityM3: "0.5", reason: "Customer over-ordered" });
    expect(returnRes.status).toBe(201);

    const yieldRes = await request(app)
      .get(`/api/production-orders/${orderId}/yield-variance`)
      .set("Authorization", `Bearer ${admin}`);
    expect(yieldRes.status).toBe(200);
    expect(yieldRes.body.netProducedM3).toBe("9.500");
    expect(yieldRes.body.deliveryVarianceM3).toBeNull();
  });
});
