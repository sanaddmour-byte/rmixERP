import { describe, expect, it } from "vitest";
import {
  assertVendorBillTransition,
  canTransitionVendorBill,
  deriveVendorBillStatusFromAllocations,
  VENDOR_BILL_STATUSES,
} from "../src/vendorBillStateMachine";

describe("vendor bill state machine", () => {
  it("allows the happy path draft -> approved -> partially_paid -> paid", () => {
    expect(canTransitionVendorBill("draft", "approved")).toBe(true);
    expect(canTransitionVendorBill("approved", "partially_paid")).toBe(true);
    expect(canTransitionVendorBill("partially_paid", "paid")).toBe(true);
  });

  it("allows approved to jump straight to paid on a single full payment", () => {
    expect(canTransitionVendorBill("approved", "paid")).toBe(true);
  });

  it("allows a bounced/reversed payment to reopen paid back to partially_paid", () => {
    expect(canTransitionVendorBill("paid", "partially_paid")).toBe(true);
  });

  it("allows cancelling a draft bill", () => {
    expect(canTransitionVendorBill("draft", "cancelled")).toBe(true);
  });

  it("rejects approving a cancelled bill", () => {
    expect(canTransitionVendorBill("cancelled", "approved")).toBe(false);
  });

  it("treats cancelled as terminal", () => {
    for (const status of VENDOR_BILL_STATUSES) {
      expect(canTransitionVendorBill("cancelled", status)).toBe(false);
    }
  });

  it("assertVendorBillTransition throws on an invalid transition", () => {
    expect(() => assertVendorBillTransition("draft", "paid")).toThrow(/Invalid vendor bill transition/);
  });
});

describe("deriveVendorBillStatusFromAllocations", () => {
  it("stays draft while unapproved regardless of allocation", () => {
    expect(deriveVendorBillStatusFromAllocations(false, 1000n, 0n)).toBe("draft");
    expect(deriveVendorBillStatusFromAllocations(false, 1000n, 1000n)).toBe("draft");
  });

  it("is approved once approved with nothing paid", () => {
    expect(deriveVendorBillStatusFromAllocations(true, 1000n, 0n)).toBe("approved");
  });

  it("is partially_paid when allocation is short of the total", () => {
    expect(deriveVendorBillStatusFromAllocations(true, 1000n, 400n)).toBe("partially_paid");
  });

  it("is paid once allocation meets or exceeds the total", () => {
    expect(deriveVendorBillStatusFromAllocations(true, 1000n, 1000n)).toBe("paid");
    expect(deriveVendorBillStatusFromAllocations(true, 1000n, 1200n)).toBe("paid");
  });
});
