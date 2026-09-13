/**
 * Explicit allowed-transition table for a post-dated cheque (see
 * DOMAIN.md's State machines section). `bounced` and `cancelled` are
 * terminal — DOMAIN.md's bounce handling is "reopens the invoice and hits
 * credit standing, unwinding allocations", not un-bouncing the cheque
 * itself, so there is no `bounced -> *` edge.
 */

export const PDC_STATUSES = ["pending", "deposited", "cleared", "bounced", "cancelled"] as const;
export type PdcStatus = (typeof PDC_STATUSES)[number];

const PDC_TRANSITIONS: Record<PdcStatus, readonly PdcStatus[]> = {
  pending: ["deposited", "cancelled"],
  deposited: ["cleared", "bounced"],
  cleared: [],
  bounced: [],
  cancelled: [],
};

export function canTransitionPdc(from: PdcStatus, to: PdcStatus): boolean {
  return PDC_TRANSITIONS[from].includes(to);
}

export function assertPdcTransition(from: PdcStatus, to: PdcStatus): void {
  if (!canTransitionPdc(from, to)) {
    throw new Error(`Invalid post-dated cheque transition: ${from} -> ${to}`);
  }
}
