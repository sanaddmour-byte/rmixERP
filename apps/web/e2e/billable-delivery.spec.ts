import { test, expect } from "@playwright/test";
import { apiGet, apiPost, loginForToken, loginUi, type PagedResult } from "./helpers";

interface NamedRecord {
  id: string;
  name: string;
}

interface SalesOrder {
  id: string;
  status: string;
}

interface DeliveryOrder {
  id: string;
  salesOrderLineId: string | null;
}

/**
 * The structural requirement behind the Dispatch redesign: a delivery
 * created through the New Delivery dialog must carry the sales-order line
 * invoicing hard-requires, with exactly one eligible line auto-selected
 * rather than left for the user to notice is missing. Walks a delivery
 * from UI creation through dispatch/deliver/invoice against the real API
 * to prove the chain actually reaches a generated invoice.
 */
test("a delivery created via New Delivery carries its billing line through to a generated invoice", async ({ page, request }) => {
  const token = await loginForToken(request);
  const [branches, customers, products, trucks, drivers] = await Promise.all([
    apiGet<PagedResult<NamedRecord>>(request, token, "/branches?page=1&pageSize=20"),
    apiGet<PagedResult<NamedRecord>>(request, token, "/customers?page=1&pageSize=20"),
    apiGet<PagedResult<NamedRecord>>(request, token, "/products?page=1&pageSize=20"),
    apiGet<PagedResult<NamedRecord>>(request, token, "/trucks?page=1&pageSize=20"),
    apiGet<PagedResult<NamedRecord>>(request, token, "/drivers?page=1&pageSize=20"),
  ]);

  const branch = branches.items[0];
  expect(branch, "seed data must include at least one branch").toBeTruthy();

  // Find a customer/product combination with an active price-list entry —
  // the same thing a real sales order needs before Dispatch ever sees it.
  let salesOrderId: string | undefined;
  let productName: string | undefined;
  outer: for (const customer of customers.items) {
    for (const product of products.items) {
      const so = await apiPost<SalesOrder>(request, token, "/sales-orders", { customerId: customer.id, branchId: branch!.id });
      if (so.status !== 201) continue;
      const line = await apiPost<{ id: string }>(request, token, `/sales-orders/${so.body.id}/lines`, {
        productId: product.id,
        quantityM3: "50",
      });
      if (line.status === 201) {
        salesOrderId = so.body.id;
        productName = product.name as string;
        break outer;
      }
    }
  }
  expect(salesOrderId, "no customer/product combination in seed data has a priced sales-order line for this branch").toBeTruthy();

  const confirmed = await apiPost<SalesOrder>(request, token, `/sales-orders/${salesOrderId}/confirm`, {});
  expect(confirmed.status).toBe(200);

  await loginUi(page);
  await page.goto("/dispatch");
  // Scoped to main: the sidebar's own plant switcher also carries an
  // aria-label="Plant" select.
  const main = page.getByRole("main");
  await expect(main.getByLabel("Plant")).toHaveValue(branch!.id);

  await main.getByRole("button", { name: "New Delivery", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sales Order").selectOption(salesOrderId!);

  // Exactly one eligible line on this order → the dialog must preselect it
  // instead of making the user pick from a one-item menu.
  await expect(dialog.getByText(/Billing line:/)).toContainText(productName!);
  await expect(dialog.getByLabel("Sales Order Line")).toHaveCount(0);

  await dialog.getByLabel("Quantity (m³)").fill("10");
  await dialog.getByRole("button", { name: "Create" }).click();

  // Creating closes the New Delivery dialog and opens the record straight
  // into its own detail panel (a Drawer, also role="dialog").
  await expect(page.getByRole("dialog", { name: "New Delivery Order" })).toHaveCount(0);
  const detailDrawer = page.getByRole("dialog", { name: "Delivery detail" });
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer.getByText(/No billing line/)).toHaveCount(0);

  const deliveries = await apiGet<PagedResult<DeliveryOrder>>(
    request,
    token,
    `/delivery-orders?page=1&pageSize=5&salesOrderId=${salesOrderId}`,
  );
  const created = deliveries.items[0];
  expect(created, "the delivery must actually have been created").toBeTruthy();
  expect(created!.salesOrderLineId, "the web form must set the billing line, or invoicing can never succeed").toBeTruthy();

  const dispatched = await apiPost(request, token, `/delivery-orders/${created!.id}/dispatch`, {
    truckId: trucks.items[0]!.id,
    driverId: drivers.items[0]!.id,
  });
  expect(dispatched.status).toBe(200);

  const delivered = await apiPost(request, token, `/delivery-orders/${created!.id}/deliver`, {
    receivedQuantityM3: "10",
    signedByName: "E2E Test Signer",
    signatureData: "data:image/png;base64,iVBORw0KGgo=",
  });
  expect(delivered.status).toBe(200);

  await page.goto(`/dispatch?id=${created!.id}`);
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();

  const invoiced = await apiPost<{ invoices: unknown[] }>(request, token, `/delivery-orders/${created!.id}/invoice`, {
    mode: "combined",
  });
  expect(invoiced.status, "a delivery created through the Dispatch screen must be able to reach invoice generation").toBe(201);
  expect(invoiced.body.invoices.length).toBeGreaterThan(0);
});
