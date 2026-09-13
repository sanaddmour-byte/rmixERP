import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let vendorId: string;
let rawMaterialId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Approvals Test Plant ${Date.now()}`, code: `AP${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const vendorRes = await request(app)
    .post("/api/vendors")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Approvals Test Vendor ${Date.now()}` });
  vendorId = vendorRes.body.id;

  const rawMaterialRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "Approvals Gravel", code: `GRV-${Date.now()}`, unit: "ton" });
  rawMaterialId = rawMaterialRes.body.id;
});

describe("approvals inbox", () => {
  it("lists a submitted purchase request", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });
    await request(app).post(`/api/purchase-requests/${prRes.body.id}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === prRes.body.id);
    expect(item).toBeTruthy();
    expect(item.documentType).toBe("purchase_request");
    expect(item.number).toBe(prRes.body.requestNumber);
    expect(item.amountJod).toBeNull();
  });

  it("does not list a draft (not-yet-submitted) purchase request", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });

    const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${admin}`);
    expect(res.body.items.some((i: { id: string }) => i.id === prRes.body.id)).toBe(false);
  });

  it("lists a submitted purchase order with its total", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    await request(app)
      .post(`/api/purchase-orders/${poRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "2", unitPriceJod: "10.000" });
    await request(app).post(`/api/purchase-orders/${poRes.body.id}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${admin}`);
    const item = res.body.items.find((i: { id: string }) => i.id === poRes.body.id);
    expect(item).toBeTruthy();
    expect(item.documentType).toBe("purchase_order");
    expect(item.amountJod).toBe("23.200"); // 20 net + 16% tax
  });

  it("lists a draft vendor bill awaiting approval", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const lineRes = await request(app)
      .post(`/api/purchase-orders/${poRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "5", unitPriceJod: "4.000" });
    const poLineId = lineRes.body.lines[0].id as string;
    await request(app).post(`/api/purchase-orders/${poRes.body.id}/submit`).set("Authorization", `Bearer ${admin}`).send();
    await request(app).post(`/api/purchase-orders/${poRes.body.id}/approve`).set("Authorization", `Bearer ${admin}`).send();
    await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poRes.body.id, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "5" }] });
    const billRes = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poRes.body.id, dueDate: "2026-12-01T00:00:00.000Z", lines: [{ purchaseOrderLineId: poLineId, description: "Gravel", quantity: "5" }] });

    const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${admin}`);
    const item = res.body.items.find((i: { id: string }) => i.id === billRes.body.id);
    expect(item).toBeTruthy();
    expect(item.documentType).toBe("vendor_bill");
    expect(item.number).toBe(billRes.body.billNumber);
  });

  it("returns an empty list for a user with none of the relevant approve permissions", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${noPerms}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
