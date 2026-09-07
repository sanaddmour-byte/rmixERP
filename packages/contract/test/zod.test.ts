import { describe, expect, it } from "vitest";
import { GetHealthResponse, LoginBody } from "../generated/zod";

describe("generated Zod schemas (proves the OpenAPI -> Zod pipeline works)", () => {
  it("accepts a valid login body", () => {
    expect(LoginBody.safeParse({ email: "a@b.com", password: "password1" }).success).toBe(true);
  });

  it("rejects a short password per the spec's minLength: 8", () => {
    expect(LoginBody.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(LoginBody.safeParse({ email: "not-an-email", password: "password1" }).success).toBe(false);
  });

  it("validates the health response shape", () => {
    expect(
      GetHealthResponse.safeParse({ status: "ok", time: new Date().toISOString() }).success,
    ).toBe(true);
    expect(GetHealthResponse.safeParse({ status: "bad", time: "x" }).success).toBe(false);
  });
});
