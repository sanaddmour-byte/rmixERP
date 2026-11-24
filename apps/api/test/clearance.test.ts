import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import type { ClearanceOutcome, ClearanceProvider, ClearanceSubmissionInput } from "@rmixerp/core";
import { invoice, withTenant } from "@rmixerp/db";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { config } from "../src/config";
import { correctAndResubmitCreditNote, correctAndResubmitInvoice, submitCreditNoteForClearance, submitInvoiceForClearance } from "../src/clearance/service";
import { adminToken } from "./testAuth";

/** Always fails with a transport error — exercises the retry/backoff path without a real network call. */
class AlwaysTransportErrorProvider implements ClearanceProvider {
  async submit(_input: ClearanceSubmissionInput): Promise<ClearanceOutcome> {
    await Promise.resolve();
    return { kind: "transport_error", reason: "simulated network failure" };
  }
}

/** Always rejects on business grounds — exercises the correction/resubmission path without a real network call. */
class AlwaysRejectedProvider implements ClearanceProvider {
  constructor(private readonly reason = "simulated business rejection") {}
  async submit(_input: ClearanceSubmissionInput): Promise<ClearanceOutcome> {
    await Promise.resolve();
    return { kind: "rejected", reason: this.reason, responsePayload: { mock: true, reason: this.reason } };
  }
}

const app = createApp();
let admin: string;
let branchId: string;
let productId: string;

