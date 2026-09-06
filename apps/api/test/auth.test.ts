import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

/**
 * Hits the real HTTP endpoints against the real test database (rmixerp_test)
 * per CLAUDE.md's rule that business-rule tests use the real endpoint, not
 * a mocked repository. The admin fixture is seeded by
 * `packages/db/seed/run.ts` (see vitest.config.ts for the matching env).
 */

const app = createApp();
const adminEmail = process.env.TEST_SEED_ADMIN_EMAIL ?? "admin@test.local";
const adminPassword = process.env.TEST_SEED_ADMIN_PASSWORD ?? "TestPass123!";

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.time).toBe("string");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects a malformed body with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects an unknown email with 401 (not a 404 that would leak account existence)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@nowhere.local", password: "whatever1" });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and returns a session", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(adminEmail);
    expect(res.body.user.permissions.length).toBeGreaterThan(0);
  });
});

describe("authenticated session lifecycle", () => {
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: adminPassword });
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it("GET /api/auth/me requires a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me rejects a garbage token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns the current user for a valid token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(adminEmail);
  });

  it("POST /api/auth/refresh rotates the refresh token and rejects the old one on reuse", async () => {
    const first = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const reuseOld = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuseOld.status).toBe(401);

    // rotate our local reference forward so later tests use a live token
    refreshToken = first.body.refreshToken;
    accessToken = first.body.accessToken;
  });

  it("POST /api/auth/logout revokes the refresh token", async () => {
    const logoutRes = await request(app).post("/api/auth/logout").send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("POST /api/auth/logout is safe to call with an already-revoked/unknown token", async () => {
    const res = await request(app).post("/api/auth/logout").send({ refreshToken: "unknown-token" });
    expect(res.status).toBe(204);
  });
});
