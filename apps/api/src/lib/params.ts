import type { Request } from "express";

/** Express route params can be `string | string[]` per its own types; every route uses single string ids. */
export function paramId(req: Request, name = "id"): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new Error(`Missing or invalid :${name} route parameter`);
  }
  return value;
}

export function queryString(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}
