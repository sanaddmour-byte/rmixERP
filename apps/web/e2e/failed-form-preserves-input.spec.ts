import { test, expect } from "@playwright/test";
import { loginUi } from "./helpers";

/**
 * docs/ui-ux-audit.md's "keep form values on failed request" requirement:
 * the Add Line form on a Purchase Order used to clear on any failure,
 * silently discarding whatever the user had typed. A non-numeric quantity
 * is rejected server-side (not by the browser — the field has no native
 * numeric validation), giving a real, repeatable failed request to assert
 * against.
 */
test("Purchase Order Add Line form keeps its values after a failed submission", async ({ page }) => {
  await loginUi(page);
  await page.goto("/purchase-orders");

  const createForm = page.locator('form:has(button:has-text("Create"))');
  await createForm.locator("select").nth(0).selectOption({ index: 1 }); // branch
  await createForm.locator("select").nth(1).selectOption({ index: 1 }); // vendor
  await createForm.getByRole("button", { name: "Create" }).click();

  const addLineForm = page.locator('form:has(button:has-text("Add line"))');
  await expect(addLineForm).toBeVisible();

  await addLineForm.locator("select").selectOption({ index: 1 });
  const quantityInput = addLineForm.locator("input").nth(0);
  const priceInput = addLineForm.locator("input").nth(1);
  await quantityInput.fill("not-a-number");
  await priceInput.fill("12.500");
  await addLineForm.getByRole("button", { name: "Add line" }).click();

  await expect(addLineForm.getByRole("alert")).toBeVisible();
  await expect(quantityInput).toHaveValue("not-a-number");
  await expect(priceInput).toHaveValue("12.500");
});