beforeAll(async () => {
  admin = await adminToken();

  const branchRes = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Clearance Test Plant ${Date.now()}`, code: `CL${Date.now() % 100000}` });
  branchId = branchRes.body.id;

  const productRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: "C40", code: `C40CL-${Date.now()}` });
  productId = productRes.body.id;

  const priceListRes = await request(app)
    .post("/api/price-lists")
    .set("Authorization", `Bearer ${admin}`)
    .send({ tier: "company", name: `Clearance Test Prices ${Date.now()}` });
  const priceListId = priceListRes.body.id;

  await request(app)
    .post(`/api/price-lists/${priceListId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({
      productId,
      concreteUnitPriceJod: "20.000",
      deliveryUnitPriceJod: "5.000",
      taxRateBasisPoints: 1600,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
});

/** Creates a customer, confirmed sales order + line, dispatched + delivered delivery order, then a draft invoice. Returns the invoice id. */
async function createDraftInvoice(quantityM3: string): Promise<string> {
  const customerRes = await request(app)
    .post("/api/customers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ name: `Clearance Test Customer ${Date.now()}-${Math.random()}` });
  const customerId = customerRes.body.id as string;

  const orderRes = await request(app).post("/api/sales-orders").set("Authorization", `Bearer ${admin}`).send({ customerId, branchId });
  const salesOrderId = orderRes.body.id as string;
  const lineRes = await request(app)
    .post(`/api/sales-orders/${salesOrderId}/lines`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ productId, quantityM3 });
  const salesOrderLineId = lineRes.body.lines[0].id as string;
  await request(app).post(`/api/sales-orders/${salesOrderId}/confirm`).set("Authorization", `Bearer ${admin}`);

  const deliveryRes = await request(app)
    .post("/api/delivery-orders")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, salesOrderId, salesOrderLineId, quantityM3, scheduledAt: "2026-01-15T08:00:00.000Z" });
  const deliveryOrderId = deliveryRes.body.id as string;

  const truck = await request(app)
    .post("/api/trucks")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, plateNumber: `CLTRK-${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  const driver = await request(app)
    .post("/api/drivers")
    .set("Authorization", `Bearer ${admin}`)
    .send({ branchId, name: `Clearance Test Driver ${Date.now()}-${Math.floor(Math.random() * 10000)}` });
  await request(app)
    .post(`/api/delivery-orders/${deliveryOrderId}/dispatch`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ truckId: truck.body.id, driverId: driver.body.id });
  await request(app)
    .post(`/api/delivery-orders/${deliveryOrderId}/deliver`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ receivedQuantityM3: quantityM3, signedByName: "Site Foreman", signatureData: "data:image/png;base64,AAAA" });

  const invoiceRes = await request(app)
    .post(`/api/delivery-orders/${deliveryOrderId}/invoice`)
    .set("Authorization", `Bearer ${admin}`)
    .send({ mode: "combined" });
  return invoiceRes.body.invoices[0].id as string;
}

describe("invoice clearance submission", () => {
  it("clears a draft invoice via MockClearanceProvider, allocating an ICV and QR payload", async () => {
    const invoiceId = await createDraftInvoice("1");

    const res = await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cleared");
    expect(res.body.clearanceStatus).toBe("cleared");
    expect(typeof res.body.clearanceIcv).toBe("number");
    expect(res.body.clearanceIcv).toBeGreaterThan(0);
    expect(res.body.clearanceQrPayload).toMatch(/^MOCK-QR:invoice:/);
    expect(res.body.clearanceError).toBeNull();
  });

  it("400s a second submission once the invoice has already cleared", async () => {
    const invoiceId = await createDraftInvoice("1");
    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();

    const res = await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(400);
  });

  it("404s submitting a nonexistent invoice for clearance", async () => {
    const res = await request(app)
      .post("/api/invoices/00000000-0000-4000-8000-000000000099/submit-for-clearance")
      .set("Authorization", `Bearer ${admin}`)
      .send();
    expect(res.status).toBe(404);
  });

  it("allocates strictly increasing ICVs across consecutive submissions", async () => {
    const invA = await createDraftInvoice("1");
    const invB = await createDraftInvoice("1");
    const resA = await request(app).post(`/api/invoices/${invA}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    const resB = await request(app).post(`/api/invoices/${invB}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(resB.body.clearanceIcv).toBeGreaterThan(resA.body.clearanceIcv);
  });
});

describe("clearance-before-issue enforcement", () => {
  it("400s issuing an invoice that hasn't cleared yet", async () => {
    const invoiceId = await createDraftInvoice("1");
    const res = await request(app).post(`/api/invoices/${invoiceId}/issue`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(400);
  });

  it("issues a cleared invoice", async () => {
    const invoiceId = await createDraftInvoice("1");
    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();

    const res = await request(app).post(`/api/invoices/${invoiceId}/issue`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("issued");
  });

  it("404s issuing a nonexistent invoice", async () => {
    const res = await request(app)
      .post("/api/invoices/00000000-0000-4000-8000-000000000099/issue")
      .set("Authorization", `Bearer ${admin}`)
      .send();
    expect(res.status).toBe(404);
  });
});

describe("credit/debit note clearance submission", () => {
  it("clears a credit note independently of its parent invoice's own clearance state", async () => {
    const invoiceId = await createDraftInvoice("2");
    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();

    const creditRes = await request(app)
      .post(`/api/invoices/${invoiceId}/credit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "10.000", reason: "Pricing correction" });
    const creditNoteId = creditRes.body.creditNotes[0].id as string;
    expect(creditRes.body.creditNotes[0].clearanceStatus).toBe("pending");

    const res = await request(app)
      .post(`/api/credit-notes/${creditNoteId}/submit-for-clearance`)
      .set("Authorization", `Bearer ${admin}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.clearanceStatus).toBe("cleared");
    expect(res.body.clearanceQrPayload).toMatch(/^MOCK-QR:credit_note:/);
  });
});

describe("clearance queue", () => {
  it("lists cleared and pending documents, filterable by status and documentType", async () => {
    const clearedInvoiceId = await createDraftInvoice("1");
    await request(app).post(`/api/invoices/${clearedInvoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    const pendingInvoiceId = await createDraftInvoice("1");

    const clearedList = await request(app)
      .get("/api/clearance-queue")
      .query({ status: "cleared", documentType: "invoice", pageSize: 100 })
      .set("Authorization", `Bearer ${admin}`);
    expect(clearedList.status).toBe(200);
    expect(clearedList.body.items.some((i: { id: string }) => i.id === clearedInvoiceId)).toBe(true);
    expect(clearedList.body.items.every((i: { clearanceStatus: string }) => i.clearanceStatus === "cleared")).toBe(true);

    const pendingList = await request(app)
      .get("/api/clearance-queue")
      .query({ status: "pending", documentType: "invoice", pageSize: 100 })
      .set("Authorization", `Bearer ${admin}`);
    expect(pendingList.body.items.some((i: { id: string }) => i.id === pendingInvoiceId)).toBe(true);
    expect(pendingList.body.items.some((i: { id: string }) => i.id === clearedInvoiceId)).toBe(false);
  });
});

