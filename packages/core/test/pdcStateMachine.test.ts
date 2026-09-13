import { describe, expect, it } from "vitest";
import { assertPdcTransition, canTransitionPdc, PDC_STATUSES } from "../src/pdcStateMachine";

describe("post-dated cheque state machine", () => {
  it("allows the happy path pending -> deposited -> cleared", () => {
    expect(canTransitionPdc("pending", "deposited")).toBe(true);
    expect(canTransitionPdc("deposited", "cleared")).toBe(true);
  });

  it("allows a deposited cheque to bounce", () => {
    expect(canTransitionPdc("deposited", "bounced")).toBe(true);
  });

  it("allows cancelling a still-pending cheque", () => {
    expect(canTransitionPdc("pending", "cancelled")).toBe(true);
  });

  it("rejects depositing a cheque that hasn't been received as pending", () => {
    expect(canTransitionPdc("cleared", "deposited")).toBe(false);
  });

  it("rejects skipping straight to cleared without depositing", () => {
    expect(canTransitionPdc("pending", "cleared")).toBe(false);
  });

  it("treats bounced and cancelled as terminal", () => {
    for (const status of PDC_STATUSES) {
      expect(canTransitionPdc("bounced", status)).toBe(false);
      expect(canTransitionPdc("cancelled", status)).toBe(false);
    }
  });

  it("assertPdcTransition throws on an invalid transition", () => {
    expect(() => assertPdcTransition("pending", "cleared")).toThrow(/Invalid post-dated cheque transition/);
  });
});
