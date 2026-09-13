/**
 * Explicit allowed-transition table (see DOMAIN.md's State machines section
 * and Invariant 1: `invoiced` reachable only once, enforced by Phase 6's DB
 * constraint on top of this table). DOMAIN.md documents no `cancelled`
 * state for DeliveryOrder (unlike SalesOrder/ProductionOrder, which do) —
 * a delivery order that shouldn't go out is voided (soft-delete, every
 * business table's standard mechanism) rather than transitioned, so no
 * cancellation state is guessed in here.
 */

export const DELIVERY_ORDER_STATUSES = ["planned", "dispatched", "delivered", "invoiced"] as const;
export type DeliveryOrderStatus = (typeof DELIVERY_ORDER_STATUSES)[number];

const DELIVERY_ORDER_TRANSITIONS: Record<DeliveryOrderStatus, readonly DeliveryOrderStatus[]> = {
  planned: ["dispatched"],
  dispatched: ["delivered"],
  delivered: ["invoiced"],
  invoiced: [],
};

export function canTransitionDeliveryOrder(from: DeliveryOrderStatus, to: DeliveryOrderStatus): boolean {
  return DELIVERY_ORDER_TRANSITIONS[from].includes(to);
}

export function assertDeliveryOrderTransition(from: DeliveryOrderStatus, to: DeliveryOrderStatus): void {
  if (!canTransitionDeliveryOrder(from, to)) {
    throw new Error(`Invalid delivery order transition: ${from} -> ${to}`);
  }
}
