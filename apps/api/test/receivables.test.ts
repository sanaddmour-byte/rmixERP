import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Receivables Test Plant ${Date.now()}`, code: `RV${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C40", code: `C40RV-${Date.now()}` });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Receivables Test Prices ${Date.now()}` });
  const priceListId = priceListRes.body.id;

  await request(app)
    .post(`/api/price-lists/${priceListId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({
      productId,
      concreteUnitPriceJod: "10.000",
      deliveryUnitPriceJod: "0.000",
      taxRateBasisPoints: 0,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
});

async function createCustomer(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Receivables Test Customer ${Date.now()}-${Math.random()}`, ...overrides });
  return res.body.id as string;
}

/** Creates a real *issued* invoice for a customer. `paymentTermsDays` (applied to the customer just before issuing) controls the resulting invoice's due date, letting tests control FIFO ordering deterministically. */
async function createIssuedInvoice(customerId: string, quantityM3: string, paymentTermsDays: number): Promise<{ invoiceId: string; totalJod: string }> {
  const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
  const lineRes = await request(app)
    .post(`/api/sales-orders/${orderRes.body.id}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  const salesOrderLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);

  const deliveryRes = await request(app)
    .post("/api/delivery-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, salesOrderId: orderRes.body.id, salesOrderLineId, quantityM3, scheduledAt: "2026-01-15T08:00:00.000Z" });
  const truck = await request(app)
    .post("/api/trucks")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, plateNumber: `RVTRK-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  const driver = await request(app)
    .post("/api/drivers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, name: `Receivables Test Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ truckId: truck.body.id, driverId: driver.body.id });
  await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/deliver`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ receivedQuantityM3: quantityM3, signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });

  const invoiceRes = await request(app)
    .post(`/api/delivery-orders/${deliveryRes.body.id}/invoice`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ mode: "combined" });
  const invoiceId = invoiceRes.body.invoices[0].id as string;
  const totalJod = invoiceRes.body.invoices[0].totalJod as string;

  await request(app).put(`/api/customers/${customerId}`).set("Authorization", `Bearer ${admin}`).send({ paymentTermsDays });
  await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
  await request(app).post(`/api/invoices/${invoiceId}/issue`).set("Authorization", `Bearer ${admin}`).send();

  return { invoiceId, totalJod };
}

describe("collections — FIFO allocation", () => {
  it("applies the collection to the earlier-due invoice fully before spilling into the later one", async () => {
    const customerId = await createCustomer();
    // paymentTermsDays 1 -> earlier due date; 30 -> later due date.
    const early = await createIssuedInvoice(customerId, "2", 1); // 20 JOD
    const late = await createIssuedInvoice(customerId, "3", 30); // 30 JOD

    const res = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "cash",
        amountJod: "25.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
      });
    expect(res.status).toBe(201);
    expect(res.body.receiptNumber).toMatch(/^RCP-/);
    expect(res.body.allocations).toHaveLength(2);
    const byInvoice = new Map(res.body.allocations.map((a: { invoiceId: string; amountJod: string }) => [a.invoiceId, a.amountJod]));
    expect(byInvoice.get(early.invoiceId)).toBe("20.000");
    expect(byInvoice.get(late.invoiceId)).toBe("5.000");

    const earlyAfter = await request(app).get(`/api/invoices/${early.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(earlyAfter.body.status).toBe("paid");
    const lateAfter = await request(app).get(`/api/invoices/${late.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(lateAfter.body.status).toBe("partially_paid");
  });

  it("400s a FIFO collection that exceeds the customer's total outstanding", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "1", 5); // 10 JOD

    const res = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId, method: "cash", amountJod: "100.000", receivedAt: new Date().toISOString(), allocationMode: "fifo" });
    expect(res.status).toBe(400);
  });
});

describe("collections — manual allocation", () => {
  it("allocates exactly per the manual plan, allowing partial coverage of the collection amount", async () => {
    const customerId = await createCustomer();
    const inv = await createIssuedInvoice(customerId, "2", 10); // 20 JOD

    const res = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "bank_transfer",
        amountJod: "50.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ invoiceId: inv.invoiceId, amountJod: "12.000" }],
        reference: "TRF-REF-1",
      });
    expect(res.status).toBe(201);
    expect(res.body.receiptNumber).toMatch(/^TRF-/);
    expect(res.body.allocations).toHaveLength(1);
    expect(res.body.allocations[0].amountJod).toBe("12.000");

    const invAfter = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfter.body.status).toBe("partially_paid");
  });

  it("400s a manual allocation exceeding an invoice's outstanding balance", async () => {
    const customerId = await createCustomer();
    const inv = await createIssuedInvoice(customerId, "1", 5); // 10 JOD

    const res = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "cash",
        amountJod: "50.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ invoiceId: inv.invoiceId, amountJod: "20.000" }],
      });
    expect(res.status).toBe(400);
  });
});

describe("post-dated cheque lifecycle", () => {
  it("400s a post_dated_cheque collection missing bank details", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "1", 5);
    const res = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId, method: "post_dated_cheque", amountJod: "10.000", receivedAt: new Date().toISOString(), allocationMode: "fifo" });
    expect(res.status).toBe(400);
  });

  it("applies its allocation immediately on creation, then deposit/clear are status-only", async () => {
    const customerId = await createCustomer();
    const inv = await createIssuedInvoice(customerId, "1", 5); // 10 JOD

    const collectionRes = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "post_dated_cheque",
        amountJod: "10.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
        bankName: "Arab Bank",
        chequeNumber: "CHQ-001",
        chequeDueDate: "2026-06-01T00:00:00.000Z",
      });
    expect(collectionRes.status).toBe(201);
    expect(collectionRes.body.receiptNumber).toMatch(/^PDC-/);
    expect(collectionRes.body.postDatedCheque.status).toBe("pending");
    const pdcId = collectionRes.body.postDatedCheque.id as string;

    const invAfterCollection = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfterCollection.body.status).toBe("paid"); // applied immediately, not deferred to clearing

    const depositRes = await request(app).post(`/api/post-dated-cheques/${pdcId}/deposit`).set("Authorization", `Bearer ${admin}`).send();
    expect(depositRes.status).toBe(200);
    expect(depositRes.body.status).toBe("deposited");

    const clearRes = await request(app).post(`/api/post-dated-cheques/${pdcId}/clear`).set("Authorization", `Bearer ${admin}`).send();
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.status).toBe("cleared");

    const invAfterClear = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfterClear.body.status).toBe("paid"); // unchanged — clearing is a status confirmation only
  });

  it("bouncing a deposited cheque unwinds its allocation and reopens the invoice", async () => {
    const customerId = await createCustomer();
    const inv = await createIssuedInvoice(customerId, "1", 5); // 10 JOD

    const collectionRes = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "post_dated_cheque",
        amountJod: "10.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
        bankName: "Cairo Amman Bank",
        chequeNumber: "CHQ-002",
        chequeDueDate: "2026-06-01T00:00:00.000Z",
      });
    const pdcId = collectionRes.body.postDatedCheque.id as string;
    await request(app).post(`/api/post-dated-cheques/${pdcId}/deposit`).set("Authorization", `Bearer ${admin}`).send();

    const bounceRes = await request(app)
      .post(`/api/post-dated-cheques/${pdcId}/bounce`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Insufficient funds" });
    expect(bounceRes.status).toBe(200);
    expect(bounceRes.body.status).toBe("bounced");
    expect(bounceRes.body.bounceReason).toBe("Insufficient funds");

    const invAfterBounce = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfterBounce.body.status).toBe("issued"); // fully reopened — the bounced cheque was its only allocation

    const detail = await request(app).get(`/api/collections/${collectionRes.body.id}`).set("Authorization", `Bearer ${admin}`);
    expect(detail.body.allocations[0].voidedAt).not.toBeNull();
  });

  it("cancelling a still-pending cheque also unwinds its allocation", async () => {
    const customerId = await createCustomer();
    const inv = await createIssuedInvoice(customerId, "1", 5);

    const collectionRes = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "post_dated_cheque",
        amountJod: "10.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
        bankName: "Housing Bank",
        chequeNumber: "CHQ-003",
        chequeDueDate: "2026-06-01T00:00:00.000Z",
      });
    const pdcId = collectionRes.body.postDatedCheque.id as string;

    const cancelRes = await request(app).post(`/api/post-dated-cheques/${pdcId}/cancel`).set("Authorization", `Bearer ${admin}`).send();
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe("cancelled");

    const invAfter = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfter.body.status).toBe("issued");
  });

  it("rejects an invalid PDC transition (e.g. clearing a still-pending cheque)", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "1", 5);
    const collectionRes = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "post_dated_cheque",
        amountJod: "10.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
        bankName: "Jordan Bank",
        chequeNumber: "CHQ-004",
        chequeDueDate: "2026-06-01T00:00:00.000Z",
      });
    const pdcId = collectionRes.body.postDatedCheque.id as string;

    const res = await request(app).post(`/api/post-dated-cheques/${pdcId}/clear`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(400);
  });

  it("lists post-dated cheques filterable by status", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "1", 5);
    await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        customerId,
        branchId,
        method: "post_dated_cheque",
        amountJod: "10.000",
        receivedAt: new Date().toISOString(),
        allocationMode: "fifo",
        bankName: "Standard Chartered",
        chequeNumber: "CHQ-005",
        chequeDueDate: "2026-06-01T00:00:00.000Z",
      });

    const res = await request(app).get("/api/post-dated-cheques").query({ status: "pending", pageSize: 100 }).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { chequeNumber: string }) => p.chequeNumber === "CHQ-005")).toBe(true);
  });
});

describe("collections listing", () => {
  it("lists and gets collections", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "1", 5);
    const created = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId, method: "cash", amountJod: "10.000", receivedAt: new Date().toISOString(), allocationMode: "fifo" });

    const listRes = await request(app).get("/api/collections").query({ customerId, pageSize: 100 }).set("Authorization", `Bearer ${admin}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((c: { id: string }) => c.id === created.body.id)).toBe(true);

    const getRes = await request(app).get(`/api/collections/${created.body.id}`).set("Authorization", `Bearer ${admin}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.receiptNumber).toBe(created.body.receiptNumber);
  });
});

describe("reports", () => {
  it("customer statement shows the invoice and collection lines with a correct running balance", async () => {
    const customerId = await createCustomer();
    await createIssuedInvoice(customerId, "2", 5); // 20 JOD
    await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({ customerId, branchId, method: "cash", amountJod: "12.000", receivedAt: new Date().toISOString(), allocationMode: "fifo" });

    const res = await request(app).get("/api/reports/customer-statement").query({ customerId }).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.lines.length).toBeGreaterThanOrEqual(2);
    expect(res.body.lines.some((l: { type: string; debitJod: string }) => l.type === "invoice" && l.debitJod === "20.000")).toBe(true);
    expect(res.body.lines.some((l: { type: string; creditJod: string }) => l.type === "collection" && l.creditJod === "12.000")).toBe(true);
    expect(res.body.closingBalanceJod).toBe("8.000"); // 20 invoiced - 12 collected
  });

  it("400s a customer statement with no customerId", async () => {
    const res = await request(app).get("/api/reports/customer-statement").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("aging report buckets an overdue invoice correctly", async () => {
    const customerId = await createCustomer();
    // paymentTermsDays 0 with invoicedAt "now" means dueDate is effectively
    // now, so a query with asOf far in the future puts it deep in the 90+
    // bucket — a simple, deterministic way to exercise the overdue path.
    await createIssuedInvoice(customerId, "1", 0); // 10 JOD

    const farFuture = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app).get("/api/reports/aging").query({ asOf: farFuture }).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { customerId: string }) => i.customerId === customerId);
    expect(item).toBeTruthy();
    expect(item.days90PlusJod).toBe("10.000");
    expect(item.currentJod).toBe("0.000");
  });

  it("credit-control dashboard lists a customer over their limit with the right utilization", async () => {
    const customerId = await createCustomer({ creditPolicy: "warning", creditLimitJod: "5.000" });
    await createIssuedInvoice(customerId, "1", 5); // 10 JOD outstanding, over the 5 JOD limit

    const res = await request(app).get("/api/reports/credit-control").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { customerId: string }) => i.customerId === customerId);
    expect(item).toBeTruthy();
    expect(item.outstandingJod).toBe("10.000");
    expect(item.utilizationBasisPoints).toBe(20_000); // 10/5 = 200%
  });

  it("credit-overrides report lists an overridden delivery order with totals by user", async () => {
    const customerId = await createCustomer({ creditPolicy: "warning", creditLimitJod: "5.000" });
    // Backlog invoice pushes exposure over the limit for a later dispatch.
    await createIssuedInvoice(customerId, "1", 5); // 10 JOD, over the 5 JOD limit

    const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/lines`).set("Authorization", `Bearer ${admin}`).send({ productId, quantityM3: "1" });
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, salesOrderId: orderRes.body.id, quantityM3: "1", scheduledAt: "2026-01-15T08:00:00.000Z" });
    await request(app).put(`/api/customers/${customerId}`).set("Authorization", `Bearer ${admin}`).send({ creditPolicy: "block" });
    const truck = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `RVOVR-${Date.now()}` });
    const driver = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `Receivables Override Driver ${Date.now()}` });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truck.body.id, driverId: driver.body.id, override: { reason: "Manager approved" } });

    const res = await request(app).get("/api/reports/credit-overrides").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === deliveryRes.body.id);
    expect(item).toBeTruthy();
    expect(item.documentType).toBe("delivery_order");
    expect(item.reason).toBe("Manager approved");
    expect(res.body.totalsByUser.length).toBeGreaterThan(0);
  });
});
