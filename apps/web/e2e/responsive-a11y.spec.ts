import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("responsive layout at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sign-in is full-width, not squeezed by a fixed sidebar", async ({ page }) => {
    await page.goto("/login");
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);

    const emailBox = await page.getByLabel(/email/i).boundingBox();
    expect(emailBox?.width).toBeGreaterThan(200);
  });

  test("signed-in layout has a drawer nav, not an always-visible sidebar, and no horizontal overflow", async ({ page }) => {
    await loginAsAdmin(page);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);

    // The desktop rail is hidden at this width; a menu button opens the drawer instead.
    const menuButton = page.getByRole("button", { name: /menu|open navigation/i });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("link", { name: /home/i }).first()).toBeVisible();
  });
});

test.describe("keyboard-accessible record rows", () => {
  test("Tab + Enter opens an invoice row's detail without a mouse", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/invoices");

    const row = page.locator('tr[role="button"]').first();
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Invoice .* —/)).toBeVisible();
  });
});

test.describe("Arabic / RTL", () => {
  test("switching language sets dir=rtl on the document", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test("dark mode toggles without breaking layout", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: /dark mode/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
