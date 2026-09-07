import { describe, expect, it } from "vitest";
import {
  assertQuotationTransition,
  assertSalesOrderTransition,
  canTransitionQuotation,
  canTransitionSalesOrder,
  QUOTATION_STATUSES,
  SALES_ORDER_STATUSES,
} from "../src/salesStateMachine";

describe("quotation state machine", () => {
  it("allows the happy path draft -> sent -> accepted -> converted", () => {
    expect(canTransitionQuotation("draft", "sent")).toBe(true);
    expect(canTransitionQuotation("sent", "accepted")).toBe(true);
    expect(canTransitionQuotation("accepted", "converted")).toBe(true);
  });

  it("allows sent -> rejected and sent -> expired", () => {
    expect(canTransitionQuotation("sent", "rejected")).toBe(true);
    expect(canTransitionQuotation("sent", "expired")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(canTransitionQuotation("draft", "accepted")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["rejected", "expired", "converted"] as const) {
      for (const status of QUOTATION_STATUSES) {
        expect(canTransitionQuotation(terminal, status)).toBe(false);
      }
    }
  });

  it("assertQuotationTransition throws on an invalid transition", () => {
    expect(() => assertQuotationTransition("draft", "converted")).toThrow(/Invalid quotation transition/);
  });

  it("assertQuotationTransition does not throw on a valid transition", () => {
    expect(() => assertQuotationTransition("draft", "sent")).not.toThrow();
  });
});

describe("sales order state machine", () => {
  it("allows the happy path draft -> confirmed -> fulfilled", () => {
    expect(canTransitionSalesOrder("draft", "confirmed")).toBe(true);
    expect(canTransitionSalesOrder("confirmed", "fulfilled")).toBe(true);
  });

  it("allows cancellation from draft or confirmed", () => {
    expect(canTransitionSalesOrder("draft", "cancelled")).toBe(true);
    expect(canTransitionSalesOrder("confirmed", "cancelled")).toBe(true);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["fulfilled", "cancelled"] as const) {
      for (const status of SALES_ORDER_STATUSES) {
        expect(canTransitionSalesOrder(terminal, status)).toBe(false);
      }
    }
  });

  it("assertSalesOrderTransition throws on an invalid transition", () => {
    expect(() => assertSalesOrderTransition("draft", "fulfilled")).toThrow(/Invalid sales order transition/);
  });
});
