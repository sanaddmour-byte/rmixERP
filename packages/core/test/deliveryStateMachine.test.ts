import { describe, expect, it } from "vitest";
import {
  assertDeliveryOrderTransition,
  canTransitionDeliveryOrder,
  DELIVERY_ORDER_STATUSES,
} from "../src/deliveryStateMachine";

describe("delivery order state machine", () => {
  it("allows the happy path planned -> dispatched -> delivered -> invoiced", () => {
    expect(canTransitionDeliveryOrder("planned", "dispatched")).toBe(true);
    expect(canTransitionDeliveryOrder("dispatched", "delivered")).toBe(true);
    expect(canTransitionDeliveryOrder("delivered", "invoiced")).toBe(true);
  });

  it("rejects skipping a state", () => {
    expect(canTransitionDeliveryOrder("planned", "delivered")).toBe(false);
    expect(canTransitionDeliveryOrder("planned", "invoiced")).toBe(false);
  });

  it("rejects any transition out of the terminal invoiced state", () => {
    for (const status of DELIVERY_ORDER_STATUSES) {
      expect(canTransitionDeliveryOrder("invoiced", status)).toBe(false);
    }
  });

  it("has no cancellation path (DOMAIN.md documents none for DeliveryOrder)", () => {
    for (const from of DELIVERY_ORDER_STATUSES) {
      // @ts-expect-error -- "cancelled" is deliberately not a valid DeliveryOrderStatus
      expect(canTransitionDeliveryOrder(from, "cancelled")).toBe(false);
    }
  });

  it("assertDeliveryOrderTransition throws on an invalid transition", () => {
    expect(() => assertDeliveryOrderTransition("planned", "delivered")).toThrow(/Invalid delivery order transition/);
  });
});
