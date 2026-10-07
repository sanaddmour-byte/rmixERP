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
    .send({ name: `GL Test Plant ${Date.now()}`, code: `GL${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const vendorRes = await request(app)
    .post("/api/vendors")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `GL Test Vendor ${Date.now()}` });
  vendorId = vendorRes.body.id;

  const rawMaterialRes = await request(app)
    .post("/api/raw-materials")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "GL Test Cement", code: `GLCEM-${Date.now()}`, unit: "ton" });
  rawMaterialId = rawMaterialRes.body.id;
});

/** Fully receives, bills, but leaves the bill unapproved — so a test can approve it itself under whatever period state it wants to exercise. */
async function createUnapprovedVendorBill(dueDate: string): Promise<{ billId: string }> {
  const poRes = await request(app).post("/api/purchase-orders").set("Authorization", `Bearer ${admin}`).send({ branchId, vendorId });
  const poId = poRes.body.id as string;
  const lineRes = await request(app)
    .post(`/api/purchase-orders/${poId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ rawMaterialId, quantity: "1", unitPriceJod: "5.000" });
  const poLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/purchase-orders/${poId}/submit`).set("Authorization", `Bearer ${admin}`).send();
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set("Authorization", `Bearer ${admin}`).send();
  await request(app)
    .post("/api/goods-receipts")
    .set("Authorization", `Bearer ${admin}`)
    .send({ purchaseOrderId: poId, lines: [{ purchaseOrderLineId: poLineId, quantityReceived: "1" }] });
  const billRes = await request(app)
    .post("/api/vendor-bills")
    .set("Authorization", `Bearer ${admin}`)
    .send({ purchaseOrderId: poId, dueDate, lines: [{ purchaseOrderLineId: poLineId, description: "GL Test Cement", quantity: "1" }] });
  return { billId: billRes.body.id as string };
}

describe("accounting period control", () => {
  it("a year-month with no row is open; close/reopen is idempotent-safe and auditable", async () => {
    const yearMonth = "2031-03";

    // Best-effort: guarantees this test leaves `yearMonth` open for the next
    // run against the same database even if an assertion throws mid-test.
    try {
      const closeRes = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.status).toBe("closed");
      expect(closeRes.body.closedAt).toBeTruthy();

      const closeAgainRes = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
      expect(closeAgainRes.status).toBe(400);

      const reopenNoReasonRes = await request(app).post("/api/gl/accounting-periods/reopen").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
      expect(reopenNoReasonRes.status).toBe(400);

      const reopenRes = await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "correcting a misposted vendor bill" });
      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.status).toBe("open");
      expect(reopenRes.body.reopenReason).toBe("correcting a misposted vendor bill");

      const reopenNotClosedRes = await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "should fail — not closed" });
      expect(reopenNotClosedRes.status).toBe(400);

      const listRes = await request(app).get("/api/gl/accounting-periods").set("Authorization", `Bearer ${admin}`);
      expect(listRes.status).toBe(200);
      const entry = (listRes.body.items as Array<{ yearMonth: string; status: string }>).find((p) => p.yearMonth === yearMonth);
      expect(entry?.status).toBe("open");
    } finally {
      await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "test cleanup (no-op if already open)" });
    }
  });

  it("rejects close/reopen without the glJournal:approve permission", async () => {
    const noPerms = await noPermissionsToken();
    const res = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${noPerms}`).send({ yearMonth: "2031-04" });
    expect(res.status).toBe(403);
  });

  it("rejects a vendor-bill approval posting into a closed current period, without leaving a partial payment/allocation side effect", async () => {
    const now = new Date();
    const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const { billId } = await createUnapprovedVendorBill("2099-01-01T00:00:00.000Z");

    const closeRes = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
    expect(closeRes.status).toBe(200);

    try {
      const approveRes = await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
      expect(approveRes.status).toBe(400);

      // The bill must still be exactly as it was before the rejected approve attempt.
      const billRes = await request(app).get(`/api/vendor-bills/${billId}`).set("Authorization", `Bearer ${admin}`);
      expect(billRes.body.status).not.toBe("approved");
    } finally {
      await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "test cleanup" });
    }

    const approveAfterReopenRes = await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveAfterReopenRes.status).toBe(200);
  });

  it("rejects a payment dated inside a closed period, leaving no payment row or bill-status change behind", async () => {
    const yearMonth = "2030-06";
    const { billId } = await createUnapprovedVendorBill("2030-07-01T00:00:00.000Z");
    const approveRes = await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveRes.status).toBe(200);
    const billTotalJod = approveRes.body.totalJod as string;

    const closeRes = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
    expect(closeRes.status).toBe(200);

    try {
      const payRes = await request(app)
        .post("/api/payments")
        .set("Authorization", `Bearer ${admin}`)
        .send({ vendorId, branchId, method: "bank_transfer", amountJod: billTotalJod, paidAt: "2030-06-15T00:00:00.000Z", allocationMode: "fifo" });
      expect(payRes.status).toBe(400);

      const billAfterRes = await request(app).get(`/api/vendor-bills/${billId}`).set("Authorization", `Bearer ${admin}`);
      expect(billAfterRes.body.status).toBe("approved"); // unchanged — not partially_paid

      const paymentsListRes = await request(app).get("/api/payments").set("Authorization", `Bearer ${admin}`).query({ vendorId });
      expect((paymentsListRes.body.items as unknown[]).length).toBe(0);
    } finally {
      await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "test cleanup" });
    }

    // Dated outside the closed period, the same payment succeeds.
    const payOutsideRes = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${admin}`)
      .send({ vendorId, branchId, method: "bank_transfer", amountJod: billTotalJod, paidAt: "2030-07-15T00:00:00.000Z", allocationMode: "fifo" });
    expect(payOutsideRes.status).toBe(201);
  });
});

describe("journal entry reversal", () => {
  async function journalEntryForVendorBill(billId: string): Promise<{ id: string; lines: Array<{ debitJod: string; creditJod: string; accountId: string }> }> {
    const listRes = await request(app)
      .get("/api/gl/journal-entries")
      .set("Authorization", `Bearer ${admin}`)
      .query({ sourceDocumentType: "vendor_bill", pageSize: 100 });
    const entry = (listRes.body.items as Array<{ id: string; sourceDocumentId: string }>).find((e) => e.sourceDocumentId === billId);
    if (!entry) throw new Error("posted journal entry for vendor bill not found");
    const detailRes = await request(app).get(`/api/gl/journal-entries/${entry.id}`).set("Authorization", `Bearer ${admin}`);
    return detailRes.body;
  }

  it("posts an equal-and-opposite entry, and refuses to reverse the same entry twice", async () => {
    const { billId } = await createUnapprovedVendorBill("2099-02-01T00:00:00.000Z");
    const approveRes = await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    expect(approveRes.status).toBe(200);

    const original = await journalEntryForVendorBill(billId);
    expect(original.lines.length).toBeGreaterThan(0);

    const reverseRes = await request(app)
      .post(`/api/gl/journal-entries/${original.id}/reverse`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "vendor bill was entered against the wrong PO" });
    expect(reverseRes.status).toBe(201);
    expect(reverseRes.body.sourceDocumentType).toBe("journal_entry_reversal");
    expect(reverseRes.body.sourceDocumentId).toBe(original.id);

    const reversedByAccount = new Map(reverseRes.body.lines.map((l: { accountId: string; debitJod: string; creditJod: string }) => [l.accountId, l]));
    for (const line of original.lines) {
      const mirror = reversedByAccount.get(line.accountId) as { debitJod: string; creditJod: string } | undefined;
      expect(mirror).toBeTruthy();
      expect(mirror!.debitJod).toBe(line.creditJod);
      expect(mirror!.creditJod).toBe(line.debitJod);
    }

    const secondReverseRes = await request(app)
      .post(`/api/gl/journal-entries/${original.id}/reverse`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "should be refused — already reversed" });
    expect(secondReverseRes.status).toBe(400);
  });

  it("refuses to post a reversal dated inside a closed period", async () => {
    const { billId } = await createUnapprovedVendorBill("2099-03-01T00:00:00.000Z");
    await request(app).post(`/api/vendor-bills/${billId}/approve`).set("Authorization", `Bearer ${admin}`).send();
    const original = await journalEntryForVendorBill(billId);

    const yearMonth = "2030-08";
    const closeRes = await request(app).post("/api/gl/accounting-periods/close").set("Authorization", `Bearer ${admin}`).send({ yearMonth });
    expect(closeRes.status).toBe(200);

    try {
      const reverseRes = await request(app)
        .post(`/api/gl/journal-entries/${original.id}/reverse`)
        .set("Authorization", `Bearer ${admin}`)
        .send({ reason: "should be refused — closed period", reversalDate: "2030-08-15T00:00:00.000Z" });
      expect(reverseRes.status).toBe(400);
    } finally {
      await request(app)
        .post("/api/gl/accounting-periods/reopen")
        .set("Authorization", `Bearer ${admin}`)
        .send({ yearMonth, reason: "test cleanup" });
    }

    const reverseAfterReopenRes = await request(app)
      .post(`/api/gl/journal-entries/${original.id}/reverse`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "retry after reopen", reversalDate: "2030-08-15T00:00:00.000Z" });
    expect(reverseAfterReopenRes.status).toBe(201);
  });

  it("returns 404 for an unknown journal entry id", async () => {
    const res = await request(app)
      .post("/api/gl/journal-entries/00000000-0000-4000-8000-000000000000/reverse")
      .set("Authorization", `Bearer ${admin}`)
      .send({ reason: "no such entry" });
    expect(res.status).toBe(404);
  });
});
