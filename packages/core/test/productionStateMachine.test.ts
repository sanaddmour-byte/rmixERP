import { describe, expect, it } from "vitest";
import {
  assertProductionOrderTransition,
  canTransitionProductionOrder,
  PRODUCTION_ORDER_STATUSES,
} from "../src/productionStateMachine";

describe("production order state machine", () => {
  it("allows the happy path planned -> in_progress -> completed", () => {
    expect(canTransitionProductionOrder("planned", "in_progress")).toBe(true);
    expect(canTransitionProductionOrder("in_progress", "completed")).toBe(true);
  });

  it("allows cancellation from planned or in_progress", () => {
    expect(canTransitionProductionOrder("planned", "cancelled")).toBe(true);
    expect(canTransitionProductionOrder("in_progress", "cancelled")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(canTransitionProductionOrder("planned", "completed")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["completed", "cancelled"] as const) {
      for (const status of PRODUCTION_ORDER_STATUSES) {
        expect(canTransitionProductionOrder(terminal, status)).toBe(false);
      }
    }
  });

  it("assertProductionOrderTransition throws on an invalid transition", () => {
    expect(() => assertProductionOrderTransition("planned", "completed")).toThrow(/Invalid production order transition/);
  });
});
