function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Single-tenant at go-live: the API is configured with the one seeded
 * company's id and always scopes pre-auth requests (e.g. login) to it via
 * `withTenant`. Multi-company support will replace this with a per-request
 * resolution (subdomain/header/claim) instead of a fixed config value.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  migrateDatabaseUrl: process.env.MIGRATE_DATABASE_URL ?? required("DATABASE_URL"),
  appDbRolePassword: required("APP_DB_ROLE_PASSWORD"),
  companyId: required("COMPANY_ID"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 30 * 24 * 60 * 60),
  runMigrationsOnBoot: process.env.RUN_MIGRATIONS_ON_BOOT !== "false",
};
