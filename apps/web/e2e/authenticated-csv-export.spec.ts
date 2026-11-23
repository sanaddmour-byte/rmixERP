import { test, expect } from "@playwright/test";
import { loginUi } from "./helpers";

/**
 * A plain `<a href download>` can't carry the app's Bearer token (it lives
 * in localStorage, not a cookie — see lib/downloadCsv.ts), so every CSV
 * export in the app used to hit the API unauthenticated and fail. Confirms
 * the fix: clicking Export CSV actually downloads a non-empty CSV file.
 */
test("Customers CSV export downloads via an authenticated request", async ({ page }) => {
  await loginUi(page);
  await page.goto("/customers");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  expect(content.length).toBeGreaterThan(0);
  expect(content.split("\n")[0]).toMatch(/,/); // a header row, not an error page
});
