import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;

beforeAll(async () => {
  admin = await adminToken();
});

describe("POST /device-push-tokens", () => {
  it("registers a device token for the signed-in user", async () => {
    const res = await request(app)
      .post("/api/device-push-tokens")
      .set("Authorization", `Bearer ${admin}`)
      .send({ token: `ExponentPushToken[test-${Date.now()}]`, platform: "android" });
    expect(res.status).toBe(201);
    expect(res.body.platform).toBe("android");
    expect(res.body.userId).toBeTruthy();
  });

  it("upserts on a repeat registration of the same token rather than erroring", async () => {
    const token = `ExponentPushToken[repeat-${Date.now()}]`;
    const first = await request(app).post("/api/device-push-tokens").set("Authorization", `Bearer ${admin}`).send({ token, platform: "android" });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/device-push-tokens").set("Authorization", `Bearer ${admin}`).send({ token, platform: "ios" });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.platform).toBe("ios");
  });

  it("400s on a missing platform", async () => {
    const res = await request(app)
      .post("/api/device-push-tokens")
      .set("Authorization", `Bearer ${admin}`)
      .send({ token: `ExponentPushToken[novalidplatform-${Date.now()}]` });
    expect(res.status).toBe(400);
  });

  it("401s without a bearer token", async () => {
    const res = await request(app).post("/api/device-push-tokens").send({ token: "x", platform: "android" });
    expect(res.status).toBe(401);
  });

  it("a registered token does not block the notification producers it backs (qc failure, PR submit)", async () => {
    await request(app)
      .post("/api/device-push-tokens")
      .set("Authorization", `Bearer ${admin}`)
      .send({ token: `ExponentPushToken[nonblocking-${Date.now()}]`, platform: "android" });

    const branchRes = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: `Push Test Plant ${Date.now()}`, code: `PT${Date.now() % 100000}` });

    const prRes = await request(app)
      .post("/api/purchase-requests")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId: branchRes.body.id });
    expect(prRes.status).toBe(201);

    const submitRes = await request(app).post(`/api/purchase-requests/${prRes.body.id}/submit`).set("Authorization", `Bearer ${admin}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("submitted");
  });
});
