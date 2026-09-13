import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `FleetOps Test Plant ${Date.now()}`, code: `FO${Date.now() % 100000}` });
  branchId = branchRes.body.id;
});

describe("document-expiry report", () => {
  it("defaults to a 30-day warning window on a freshly-seeded company", async () => {
    const res = await request(app).get("/api/company").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.documentExpiryWarningDays).toBe(30);
  });

  it("lists an already-expired truck registration as status 'expired'", async () => {
    const truckRes = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `FOEXP-${Date.now()}`, registrationExpiresAt: "2020-01-01T00:00:00.000Z" });

    const res = await request(app).get("/api/reports/document-expiry").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { entityId: string; document: string }) => i.entityId === truckRes.body.id && i.document === "registration");
    expect(item).toBeTruthy();
    expect(item.status).toBe("expired");
    expect(item.entityType).toBe("truck");
    expect(item.label).toBe(truckRes.body.plateNumber);
  });

  it("lists a driver's license expiring within the warning window as status 'warning', not 'expired'", async () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days out, inside the default 30-day window
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `FleetOps Driver ${Date.now()}`, licenseExpiresAt: soon });

    const res = await request(app).get("/api/reports/document-expiry").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { entityId: string }) => i.entityId === driverRes.body.id);
    expect(item).toBeTruthy();
    expect(item.status).toBe("warning");
    expect(item.document).toBe("license");
  });

  it("does not list a truck/driver whose documents are valid well beyond the warning window", async () => {
    const truckRes = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `FOFINE-${Date.now()}`, registrationExpiresAt: "2099-01-01T00:00:00.000Z" });

    const res = await request(app).get("/api/reports/document-expiry").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { entityId: string }) => i.entityId === truckRes.body.id)).toBe(false);
  });

  it("honors a narrower company warning-days setting", async () => {
    const original = await request(app).get("/api/company").set("Authorization", `Bearer ${admin}`);
    const originalWarningDays = original.body.documentExpiryWarningDays as number;

    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days out
    const truckRes = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `FONARROW-${Date.now()}`, insuranceExpiresAt: soon });

    await request(app).put("/api/company").set("Authorization", `Bearer ${admin}`).send({ documentExpiryWarningDays: 1 });
    const narrowRes = await request(app).get("/api/reports/document-expiry").set("Authorization", `Bearer ${admin}`);
    expect(narrowRes.body.items.some((i: { entityId: string }) => i.entityId === truckRes.body.id)).toBe(false);

    await request(app).put("/api/company").set("Authorization", `Bearer ${admin}`).send({ documentExpiryWarningDays: 10 });
    const wideRes = await request(app).get("/api/reports/document-expiry").set("Authorization", `Bearer ${admin}`);
    expect(wideRes.body.items.some((i: { entityId: string }) => i.entityId === truckRes.body.id)).toBe(true);

    await request(app).put("/api/company").set("Authorization", `Bearer ${admin}`).send({ documentExpiryWarningDays: originalWarningDays });
  });
});
