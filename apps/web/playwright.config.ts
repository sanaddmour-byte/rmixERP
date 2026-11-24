import { defineConfig, devices } from "@playwright/test";

/**
 * A dedicated browser test suite, kept out of Vitest's reach and vice
 * versa: `testDir` points only at `./e2e` (never `./test`, which is
 * Vitest's own directory and uses `describe`/`it` globals and
 * `import.meta.env` in a way that crashes under the Playwright runner —
 * the exact failure `pnpm test:e2e` hit before this file existed, since
 * `playwright test` with no config discovers every `*.test.ts` in the
 * project by default).
 *
 * Runs against the real dev servers (API + web), started automatically
 * if not already running — `reuseExistingServer` is on outside CI so a
 * local `pnpm dev` session already running is reused rather than
 * fighting over the same ports.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "off",
    launchOptions: {
      // Only ever set for this sandboxed dev environment's own
      // verification runs (its browser lives outside Playwright's usual
      // managed-install location) — unset everywhere else, including
      // real CI, where Playwright resolves its own installed browser.
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
      // Chromium's sandbox needs a non-root user; this container runs as
      // root, so only this ad-hoc verification path disables it — real CI
      // runners aren't root and keep the sandbox on.
      ...(process.env.PLAYWRIGHT_NO_SANDBOX ? { args: ["--no-sandbox"] } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @rmixerp/api dev",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @rmixerp/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
