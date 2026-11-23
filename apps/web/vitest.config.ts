import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs (see playwright.config.ts) — they import
    // @playwright/test, not vitest, and must not be collected here.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
