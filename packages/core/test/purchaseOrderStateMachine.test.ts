import { describe, expect, it } from "vitest";
import {
  assertPurchaseOrderTransition,
  canTransitionPurchaseOrder,
  PURCHASE_ORDER_STATUSES,
} from "../src/purchaseOrderStateMachine";

describe("purchase order state machine", () => {
  it("allows the happy path draft -> submitted -> approved -> received -> billed", () => {
    expect(canTransitionPurchaseOrder("draft", "submitted")).toBe(true);
    expect(canTransitionPurchaseOrder("submitted", "approved")).toBe(true);
    expect(canTransitionPurchaseOrder("approved", "received")).toBe(true);
    expect(canTransitionPurchaseOrder("received", "billed")).toBe(true);
  });

  it("allows rejecting a submitted order", () => {
    expect(canTransitionPurchaseOrder("submitted", "rejected")).toBe(true);
  });

  it("allows cancelling before goods have been received", () => {
    expect(canTransitionPurchaseOrder("draft", "cancelled")).toBe(true);
    expect(canTransitionPurchaseOrder("submitted", "cancelled")).toBe(true);
    expect(canTransitionPurchaseOrder("approved", "cancelled")).toBe(true);
  });

  it("rejects cancelling once goods have been received", () => {
    expect(canTransitionPurchaseOrder("received", "cancelled")).toBe(false);
  });

  it("rejects skipping approval to go straight to received", () => {
    expect(canTransitionPurchaseOrder("submitted", "received")).toBe(false);
  });

  it("treats billed/rejected/cancelled as terminal", () => {
    for (const status of PURCHASE_ORDER_STATUSES) {
      expect(canTransitionPurchaseOrder("billed", status)).toBe(false);
      expect(canTransitionPurchaseOrder("rejected", status)).toBe(false);
      expect(canTransitionPurchaseOrder("cancelled", status)).toBe(false);
    }
  });

  it("assertPurchaseOrderTransition throws on an invalid transition", () => {
    expect(() => assertPurchaseOrderTransition("draft", "received")).toThrow(/Invalid purchase order transition/);
  });
});
