import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { adminToken, noPermissionsToken } from "./testAuth";

const app = createApp();
let admin: string;
let branchId: string;
let vendorId: string;
let rawMaterialId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Procurement Test Plant ${Date.now()}`, code: `PC${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const vendorRes = await request(app)
    .post("/api/vendors")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Procurement Test Vendor ${Date.now()}` });
  vendorId = vendorRes.body.id;

  const rawMaterialRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "Cement", code: `CEM-${Date.now()}`, unit: "ton" });
  rawMaterialId = rawMaterialRes.body.id;
});

async function createVendor(): Promise<string> {
  const res = await request(app)
    .post("/api/vendors")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Procurement Test Vendor ${Date.now()}-${Math.random()}` });
  return res.body.id as string;
}

/** Creates an approved PO with one line against the shared vendor/raw-material, ready for goods receipt. */
async function createApprovedPurchaseOrder(vId: string, quantity: string, unitPriceJod: string): Promise<{ poId: string; poLineId: string }> {
  const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId: vId });
  const poId = poRes.body.id as string;
  const lineRes = await request(app)
    .post(`/api/purchase-orders/${poId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ rawMaterialId, quantity, unitPriceJod });
  const poLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send();
  return { poId, poLineId };
}

/** Fully receives, bills, and approves a bill for a fresh PO — ready to be paid. */
async function createApprovedVendorBill(
  vId: string,
  quantity: string,
  unitPriceJod: string,
  dueDate: string,
): Promise<{ poId: string; poLineId: string; billId: string; totalJod: string }> {
  const { poId, poLineId } = await createApprovedPurchaseOrder(vId, quantity, unitPriceJod);
  await request(app)
    .post("/api/goods-receipts")
    .set("Authorization", `Bearer ${admin}`)
    .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: quantity }] });
  const billRes = await request(app)
    .post("/api/vendor-bills")
    .set("Authorization", `Bearer ${admin}`)
    .send({ purchaseOrderId: poId, dueDate, lines: [{ purchaseOrderLineId: poLineId, description: "Cement", quantity }] });
  const billId = billRes.body.id as string;
  const totalJod = billRes.body.totalJod as string;
  await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
  return { poId, poLineId, billId, totalJod };
}

describe("purchase requests", () => {
  it("full lifecycle: draft -> submit -> approve, with lines only addable while draft", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });
    expect(prRes.status).toBe(201);
    expect(prRes.body.requestNumber).toMatch(/^PR-/);
    const prId = prRes.body.id;

    const lineRes = await request(app)
      .post(`/api/purchase-requests/${prId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "10" });
    expect(lineRes.status).toBe(201);
    expect(lineRes.body.lines).toHaveLength(1);

    const submitRes = await request(app).post(`/api/purchase-requests/${prId}/submit`).set("Authorization", `Bearer ${admin}`).send();
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("submitted");

    const lateLineRes = await request(app)
      .post(`/api/purchase-requests/${prId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "5" });
    expect(lateLineRes.status).toBe(400);

    const approveRes = await request(app).post(`/api/purchase-requests/${prId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    const cancelRes = await request(app).post(`/api/purchase-requests/${prId}/cancel`).set("Authorization", `Bearer ${admin}`).send();
    expect(cancelRes.status).toBe(400); // approved can no longer be cancelled
  });

  it("rejects a submitted purchase request with a reason", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });
    const prId = prRes.body.id;
    await request(app).post(`/api/purchase-requests/${prId}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const rejectRes = await request(app)
      .post(`/api/purchase-requests/${prId}/reject`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Not needed this month" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");
  });

  it("cancels a draft purchase request", async () => {
    const prRes = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${admin}`).send({ branchId });
    const prId = prRes.body.id;
    const cancelRes = await request(app).post(`/api/purchase-requests/${prId}/cancel`).set("Authorization", `Bearer ${admin}`).send();
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe("cancelled");
  });

  it("404s a purchase request that doesn't exist", async () => {
    const res = await request(app).get("/api/purchase-requests/00000000-0000-0000-0000-000000000000").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(404);
  });
});

