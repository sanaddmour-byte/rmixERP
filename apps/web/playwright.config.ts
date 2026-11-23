import { defineConfig, devices } from "@playwright/test";

/**
 * A dedicated testDir keeps these browser specs out of `vitest run`'s
 * discovery (see vitest.config.ts's matching exclude) and keeps Playwright
 * from trying to run the Vitest unit tests under test/ as browser specs —
 * the two commands previously had no config to tell them apart.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH && {
      launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
    }),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