describe("transport-failure retry accounting (CLAUDE.md: bounded exponential-backoff retry for transport failures only)", () => {
  it("marks the invoice retrying with a scheduled next-retry time and an incrementing attempt count, never touching invoiceStatus", async () => {
    const invoiceId = await createDraftInvoice("1");
    const failing = new AlwaysTransportErrorProvider();

    const first = await submitInvoiceForClearance(failing, config.companyId, null, invoiceId);
    expect(first).toEqual({ kind: "ok" });

    const [afterFirst] = await withTenant(db, config.companyId, (tx) => tx.select().from(invoice).where(eq(invoice.id, invoiceId)));
    expect(afterFirst!.status).toBe("pending_clearance"); // never resolved — no DOMAIN.md transition on a transport failure
    expect(afterFirst!.clearanceStatus).toBe("retrying");
    expect(afterFirst!.clearanceAttempts).toBe(1);
    expect(afterFirst!.clearanceError).toBe("simulated network failure");
    expect(afterFirst!.clearanceNextRetryAt).not.toBeNull();
    const icvAfterFirst = afterFirst!.clearanceIcv;
    expect(icvAfterFirst).not.toBeNull();

    const second = await submitInvoiceForClearance(failing, config.companyId, null, invoiceId);
    expect(second).toEqual({ kind: "ok" });
    const [afterSecond] = await withTenant(db, config.companyId, (tx) => tx.select().from(invoice).where(eq(invoice.id, invoiceId)));
    expect(afterSecond!.clearanceAttempts).toBe(2);
    // Same document, same ICV across retries — it identifies the fiscal
    // document, not the attempt.
    expect(afterSecond!.clearanceIcv).toBe(icvAfterFirst);

    // A subsequent successful submission (e.g. the cron picking it back up
    // once the provider recovers) clears it normally.
    const { MockClearanceProvider } = await import("@rmixerp/core");
    const recovered = await submitInvoiceForClearance(new MockClearanceProvider(), config.companyId, null, invoiceId);
    expect(recovered).toEqual({ kind: "ok" });
    const [afterRecovery] = await withTenant(db, config.companyId, (tx) => tx.select().from(invoice).where(eq(invoice.id, invoiceId)));
    expect(afterRecovery!.status).toBe("cleared");
    expect(afterRecovery!.clearanceStatus).toBe("cleared");
    expect(afterRecovery!.clearanceIcv).toBe(icvAfterFirst);
  });
});

