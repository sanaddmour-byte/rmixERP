import { test, expect } from "@playwright/test";
import { loginAsAdmin, apiLogin, authHeaders, unique } from "./helpers";

/**
 * The P0-1 golden path end to end: a delivery can be created against a
 * specific sales-order line, dispatched, signed (mobile-only — see the
 * `/api/.../deliver` call below, standing in for the driver app, which
 * the web UI itself explicitly says it doesn't do: "proof of delivery
 * is captured by the driver on mobile"), and invoiced against the
 * correct line/quantity/price. Fixtures (branch, product, price,
 * customer, sales order) are created via the API — they aren't
 * themselves under test here — but every assertion-bearing step
 * (creating the delivery, dispatching it, generating the invoice,
 * reading back its amount) is driven through the real browser UI.
 */
test("delivery created against the correct sales-order line dispatches and invoices for the right quantity/price", async ({ page, request }) => {
  const token = await apiLogin(request);
  const headers = authHeaders(token);

  const branchName = unique("E2E Plant");
  const branchRes = await request.post("/api/branches", { headers, data: { name: branchName, code: `E2E${Date.now() % 100000}` } });
  const branch = await branchRes.json();

  const productRes = await request.post("/api/products", { headers, data: { name: "C40", code: `E2EC40-${Date.now()}` } });
  const product = await productRes.json();

  const priceListRes = await request.post("/api/price-lists", { headers, data: { tier: "company", name: unique("E2E Prices") } });
  const priceList = await priceListRes.json();
  await request.post(`/api/price-lists/${priceList.id}/lines`, {
    headers,
    data: { productId: product.id, concreteUnitPriceJod: "25.000", deliveryUnitPriceJod: "0.000", taxRateBasisPoints: 1600, effectiveFrom: "2026-01-01T00:00:00.000Z" },
  });

  const customerName = unique("E2E Customer");
  const customerRes = await request.post("/api/customers", { headers, data: { name: customerName } });
  const customer = await customerRes.json();

  const orderRes = await request.post("/api/sales-orders", { headers, data: { customerId: customer.id, branchId: branch.id } });
  const order = await orderRes.json();
  await request.post(`/api/sales-orders/${order.id}/lines`, { headers, data: { productId: product.id, quantityM3: "8" } });
  await request.post(`/api/sales-orders/${order.id}/confirm`, { headers });

  // Created before the page loads: the truck/driver <select>s are
  // populated once on mount, so creating them after the page is open
  // wouldn't show up without a refetch the app has no reason to trigger.
  const truckRes = await request.post("/api/trucks", { headers, data: { branchId: branch.id, plateNumber: unique("E2E-TRK").slice(0, 20) } });
  const truck = await truckRes.json();
  const driverRes = await request.post("/api/drivers", { headers, data: { branchId: branch.id, name: unique("E2E Driver") } });
  const driver = await driverRes.json();

  await loginAsAdmin(page);
  await page.goto("/dispatch");
  await page.getByLabel("Plant").selectOption({ label: branchName });

  await page.getByRole("button", { name: "New Delivery" }).click();
  await page.getByLabel("Sales Order").selectOption({ label: customerName });
  await expect(page.getByText(/Billing line:/)).toBeVisible();
  await page.getByLabel("Quantity (m³)").fill("8");
  const scheduledInput = page.getByLabel("Scheduled at");
  await scheduledInput.fill("2027-04-01T08:00");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // The panel opens on the delivery it just created (its id lands in the URL as ?id=).
  await expect(page).toHaveURL(/[?&]id=/);
  const deliveryId = new URL(page.url()).searchParams.get("id")!;
  expect(deliveryId).toBeTruthy();

  // Scoped to the delivery-detail drawer: Dispatch's own filter bar has a
  // same-labelled "Truck" select, so an unscoped getByLabel is ambiguous.
  const detailDrawer = page.getByRole("dialog", { name: "Delivery detail" });
  await detailDrawer.getByLabel("Truck").selectOption({ label: truck.plateNumber });
  await detailDrawer.getByLabel("Driver").selectOption({ label: driver.name });
  await detailDrawer.getByRole("button", { name: "Dispatch", exact: true }).click();
  await expect(page.getByText("Awaiting delivery")).toBeVisible();

  // Proof of delivery is mobile-only (the panel says so above) — stand in for the driver app here.
  const deliverRes = await request.post(`/api/delivery-orders/${deliveryId}/deliver`, {
    headers,
    data: { receivedQuantityM3: "8", signedByName: "E2E Site Foreman", signatureData: "data:image/png;base64,AAAA" },
  });
  expect(deliverRes.ok()).toBe(true);

  await page.goto("/invoices");
  await page.getByLabel("Delivery Order").selectOption(deliveryId);
  await page.getByRole("button", { name: "Generate" }).click();

  // A generated invoice starts in draft and needs clearance submitted
  // explicitly — it doesn't clear on its own.
  await expect(page.getByText(/Invoice .* — draft/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Submit for Clearance" }).click();
  await expect(page.getByText(/Invoice .* — cleared/)).toBeVisible({ timeout: 10_000 });
  // 8 m3 * 25.000 JOD + 16% tax = 200.000 + 32.000 = 232.000
  await expect(page.getByText("232.000 JOD")).toBeVisible();

  const deliveryLink = page.getByRole("link", { name: "View delivery" });
  await expect(deliveryLink).toBeVisible();
  await expect(deliveryLink).toHaveAttribute("href", `/dispatch?id=${deliveryId}`);
});
