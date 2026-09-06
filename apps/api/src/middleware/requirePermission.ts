import type { NextFunction, Request, Response } from "express";

/**
 * RBAC guard: `module:action` (e.g. "branches:view") must be present in
 * the caller's cached permission list from the access token. This is
 * independent of, and in addition to, the tenancy guard (packages/db's
 * withTenant) — permissions decide WHAT a role may do, tenancy decides
 * WHICH company's rows they can ever see.
 */
export function requirePermission(module: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const permissions = req.auth?.permissions ?? [];
    if (!permissions.includes(`${module}:${action}`)) {
      res.status(403).json({
        error: { message: `Missing permission ${module}:${action}`, code: "forbidden" },
      });
      return;
    }
    next();
  };
}