describe("rejected-document correction and resubmission", () => {
  it("reopens a rejected invoice for another attempt, then clears normally once resubmitted", async () => {
    const invoiceId = await createDraftInvoice("1");
    const rejecting = new AlwaysRejectedProvider("missing seller tax number");

    const rejectedOutcome = await submitInvoiceForClearance(rejecting, config.companyId, null, invoiceId);
    expect(rejectedOutcome).toEqual({ kind: "ok" });
    const [afterReject] = await withTenant(db, config.companyId, (tx) => tx.select().from(invoice).where(eq(invoice.id, invoiceId)));
    expect(afterReject!.status).toBe("rejected");
    expect(afterReject!.clearanceStatus).toBe("rejected");
    expect(afterReject!.clearanceError).toBe("missing seller tax number");
    const icvAfterReject = afterReject!.clearanceIcv;

    // Resubmitting directly while still rejected is refused with a pointer to the correction endpoint.
    const stillRejected = await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(stillRejected.status).toBe(400);

    const corrected = await correctAndResubmitInvoice(config.companyId, null, invoiceId);
    expect(corrected.kind).toBe("ok");
    const [afterCorrection] = await withTenant(db, config.companyId, (tx) => tx.select().from(invoice).where(eq(invoice.id, invoiceId)));
    expect(afterCorrection!.status).toBe("draft");
    expect(afterCorrection!.clearanceStatus).toBe("pending");
    expect(afterCorrection!.clearanceAttempts).toBe(0);
    expect(afterCorrection!.clearanceError).toBeNull();
    // Same ICV reused — it identifies the fiscal document, not the attempt, even across a correction.
    expect(afterCorrection!.clearanceIcv).toBe(icvAfterReject);

    const resubmitRes = await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.status).toBe("cleared");
    expect(resubmitRes.body.clearanceIcv).toBe(icvAfterReject);
  });

  it("400s correcting an invoice that was never rejected", async () => {
    const invoiceId = await createDraftInvoice("1");
    const result = await correctAndResubmitInvoice(config.companyId, null, invoiceId);
    expect(result.kind).toBe("not_rejected");

    const res = await request(app).post(`/api/invoices/${invoiceId}/correct-and-resubmit`).set("Authorization", `Bearer ${admin}`).send();
    expect(res.status).toBe(400);
  });

  it("404s correcting a nonexistent invoice", async () => {
    const res = await request(app)
      .post("/api/invoices/00000000-0000-4000-8000-000000000099/correct-and-resubmit")
      .set("Authorization", `Bearer ${admin}`)
      .send();
    expect(res.status).toBe(404);
  });

  it("reopens a rejected credit note for another attempt via the HTTP route", async () => {
    const invoiceId = await createDraftInvoice("2");
    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    const creditRes = await request(app)
      .post(`/api/invoices/${invoiceId}/credit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "5.000", reason: "Pricing correction" });
    const creditNoteId = creditRes.body.creditNotes[0].id as string;

    const rejecting = new AlwaysRejectedProvider("bad line description");
    const rejectedOutcome = await submitCreditNoteForClearance(rejecting, config.companyId, null, creditNoteId);
    expect(rejectedOutcome).toEqual({ kind: "ok" });

    const correctRes = await request(app).post(`/api/credit-notes/${creditNoteId}/correct-and-resubmit`).set("Authorization", `Bearer ${admin}`).send();
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.clearanceStatus).toBe("pending");

    const resubmitRes = await request(app).post(`/api/credit-notes/${creditNoteId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.clearanceStatus).toBe("cleared");
  });

  it("400s correcting a credit note that was never rejected", async () => {
    const invoiceId = await createDraftInvoice("2");
    await request(app).post(`/api/invoices/${invoiceId}/submit-for-clearance`).set("Authorization", `Bearer ${admin}`).send();
    const creditRes = await request(app)
      .post(`/api/invoices/${invoiceId}/credit-notes`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ amountJod: "5.000", reason: "Pricing correction" });
    const creditNoteId = creditRes.body.creditNotes[0].id as string;

    const result = await correctAndResubmitCreditNote(config.companyId, null, creditNoteId);
    expect(result.kind).toBe("not_rejected");
  });
});

describe("clearance provider info", () => {
  it("reports the simulated mock provider in test/dev (no CLEARANCE_PROVIDER=jofotara configured)", async () => {
    const res = await request(app).get("/api/clearance-provider-info").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.simulated).toBe(true);
    expect(res.body.providerName).toBe("mock");
  });
});
