import { describe, expect, it } from "vitest";
import {
  assertPurchaseRequestTransition,
  canTransitionPurchaseRequest,
  PURCHASE_REQUEST_STATUSES,
} from "../src/purchaseRequestStateMachine";

describe("purchase request state machine", () => {
  it("allows the happy path draft -> submitted -> approved", () => {
    expect(canTransitionPurchaseRequest("draft", "submitted")).toBe(true);
    expect(canTransitionPurchaseRequest("submitted", "approved")).toBe(true);
  });

  it("allows rejecting a submitted request", () => {
    expect(canTransitionPurchaseRequest("submitted", "rejected")).toBe(true);
  });

  it("allows cancelling from draft or submitted", () => {
    expect(canTransitionPurchaseRequest("draft", "cancelled")).toBe(true);
    expect(canTransitionPurchaseRequest("submitted", "cancelled")).toBe(true);
  });

  it("rejects approving a request that hasn't been submitted", () => {
    expect(canTransitionPurchaseRequest("draft", "approved")).toBe(false);
  });

  it("treats approved/rejected/cancelled as terminal", () => {
    for (const status of PURCHASE_REQUEST_STATUSES) {
      expect(canTransitionPurchaseRequest("approved", status)).toBe(false);
      expect(canTransitionPurchaseRequest("rejected", status)).toBe(false);
      expect(canTransitionPurchaseRequest("cancelled", status)).toBe(false);
    }
  });

  it("assertPurchaseRequestTransition throws on an invalid transition", () => {
    expect(() => assertPurchaseRequestTransition("draft", "approved")).toThrow(/Invalid purchase request transition/);
  });
});
