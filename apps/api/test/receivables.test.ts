import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { addFils, filsToJodString, jodStringToFils } from "@rmixerp/core";
import { journalEntry, journalLine, withTenant } from "@rmixerp/db";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { config } from "../src/config";
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

/** Finds the one journal entry traceable back to a given source document, with each line's account resolved to its well-known code (there's no GET /gl/accounts, so this borrows the trial balance's own accountId->accountCode mapping). */
interface JournalEntryWithResolvedLines {
  id: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  lines: { accountCode: string | undefined; debitJod: string; creditJod: string }[];
}

async function findJournalEntry(sourceDocumentType: string, sourceDocumentId: string): Promise<JournalEntryWithResolvedLines | null> {
  const listRes = await request(app).get("/api/gl/journal-entries").query({ sourceDocumentType, pageSize: 100 }).set("Authorization", `Bearer ${admin}`);
  const match = listRes.body.items.find((e: { sourceDocumentId: string }) => e.sourceDocumentId === sourceDocumentId);
  if (!match) return null;
  const detailRes = await request(app).get(`/api/gl/journal-entries/${match.id}`).set("Authorization", `Bearer ${admin}`);
  const trialBalanceRes = await request(app).get("/api/gl/reports/trial-balance").set("Authorization", `Bearer ${admin}`);
  const codeByAccountId = new Map<string, string>(
    trialBalanceRes.body.rows.map((r: { accountId: string; accountCode: string }) => [r.accountId, r.accountCode]),
  );
  const lines = (detailRes.body.lines as { accountId: string; debitJod: string; creditJod: string }[]).map((l) => ({
    accountCode: codeByAccountId.get(l.accountId),
    debitJod: l.debitJod,
    creditJod: l.creditJod,
  }));
  return { id: detailRes.body.id, sourceDocumentType, sourceDocumentId, lines };
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

    const receiptEntry = await findJournalEntry("collection", collectionRes.body.id);
    expect(receiptEntry).toBeTruthy();
    expect(receiptEntry!.lines.find((l) => l.accountCode === "1250")?.debitJod).toBe("10.000"); // PDC in Hand, not Cash — not real money yet
    expect(receiptEntry!.lines.find((l) => l.accountCode === "1200")?.creditJod).toBe("10.000"); // Accounts Receivable

    const depositRes = await request(app).post(`/api/post-dated-cheques/${pdcId}/deposit`).set("Authorization", `Bearer ${admin}`).send();
    expect(depositRes.status).toBe(200);
    expect(depositRes.body.status).toBe("deposited");

    const clearRes = await request(app).post(`/api/post-dated-cheques/${pdcId}/clear`).set("Authorization", `Bearer ${admin}`).send();
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.status).toBe("cleared");

    const invAfterClear = await request(app).get(`/api/invoices/${inv.invoiceId}`).set("Authorization", `Bearer ${admin}`);
    expect(invAfterClear.body.status).toBe("paid"); // unchanged — clearing is a status confirmation only

    const clearEntry = await findJournalEntry("post_dated_cheque_clear", pdcId);
    expect(clearEntry).toBeTruthy();
    expect(clearEntry!.lines.find((l) => l.accountCode === "1000")?.debitJod).toBe("10.000"); // now real Cash
    expect(clearEntry!.lines.find((l) => l.accountCode === "1250")?.creditJod).toBe("10.000"); // reclassified out of PDC in Hand
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

    // The GL mirrors the application-layer allocation unwind: the cheque was never real money, so reverse the original receipt entry.
    const reversalEntry = await findJournalEntry("post_dated_cheque_reversal", pdcId);
    expect(reversalEntry).toBeTruthy();
    expect(reversalEntry!.lines.find((l) => l.accountCode === "1200")?.debitJod).toBe("10.000"); // Accounts Receivable reopened
    expect(reversalEntry!.lines.find((l) => l.accountCode === "1250")?.creditJod).toBe("10.000"); // out of PDC in Hand

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
    const lineRes = await request(app).post(`/api/sales-orders/${orderRes.body.id}/lines`).set("Authorization", `Bearer ${admin}`).send({ productId, quantityM3: "1" });
    await request(app).post(`/api/sales-orders/${orderRes.body.id}/confirm`).set("Authorization", `Bearer ${admin}`);
    const deliveryRes = await request(app)
      .post("/api/delivery-orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        branchId,
        salesOrderId: orderRes.body.id,
        salesOrderLineId: lineRes.body.lines[0].id,
        quantityM3: "1",
        scheduledAt: "2026-01-15T08:00:00.000Z",
      });
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

