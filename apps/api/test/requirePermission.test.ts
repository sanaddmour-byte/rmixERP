import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requirePermission } from "../src/middleware/requirePermission";

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe("requirePermission", () => {
  it("calls next() when the permission is present", () => {
    const req = { auth: { permissions: ["branches:view"] } } as unknown as Request;
    const res = mockRes() as unknown as Response;
    const next = vi.fn();

    requirePermission("branches", "view")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when the permission is missing", () => {
    const req = { auth: { permissions: ["branches:view"] } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("branches", "void")(req, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when there is no auth context at all", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission("branches", "view")(req, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
