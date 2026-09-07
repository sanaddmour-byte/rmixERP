import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/accessToken";

export interface AuthContext {
  userId: string;
  companyId: string;
  branchId: string | null;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: { message: "Missing bearer token", code: "unauthorized" } });
    return;
  }

  try {
    const claims = await verifyAccessToken(token);
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      branchId: claims.branchId,
      permissions: claims.permissions,
    };
    next();
  } catch {
    res.status(401).json({ error: { message: "Invalid or expired token", code: "unauthorized" } });
  }
}