describe("purchase orders", () => {
  it("requires at least one line before it can be submitted", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const submitRes = await request(app).post(`/api/purchase-orders/${poRes.body.id}/submit`).set("Authorization", `Bearer ${admin}`).send();
    expect(submitRes.status).toBe(400);
  });

  it("full lifecycle: create -> line -> submit -> approve, with totals computed from lines", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    expect(poRes.body.poNumber).toMatch(/^PO-/);
    const poId = poRes.body.id;

    const lineRes = await request(app)
      .post(`/api/purchase-orders/${poId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "10", unitPriceJod: "5.000" });
    expect(lineRes.status).toBe(201);
    expect(lineRes.body.subtotalJod).toBe("50.000");
    expect(lineRes.body.taxJod).toBe("8.000"); // 16% of 50
    expect(lineRes.body.totalJod).toBe("58.000");

    await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();
    const approveRes = await request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");
  });

  it("rejects a submitted purchase order with a reason", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const poId = poRes.body.id;
    await request(app)
      .post(`/api/purchase-orders/${poId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "1", unitPriceJod: "1.000" });
    await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();

    const rejectRes = await request(app)
      .post(`/api/purchase-orders/${poId}/reject`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "Price too high" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");
  });

  it("404s a purchase order that doesn't exist", async () => {
    const res = await request(app).get("/api/purchase-orders/00000000-0000-0000-0000-000000000000").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(404);
  });
});

describe("goods receipts", () => {
  it("receiving against an approved PO applies stock, tracks variance, and transitions the PO to received only once", async () => {
    const { poId, poLineId } = await createApprovedPurchaseOrder(vendorId, "10", "5.000");

    const grRes = await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "6" }] });
    expect(grRes.status).toBe(201);
    expect(grRes.body.receiptNumber).toMatch(/^GRN-/);

    const poAfter = await request(app).get(`/api/purchase-orders/${poId}`).set("Authorization", `Bearer ${admin}`);
    expect(poAfter.body.status).toBe("received");
    expect(poAfter.body.lines[0].receivedQuantity).toBe("6.000");
    expect(poAfter.body.lines[0].varianceQuantity).toBe("-4.000"); // 6 received against 10 ordered

    // A second receipt against the same (already-received) PO tops up the quantity without re-transitioning.
    const gr2Res = await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "4" }] });
    expect(gr2Res.status).toBe(201);

    const poAfter2 = await request(app).get(`/api/purchase-orders/${poId}`).set("Authorization", `Bearer ${admin}`);
    expect(poAfter2.body.status).toBe("received");
    expect(poAfter2.body.lines[0].receivedQuantity).toBe("10.000");
    expect(poAfter2.body.lines[0].varianceQuantity).toBe("0.000");
  });

  it("400s a goods receipt against a draft (not yet approved) PO", async () => {
    const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
    const poId = poRes.body.id;
    const lineRes = await request(app)
      .post(`/api/purchase-orders/${poId}/lines`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ rawMaterialId, quantity: "1", unitPriceJod: "1.000" });
    const poLineId = lineRes.body.lines[0].id;

    const res = await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "1" }] });
    expect(res.status).toBe(400);
  });

  it("400s a receipt line that references another PO's line", async () => {
    const { poId: poId1 } = await createApprovedPurchaseOrder(vendorId, "5", "2.000");
    const { poLineId: otherPoLineId } = await createApprovedPurchaseOrder(vendorId, "5", "2.000");

    const res = await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId1, lines: [{ purchaseOrderLineId: otherPoLineId, quantityReceived: "1" }] });
    expect(res.status).toBe(400);
  });
});

