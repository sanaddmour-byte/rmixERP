import { describe, expect, it } from "vitest";
import { assertInvoiceTransition, canTransitionInvoice, INVOICE_STATUSES } from "../src/invoiceStateMachine";

describe("invoice state machine", () => {
  it("allows the happy path draft -> pending_clearance -> cleared -> issued -> paid", () => {
    expect(canTransitionInvoice("draft", "pending_clearance")).toBe(true);
    expect(canTransitionInvoice("pending_clearance", "cleared")).toBe(true);
    expect(canTransitionInvoice("cleared", "issued")).toBe(true);
    expect(canTransitionInvoice("issued", "paid")).toBe(true);
  });

  it("allows partial payment before full payment", () => {
    expect(canTransitionInvoice("issued", "partially_paid")).toBe(true);
    expect(canTransitionInvoice("partially_paid", "paid")).toBe(true);
  });

  it("allows rejection from pending_clearance, and correction back to draft", () => {
    expect(canTransitionInvoice("pending_clearance", "rejected")).toBe(true);
    expect(canTransitionInvoice("rejected", "draft")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(canTransitionInvoice("draft", "cleared")).toBe(false);
    expect(canTransitionInvoice("draft", "issued")).toBe(false);
    expect(canTransitionInvoice("pending_clearance", "issued")).toBe(false);
  });

  it("rejects any transition out of the terminal paid state", () => {
    for (const status of INVOICE_STATUSES) {
      expect(canTransitionInvoice("paid", status)).toBe(false);
    }
  });

  it("rejects a direct rejected -> pending_clearance resubmission (must go through draft)", () => {
    expect(canTransitionInvoice("rejected", "pending_clearance")).toBe(false);
  });

  it("assertInvoiceTransition throws on an invalid transition", () => {
    expect(() => assertInvoiceTransition("draft", "issued")).toThrow(/Invalid invoice transition/);
  });
});
