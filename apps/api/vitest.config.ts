import { defineConfig } from "vitest/config";

const testOwnerUrl =
  process.env.TEST_OWNER_DATABASE_URL ??
  "postgres://postgres:postgres_dev_password@localhost:5432/rmixerp_test";
const testAppUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://rmixerp_app:rmixerp_app_dev_password@localhost:5432/rmixerp_test";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: testAppUrl,
      MIGRATE_DATABASE_URL: testOwnerUrl,
      APP_DB_ROLE_PASSWORD: "rmixerp_app_dev_password",
      COMPANY_ID: process.env.TEST_COMPANY_ID ?? "00000000-0000-4000-8000-000000000001",
      JWT_ACCESS_SECRET: "test-access-secret-not-for-production-0000000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-not-for-production-0000000",
      RUN_MIGRATIONS_ON_BOOT: "false",
      LOG_LEVEL: "silent",
      TEST_SEED_ADMIN_EMAIL: process.env.TEST_SEED_ADMIN_EMAIL ?? "admin@test.local",
      TEST_SEED_ADMIN_PASSWORD: process.env.TEST_SEED_ADMIN_PASSWORD ?? "TestPass123!",
    },
    fileParallelism: false,
  },
});
