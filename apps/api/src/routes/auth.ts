import { Router } from "express";
import { eq } from "drizzle-orm";
import { appUser, withTenant } from "@rmixerp/db";
import {
  LoginBody,
  LogoutBody,
  RefreshSessionBody,
  type AuthSession,
  type CurrentUser,
} from "@rmixerp/contract";
import { db } from "../db";
import { config } from "../config";
import { signAccessToken } from "../auth/accessToken";
import { verifyPassword } from "../auth/passwords";
import { loadPermissions } from "../auth/permissions";
import {
  issueRefreshToken,
  lookupRefreshToken,
  revokeRefreshToken,
} from "../auth/refreshToken";
import { requireAuth } from "../middleware/requireAuth";

export const authRouter = Router();

function unauthorized(message: string) {
  return { error: { message, code: "unauthorized" } };
}

authRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request body", code: "validation_error" } });
    return;
  }
  const { email, password } = parsed.data;

  const session = await withTenant(db, config.companyId, async (tx) => {
    const [user] = await tx.select().from(appUser).where(eq(appUser.email, email));
    if (!user || !user.isActive) return null;

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) return null;

    const permissions = await loadPermissions(tx, user.id);
    const accessToken = await signAccessToken({
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      permissions,
    });
    const refresh = await issueRefreshToken(tx, user.companyId, user.id);

    const currentUser: CurrentUser = {
      id: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      email: user.email,
      displayName: user.displayName,
      permissions,
    };
    const body: AuthSession = {
      accessToken,
      refreshToken: refresh.token,
      user: currentUser,
    };
    return body;
  });

  if (!session) {
    res.status(401).json(unauthorized("Invalid email or password"));
    return;
  }
  res.status(200).json(session);
});

authRouter.post("/auth/refresh", async (req, res) => {
  const parsed = RefreshSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request body", code: "validation_error" } });
    return;
  }

  const session = await withTenant(db, config.companyId, async (tx) => {
    const lookup = await lookupRefreshToken(tx, parsed.data.refreshToken);
    if (!lookup.valid) return null;

    await revokeRefreshToken(tx, lookup.row.id);

    const [user] = await tx.select().from(appUser).where(eq(appUser.id, lookup.row.userId));
    if (!user || !user.isActive) return null;

    const permissions = await loadPermissions(tx, user.id);
    const accessToken = await signAccessToken({
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      permissions,
    });
    const refresh = await issueRefreshToken(tx, user.companyId, user.id);

    const currentUser: CurrentUser = {
      id: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      email: user.email,
      displayName: user.displayName,
      permissions,
    };
    const body: AuthSession = {
      accessToken,
      refreshToken: refresh.token,
      user: currentUser,
    };
    return body;
  });

  if (!session) {
    res.status(401).json(unauthorized("Refresh token invalid, expired, or revoked"));
    return;
  }
  res.status(200).json(session);
});

authRouter.post("/auth/logout", async (req, res) => {
  const parsed = LogoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request body", code: "validation_error" } });
    return;
  }

  await withTenant(db, config.companyId, async (tx) => {
    const lookup = await lookupRefreshToken(tx, parsed.data.refreshToken);
    if (lookup.valid) {
      await revokeRefreshToken(tx, lookup.row.id);
    }
  });

  res.status(204).send();
});

authRouter.get("/auth/me", requireAuth, async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json(unauthorized("Not authenticated"));
    return;
  }

  const currentUser = await withTenant(db, auth.companyId, async (tx) => {
    const [user] = await tx.select().from(appUser).where(eq(appUser.id, auth.userId));
    if (!user) return null;
    const found: CurrentUser = {
      id: user.id,
      companyId: user.companyId,
      branchId: user.branchId,
      email: user.email,
      displayName: user.displayName,
      permissions: auth.permissions,
    };
    return found;
  });

  if (!currentUser) {
    res.status(401).json(unauthorized("Not authenticated"));
    return;
  }
  res.status(200).json(currentUser);
});
