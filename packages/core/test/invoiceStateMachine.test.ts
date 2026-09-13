import { describe, expect, it } from "vitest";
import { assertInvoiceTransition, canTransitionInvoice } from "../src/invoiceStateMachine";

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

  it("allows a bounced-cheque/reversed-allocation reopen from paid back to partially_paid or issued", () => {
    expect(canTransitionInvoice("paid", "partially_paid")).toBe(true);
    expect(canTransitionInvoice("paid", "issued")).toBe(true);
    expect(canTransitionInvoice("paid", "draft")).toBe(false);
    expect(canTransitionInvoice("paid", "cleared")).toBe(false);
  });

  it("allows a reopen from partially_paid back to issued if its allocation is fully unwound", () => {
    expect(canTransitionInvoice("partially_paid", "issued")).toBe(true);
  });

  it("rejects a direct rejected -> pending_clearance resubmission (must go through draft)", () => {
    expect(canTransitionInvoice("rejected", "pending_clearance")).toBe(false);
  });

  it("assertInvoiceTransition throws on an invalid transition", () => {
    expect(() => assertInvoiceTransition("draft", "issued")).toThrow(/Invalid invoice transition/);
  });
});
