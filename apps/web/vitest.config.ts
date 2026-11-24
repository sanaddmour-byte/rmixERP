import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // `e2e/` is Playwright's own suite (see playwright.config.ts) — its
    // `*.spec.ts` files would otherwise match Vitest's default include
    // pattern too and crash the same way Playwright used to crash on
    // Vitest's files before that config existed.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
