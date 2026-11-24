import { test, expect } from "@playwright/test";
import { loginAsAdmin, apiLogin, authHeaders, unique } from "./helpers";

/**
 * A permission-aware work-queue card opens straight into the same
 * filtered list it counted — not the bare module — and the filter it
 * applies is read from the URL by the target page on mount, so what the
 * user lands on matches what the card showed.
 */
test("the Unassigned Loads work-queue card opens Dispatch pre-filtered to unassigned, not the bare module", async ({ page, request }) => {
  const token = await apiLogin(request);
  const headers = authHeaders(token);

  // An unassigned (no truck/driver) planned delivery, so the queue has something to count.
  const branchRes = await request.post("/api/branches", { headers, data: { name: unique("E2E Queue Plant"), code: `EQ${Date.now() % 100000}` } });
  const branch = await branchRes.json();
  const productRes = await request.post("/api/products", { headers, data: { name: "C40", code: `EQC40-${Date.now()}` } });
  const product = await productRes.json();
  // A sales-order line only resolves if some price list prices the
  // product — without one, line creation 400s and leaves zero lines.
  const priceListRes = await request.post("/api/price-lists", { headers, data: { tier: "company", name: unique("E2E Queue Prices") } });
  const priceList = await priceListRes.json();
  await request.post(`/api/price-lists/${priceList.id}/lines`, {
    headers,
    data: { productId: product.id, concreteUnitPriceJod: "25.000", deliveryUnitPriceJod: "0.000", taxRateBasisPoints: 1600, effectiveFrom: "2026-01-01T00:00:00.000Z" },
  });
  const customerRes = await request.post("/api/customers", { headers, data: { name: unique("E2E Queue Customer") } });
  const customer = await customerRes.json();
  const orderRes = await request.post("/api/sales-orders", { headers, data: { customerId: customer.id, branchId: branch.id } });
  const order = await orderRes.json();
  const lineRes = await request.post(`/api/sales-orders/${order.id}/lines`, { headers, data: { productId: product.id, quantityM3: "4" } });
  expect(lineRes.ok()).toBe(true);
  await request.post(`/api/sales-orders/${order.id}/confirm`, { headers });
  const orderDetail = await (await request.get(`/api/sales-orders/${order.id}`, { headers })).json();
  const deliveryRes = await request.post("/api/delivery-orders", {
    headers,
    data: { branchId: branch.id, salesOrderId: order.id, salesOrderLineId: orderDetail.lines[0].id, quantityM3: "4", scheduledAt: "2027-05-01T08:00:00.000Z" },
  });
  expect(deliveryRes.ok()).toBe(true);

  await loginAsAdmin(page);
  await page.goto("/");

  const queueCard = page.getByRole("link", { name: /Unassigned loads/i });
  await expect(queueCard).toBeVisible();
  await queueCard.click();

  await expect(page).toHaveURL(/\/dispatch\?unassigned=true/);
  await expect(page.getByLabel("Unassigned only")).toBeChecked();
});
