/** Explicit allowed-transition table — no free-form status writes in routes (see DOMAIN.md). */

export const PRODUCTION_ORDER_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

const PRODUCTION_ORDER_TRANSITIONS: Record<ProductionOrderStatus, readonly ProductionOrderStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionProductionOrder(from: ProductionOrderStatus, to: ProductionOrderStatus): boolean {
  return PRODUCTION_ORDER_TRANSITIONS[from].includes(to);
}

export function assertProductionOrderTransition(from: ProductionOrderStatus, to: ProductionOrderStatus): void {
  if (!canTransitionProductionOrder(from, to)) {
    throw new Error(`Invalid production order transition: ${from} -> ${to}`);
  }
}