describe("vendor bills", () => {
  it("billing against a received PO transitions it to billed, and approving posts a balanced GL entry", async () => {
    const { poId, poLineId } = await createApprovedPurchaseOrder(vendorId, "10", "5.000");
    await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "10" }] });

    const billRes = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, dueDate: "2026-08-01T00:00:00.000Z", lines: [{ purchaseOrderLineId: poLineId, description: "Cement", quantity: "10" }] });
    expect(billRes.status).toBe(201);
    expect(billRes.body.billNumber).toMatch(/^BILL-/);
    expect(billRes.body.status).toBe("draft");
    expect(billRes.body.totalJod).toBe("58.000"); // 50 net + 16% tax

    const poAfter = await request(app).get(`/api/purchase-orders/${poId}`).set("Authorization", `Bearer ${admin}`);
    expect(poAfter.body.status).toBe("billed");

    const approveRes = await request(app).post(`/api/vendor-bills/${billRes.body.id}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    const journalRes = await request(app)
      .get("/api/gl/journal-entries")
      .query({ sourceDocumentType: "vendor_bill", pageSize: 100 })
      .set("Authorization", `Bearer ${admin}`);
    const entry = journalRes.body.items.find((e: { sourceDocumentId: string }) => e.sourceDocumentId === billRes.body.id);
    expect(entry).toBeTruthy();
    const detail = await request(app).get(`/api/gl/journal-entries/${entry.id}`).set("Authorization", `Bearer ${admin}`);
    const totalDebit = detail.body.lines.reduce((s: number, l: { debitJod: string }) => s + Number(l.debitJod), 0);
    const totalCredit = detail.body.lines.reduce((s: number, l: { creditJod: string }) => s + Number(l.creditJod), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(58, 3);
  });

  it("400s a bill line that exceeds what remains unbilled on the PO line", async () => {
    const { poId, poLineId } = await createApprovedPurchaseOrder(vendorId, "10", "5.000");
    await request(app)
      .post("/api/goods-receipts")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "10" }] });

    const res = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, dueDate: "2026-08-01T00:00:00.000Z", lines: [{ purchaseOrderLineId: poLineId, description: "Cement", quantity: "11" }] });
    expect(res.status).toBe(400);
  });

  it("400s billing a PO that hasn't received any goods yet", async () => {
    const { poId, poLineId } = await createApprovedPurchaseOrder(vendorId, "10", "5.000");
    const res = await request(app)
      .post("/api/vendor-bills")
      .set("Authorization", `Bearer ${admin}`)
      .send({ purchaseOrderId: poId, dueDate: "2026-08-01T00:00:00.000Z", lines: [{ purchaseOrderLineId: poLineId, description: "Cement", quantity: "10" }] });
    expect(res.status).toBe(400);
  });

  it("400s approving a bill that isn't draft", async () => {
    const { billId } = await createApprovedVendorBill(vendorId, "5", "2.000", "2026-08-01T00:00:00.000Z");
    const res = await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(400);
  });
});

describe("payments — FIFO allocation", () => {
  it("applies the payment to the earlier-due bill fully before spilling into the later one", async () => {
    const vId = await createVendor();
    const early = await createApprovedVendorBill(vId, "2", "5.000", "2026-01-05T00:00:00.000Z"); // 10 net + 1.6 tax = 11.600
    const late = await createApprovedVendorBill(vId, "3", "5.000", "2026-02-05T00:00:00.000Z"); // 15 net + 2.4 tax = 17.400

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ vendorId: vId, branchId, method: "cash", amountJod: "20.000", paidAt: new Date().toISOString(), allocationMode: "fifo" });
    expect(res.status).toBe(201);
    expect(res.body.receiptNumber).toMatch(/^PMT-/);
    expect(res.body.allocations).toHaveLength(2);
    const byBill = new Map(res.body.allocations.map((a: { vendorBillId: string; amountJod: string }) => [a.vendorBillId, a.amountJod]));
    expect(byBill.get(early.billId)).toBe(early.totalJod);
    expect(byBill.get(late.billId)).toBe("8.400"); // 20.000 - 11.600

    const earlyAfter = await request(app).get(`/api/vendor-bills/${early.billId}`).set("Authorization", `Bearer ${admin}`);
    expect(earlyAfter.body.status).toBe("paid");
    const lateAfter = await request(app).get(`/api/vendor-bills/${late.billId}`).set("Authorization", `Bearer ${admin}`);
    expect(lateAfter.body.status).toBe("partially_paid");
    expect(lateAfter.body.allocatedJod).toBe("8.400");
  });

  it("400s a FIFO payment that exceeds the vendor's total outstanding", async () => {
    const vId = await createVendor();
    await createApprovedVendorBill(vId, "1", "5.000", "2026-01-05T00:00:00.000Z");

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ vendorId: vId, branchId, method: "cash", amountJod: "100.000", paidAt: new Date().toISOString(), allocationMode: "fifo" });
    expect(res.status).toBe(400);
  });
});

describe("payments — manual allocation, repeat partial payments", () => {
  it("allows a second partial payment against a bill that's already partially paid", async () => {
    const vId = await createVendor();
    const bill = await createApprovedVendorBill(vId, "2", "5.000", "2026-01-05T00:00:00.000Z"); // 11.600 total

    const first = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        vendorId: vId,
        branchId,
        method: "bank_transfer",
        amountJod: "5.000",
        paidAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ vendorBillId: bill.billId, amountJod: "5.000" }],
      });
    expect(first.status).toBe(201);
    const afterFirst = await request(app).get(`/api/vendor-bills/${bill.billId}`).set("Authorization", `Bearer ${admin}`);
    expect(afterFirst.body.status).toBe("partially_paid");

    const second = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        vendorId: vId,
        branchId,
        method: "bank_transfer",
        amountJod: "6.600",
        paidAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ vendorBillId: bill.billId, amountJod: "6.600" }],
      });
    expect(second.status).toBe(201);
    const afterSecond = await request(app).get(`/api/vendor-bills/${bill.billId}`).set("Authorization", `Bearer ${admin}`);
    expect(afterSecond.body.status).toBe("paid");
    expect(afterSecond.body.allocatedJod).toBe("11.600");
  });

  it("400s a manual allocation exceeding a bill's outstanding balance", async () => {
    const vId = await createVendor();
    const bill = await createApprovedVendorBill(vId, "1", "5.000", "2026-01-05T00:00:00.000Z");

    const res = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        vendorId: vId,
        branchId,
        method: "cash",
        amountJod: "50.000",
        paidAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ vendorBillId: bill.billId, amountJod: "20.000" }],
      });
    expect(res.status).toBe(400);
  });

  it("posts a balanced GL entry (Dr Accounts Payable / Cr Cash) for the payment", async () => {
    const vId = await createVendor();
    const bill = await createApprovedVendorBill(vId, "1", "5.000", "2026-01-05T00:00:00.000Z"); // 5.800

    const payRes = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        vendorId: vId,
        branchId,
        method: "cash",
        amountJod: "5.800",
        paidAt: new Date().toISOString(),
        allocationMode: "manual",
        allocations: [{ vendorBillId: bill.billId, amountJod: "5.800" }],
      });
    expect(payRes.status).toBe(201);

    const journalRes = await request(app)
      .get("/api/gl/journal-entries")
      .query({ sourceDocumentType: "payment", pageSize: 100 })
      .set("Authorization", `Bearer ${admin}`);
    const entry = journalRes.body.items.find((e: { sourceDocumentId: string }) => e.sourceDocumentId === payRes.body.id);
    expect(entry).toBeTruthy();
    const detail = await request(app).get(`/api/gl/journal-entries/${entry.id}`).set("Authorization", `Bearer ${admin}`);
    expect(detail.body.lines).toHaveLength(2);
    const totalDebit = detail.body.lines.reduce((s: number, l: { debitJod: string }) => s + Number(l.debitJod), 0);
    const totalCredit = detail.body.lines.reduce((s: number, l: { creditJod: string }) => s + Number(l.creditJod), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(5.8, 3);
  });
});

describe("chart of accounts", () => {
  it("creates a custom account and rejects a duplicate code", async () => {
    const code = `9${Date.now() % 100000}`;
    const res = await request(app).post("/api/gl/accounts").set("Authorization", `Bearer ${admin}`).send({ code, name: "Test Equity", type: "equity" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("equity");

    const dup = await request(app).post("/api/gl/accounts").set("Authorization", `Bearer ${admin}`).send({ code, name: "Duplicate", type: "equity" });
    expect(dup.status).toBe(400);
  });

  it("updates an account's name", async () => {
    const code = `9${Date.now() % 100000}-b`;
    const created = await request(app).post("/api/gl/accounts").set("Authorization", `Bearer ${admin}`).send({ code, name: "Original Name", type: "expense" });
    const updated = await request(app).put(`/api/gl/accounts/${created.body.id}`).set("Authorization", `Bearer ${admin}`).send({ name: "Renamed" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Renamed");
  });

  it("404s updating an account that doesn't exist", async () => {
    const res = await request(app)
      .put("/api/gl/accounts/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(404);
  });

  it("creates and lists cost centers", async () => {
    const code = `CC${Date.now() % 100000}`;
    const created = await request(app).post("/api/gl/cost-centers").set("Authorization", `Bearer ${admin}`).send({ code, name: "Plant Overhead" });
    expect(created.status).toBe(201);

    const listRes = await request(app).get("/api/gl/cost-centers").query({ pageSize: 100 }).set("Authorization", `Bearer ${admin}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
  });
});

