/** Explicit allowed-transition tables — no free-form status writes in routes (see DOMAIN.md). */

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

const QUOTATION_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: ["converted"],
  rejected: [],
  expired: [],
  converted: [],
};

export function canTransitionQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  return QUOTATION_TRANSITIONS[from].includes(to);
}

export function assertQuotationTransition(from: QuotationStatus, to: QuotationStatus): void {
  if (!canTransitionQuotation(from, to)) {
    throw new Error(`Invalid quotation transition: ${from} -> ${to}`);
  }
}

export const SALES_ORDER_STATUSES = ["draft", "confirmed", "fulfilled", "cancelled"] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

const SALES_ORDER_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function canTransitionSalesOrder(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return SALES_ORDER_TRANSITIONS[from].includes(to);
}

export function assertSalesOrderTransition(from: SalesOrderStatus, to: SalesOrderStatus): void {
  if (!canTransitionSalesOrder(from, to)) {
    throw new Error(`Invalid sales order transition: ${from} -> ${to}`);
  }
}