describe("GL postings + statement/aging reconciliation (invoice -> credit note -> receipt)", () => {
  /** Creates a confirmed sales order + delivered delivery order billed against a priced line, for a customer/product/price-list this test owns end to end. */
  async function setupDeliveredOrder(customerId: string, branchId: string, productId: string, quantityM3: string) {
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
      .send({ branchId, salesOrderId: orderRes.body.id, salesOrderLineId, quantityM3, scheduledAt: "2026-02-01T08:00:00.000Z" });
    const truck = await request(app)
      .post("/api/trucks")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, plateNumber: `GLTRK-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
    const driver = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, name: `GL Test Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/dispatch`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ truckId: truck.body.id, driverId: driver.body.id });
    await request(app)
      .post(`/api/delivery-orders/${deliveryRes.body.id}/deliver`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ receivedQuantityM3: quantityM3, signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });
    return deliveryRes.body.id as string;
  }

  async function arBalanceJod(): Promise<string> {
    const res = await request(app).get("/api/gl/reports/trial-balance").set("Authorization", `Bearer ${admin}`);
    const row = res.body.rows.find((r: { accountCode: string }) => r.accountCode === "1200");
    return row.balanceJod;
  }

  /** `vitest.config.ts` sets `fileParallelism: false` — test files run sequentially against the shared test DB, so a before/after delta on the company-wide AR balance is safe (nothing else posts to it concurrently). */
  function expectArDelta(beforeJod: string, deltaJod: string) {
    return filsToJodString(addFils(jodStringToFils(beforeJod), jodStringToFils(deltaJod)));
  }

  it("a cleared credit note and a receipt both move the statement balance and the AR control account the same way", async () => {
    const customerId = await createCustomer();
    const productRes = await request(app).post("/api/products").set("Authorization", `Bearer ${admin}`).send({ name: "C40GL", code: `C40GL-${Date.now()}` });
    const glProductId = productRes.body.id as string;
    const priceListRes = await request(app).post("/api/price-lists").set("Authorization", `Bearer ${admin}`).send({ tier: "company", name: `GL Test Prices ${Date.now()}` });
    await request(app)
      .post(`/api/price-lists/${priceListRes.body.id}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ productId: glProductId, concreteUnitPriceJod: "20.000", deliveryUnitPriceJod: "5.000", taxRateBasisPoints: 1600, effectiveFrom: "2026-01-01T00:00:00.000Z" });

    const deliveryOrderId = await setupDeliveredOrder(customerId, branchId, glProductId, "10");

    const arBefore = await arBalanceJod();

    // Invoice: 200 concrete net + 50 delivery net = 250 subtotal, 16% of the taxable (concrete-only) 200 = 32 tax, 282 total.
    const invoiceRes = await request(app).post(`/api/delivery-orders/${deliveryOrderId}/invoice`).set("Authorization", `Bearer ${admin}`).send({ mode: "combined" });
    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.invoices[0].id as string;
    expect(invoiceRes.body.invoices[0].totalJod).toBe("282.000");

    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    const issueRes = await request(app).post(`/api/invoices/${invoiceId}/issue`).set("Authorization", `Bearer ${admin}`).send();
    expect(issueRes.status).toBe(200);

    const statementAfterInvoice = await request(app).get("/api/reports/customer-statement").query({ customerId }).set("Authorization", `Bearer ${admin}`);
    expect(statementAfterInvoice.body.closingBalanceJod).toBe("282.000");
    expect(await arBalanceJod()).toBe(expectArDelta(arBefore, "282.000"));

    // Cleared credit note: 20.000, no tax — used to leave the statement unchanged (the bug). Should reduce it to 262.000.
    const creditNoteRes = await request(app)
      .post(`/api/invoices/${invoiceId}/credit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "20.000", reason: "Goodwill adjustment" });
    expect(creditNoteRes.status).toBe(201);
    const creditNoteId = creditNoteRes.body.creditNotes[0].id as string;
    const creditNoteClearRes = await request(app).post(`/api/credit-notes/${creditNoteId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(creditNoteClearRes.status).toBe(200);
    expect(creditNoteClearRes.body.clearanceStatus).toBe("cleared");

    const statementAfterCreditNote = await request(app).get("/api/reports/customer-statement").query({ customerId }).set("Authorization", `Bearer ${admin}`);
    expect(statementAfterCreditNote.body.closingBalanceJod).toBe("262.000");
    const creditNoteLine = statementAfterCreditNote.body.lines.find((l: { type: string }) => l.type === "credit_note");
    expect(creditNoteLine).toBeTruthy();
    expect(creditNoteLine.creditJod).toBe("20.000");
    expect(await arBalanceJod()).toBe(expectArDelta(arBefore, "262.000"));

    // Receipt: 100.000 cash, FIFO-allocated. Should reduce the statement to exactly 162.000 — the worked example this whole fix is for.
    const collectionRes = await request(app)
      .post("/api/collections")
      .set("Authorization", `Bearer ${admin}`)
      .send({ branchId, customerId, method: "cash", amountJod: "100.000", receivedAt: "2026-02-05T00:00:00.000Z", allocationMode: "fifo" });
    expect(collectionRes.status).toBe(201);

    const finalStatement = await request(app).get("/api/reports/customer-statement").query({ customerId }).set("Authorization", `Bearer ${admin}`);
    expect(finalStatement.body.closingBalanceJod).toBe("162.000");
    expect(await arBalanceJod()).toBe(expectArDelta(arBefore, "162.000"));

    // The GL entries themselves are balanced and traceable back to their source documents.
    const journalRes = await request(app).get("/api/gl/journal-entries").set("Authorization", `Bearer ${admin}`);
    const invoiceEntry = journalRes.body.items.find((e: { sourceDocumentType: string; sourceDocumentId: string }) => e.sourceDocumentType === "invoice" && e.sourceDocumentId === invoiceId);
    expect(invoiceEntry).toBeTruthy();
  });

  it("a legacy aging snapshot respects each invoice's effective date — an invoice issued after asOf is excluded", async () => {
    const customerId = await createCustomer();
    const { invoiceId } = await createIssuedInvoice(customerId, "2", 30);
    void invoiceId;

    const beforeIssued = await request(app)
      .get("/api/reports/aging")
      .query({ asOf: "2020-01-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${admin}`);
    const itemBefore = beforeIssued.body.items.find((i: { customerId: string }) => i.customerId === customerId);
    expect(itemBefore).toBeUndefined();

    const afterIssued = await request(app).get("/api/reports/aging").set("Authorization", `Bearer ${admin}`);
    const itemAfter = afterIssued.body.items.find((i: { customerId: string }) => i.customerId === customerId);
    expect(itemAfter).toBeTruthy();
  });
});

describe("POST /receivables/reconcile-gl-postings (backfill for pre-existing records)", () => {
  /** Deletes an "invoice" journal entry and its lines directly, simulating a document issued before GL posting existed for it. */
  async function deleteInvoiceJournalEntry(invoiceId: string): Promise<void> {
    await withTenant(db, config.companyId, async (tx) => {
      const [entry] = await tx.select().from(journalEntry).where(eq(journalEntry.sourceDocumentId, invoiceId));
      if (!entry) throw new Error("expected a journal entry to delete");
      await tx.delete(journalLine).where(eq(journalLine.journalEntryId, entry.id));
      await tx.delete(journalEntry).where(eq(journalEntry.id, entry.id));
    });
  }

  it("dry-run reports a missing invoice posting without writing one; apply then posts it; a second apply is a no-op", async () => {
    const customerId = await createCustomer();
    const { invoiceId } = await createIssuedInvoice(customerId, "2", 30); // posts its own journal entry live

    let entry = await findJournalEntry("invoice", invoiceId);
    expect(entry).toBeTruthy();
    await deleteInvoiceJournalEntry(invoiceId); // simulate: created before GL wiring existed
    entry = await findJournalEntry("invoice", invoiceId);
    expect(entry).toBeNull();

    const dryRunRes = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${admin}`).send({ dryRun: true });
    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.dryRun).toBe(true);
    const dryRunMatch = dryRunRes.body.posted.find((p: { sourceDocumentId: string }) => p.sourceDocumentId === invoiceId);
    expect(dryRunMatch).toBeTruthy();
    expect(dryRunMatch.sourceDocumentType).toBe("invoice");

    // A true dry run never writes.
    entry = await findJournalEntry("invoice", invoiceId);
    expect(entry).toBeNull();

    const applyRes = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${admin}`).send({ dryRun: false });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.dryRun).toBe(false);
    const applyMatch = applyRes.body.posted.find((p: { sourceDocumentId: string }) => p.sourceDocumentId === invoiceId);
    expect(applyMatch).toBeTruthy();

    entry = await findJournalEntry("invoice", invoiceId);
    expect(entry).toBeTruthy();
    const arLine = entry!.lines.find((l) => l.accountCode === "1200");
    const revenueLine = entry!.lines.find((l) => l.accountCode === "4000");
    expect(arLine?.debitJod).toBe("20.000");
    expect(revenueLine?.creditJod).toBe("20.000");

    // A second apply must not double-post — postJournalEntry's own retry-safety.
    const secondApplyRes = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${admin}`).send({ dryRun: false });
    const secondApplyMatch = secondApplyRes.body.posted.find((p: { sourceDocumentId: string }) => p.sourceDocumentId === invoiceId);
    expect(secondApplyMatch).toBeUndefined();
    expect(secondApplyRes.body.alreadyPosted).toBeGreaterThan(0);
  });

  it("is idempotent across repeated apply calls and reports already-posted documents separately", async () => {
    const customerId = await createCustomer();
    const { invoiceId } = await createIssuedInvoice(customerId, "2", 30);
    await deleteInvoiceJournalEntry(invoiceId);

    const firstApply = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${admin}`).send({ dryRun: false });
    const firstMatch = firstApply.body.posted.find((p: { sourceDocumentId: string }) => p.sourceDocumentId === invoiceId);
    expect(firstMatch).toBeTruthy();

    const entryAfterFirst = await findJournalEntry("invoice", invoiceId);
    expect(entryAfterFirst).toBeTruthy();

    // Re-running apply must not double-post: the document now shows up as alreadyPosted, not posted again.
    const secondApply = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${admin}`).send({ dryRun: false });
    const secondMatch = secondApply.body.posted.find((p: { sourceDocumentId: string }) => p.sourceDocumentId === invoiceId);
    expect(secondMatch).toBeUndefined();
    expect(secondApply.body.alreadyPosted).toBeGreaterThan(0);

    const entryAfterSecond = await findJournalEntry("invoice", invoiceId);
    expect(entryAfterSecond!.id).toBe(entryAfterFirst!.id);
  });

  it("403s without glJournal:approve", async () => {
    const { noPermissionsToken } = await import("./testAuth");
    const token = await noPermissionsToken();
    const res = await request(app).post("/api/receivables/reconcile-gl-postings").set("Authorization", `Bearer ${token}`).send({ dryRun: true });
    expect(res.status).toBe(403);
  });
});