describe("gl reports", () => {
  it("trial balance always sums to zero (total debits equal total credits)", async () => {
    const vId = await createVendor();
    await createApprovedVendorBill(vId, "4", "3.000", "2026-01-05T00:00:00.000Z");

    const res = await request(app).get("/api/gl/reports/trial-balance").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.totalDebitJod).toBe(res.body.totalCreditJod);
  });

  it("balance sheet balances: assets equal liabilities plus equity", async () => {
    const vId = await createVendor();
    await createApprovedVendorBill(vId, "2", "10.000", "2026-01-05T00:00:00.000Z");

    const res = await request(app).get("/api/gl/reports/balance-sheet").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const assets = Number(res.body.totalAssetsJod);
    const liabilities = Number(res.body.totalLiabilitiesJod);
    const equity = Number(res.body.totalEquityJod);
    expect(assets).toBeCloseTo(liabilities + equity, 3);
  });

  it("400s a profit-and-loss report with no from/to", async () => {
    const res = await request(app).get("/api/gl/reports/profit-and-loss").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("profit-and-loss computes net income as revenue minus expenses over the window", async () => {
    const res = await request(app)
      .get("/api/gl/reports/profit-and-loss")
      .query({ from: "2000-01-01T00:00:00.000Z", to: "2099-01-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const netIncome = Number(res.body.netIncomeJod);
    const revenue = Number(res.body.totalRevenueJod);
    const expenses = Number(res.body.totalExpensesJod);
    expect(netIncome).toBeCloseTo(revenue - expenses, 3);
  });

  it("400s a cash-flow report with no from/to", async () => {
    const res = await request(app).get("/api/gl/reports/cash-flow").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(400);
  });

  it("cash-flow tracks a running balance for cash-account movements and nets out a payment against its bill's inflow-free posting", async () => {
    const vId = await createVendor();
    const bill = await createApprovedVendorBill(vId, "1", "5.000", "2026-01-05T00:00:00.000Z"); // 5.800
    // A millisecond-precise paidAt, queried with from == to == that same instant, isolates this
    // payment's own journal line from every other test's cash postings without needing DB cleanup.
    const paidAt = new Date().toISOString();
    await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ vendorId: vId, branchId, method: "cash", amountJod: bill.totalJod, paidAt, allocationMode: "fifo" });

    const res = await request(app).get("/api/gl/reports/cash-flow").query({ from: paidAt, to: paidAt }).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.netChangeJod).toBe(`-${bill.totalJod}`); // cash account was credited (paid out)
  });
});

describe("permissions", () => {
  it("403s creating a purchase request without permission", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app).post("/api/purchase-requests").set("Authorization", `Bearer ${noPerms}`).send({ branchId });
    expect(res.status).toBe(403);
  });
});
