import { jwtVerify, SignJWT } from "jose";
import { config } from "../config";

export interface AccessTokenClaims {
  sub: string;
  companyId: string;
  branchId: string | null;
  permissions: string[];
}

const secret = new TextEncoder().encode(config.jwtAccessSecret);

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secret);
  if (
    typeof payload.sub !== "string" ||
    typeof payload.companyId !== "string" ||
    !Array.isArray(payload.permissions)
  ) {
    throw new Error("Malformed access token payload");
  }
  const branchId = payload.branchId;
  return {
    sub: payload.sub,
    companyId: payload.companyId,
    branchId: typeof branchId === "string" ? branchId : null,
    permissions: payload.permissions.filter((p): p is string => typeof p === "string"),
  };
}
