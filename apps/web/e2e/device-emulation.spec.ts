import { test, expect, devices } from "@playwright/test";

/**
 * Kept in its own file: `test.use()` options that set `defaultBrowserType`
 * (which device presets like `devices["iPhone 13"]` do, defaulting to
 * WebKit) apply across the whole file they're declared in, not just the
 * tests declared after them — sharing a file with unrelated tests made
 * every one of them silently inherit the device's 390-wide viewport too.
 */
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });
test("iPhone 13 viewport renders the sign-in page without horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
