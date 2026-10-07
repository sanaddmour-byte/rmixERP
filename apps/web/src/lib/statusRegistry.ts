import type { BadgeTone } from "../components/StatusBadge";

/**
 * Single source of truth for status → tone, consolidating the
 * independent STATUS_TONE/PDC_STATUS_TONE/CLEARANCE_STATUS_TONE objects
 * previously duplicated per page (docs/ui-ux-audit.md §6) — each domain
 * still has its own status set (a purchase order's "approved" isn't the
 * same enum as a cheque's), but the tone decision for each now lives in
 * exactly one place.
 */
export const PURCHASE_REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "gray",
  submitted: "yellow",
  approved: "green",
  rejected: "red",
  cancelled: "gray",
};

export const PURCHASE_ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "gray",
  submitted: "yellow",
  approved: "green",
  received: "green",
  billed: "green",
  rejected: "red",
  cancelled: "gray",
};

export const VENDOR_BILL_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "gray",
  approved: "yellow",
  partially_paid: "yellow",
  paid: "green",
  cancelled: "gray",
};

export const PDC_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "yellow",
  deposited: "yellow",
  cleared: "green",
  bounced: "red",
  cancelled: "gray",
};

export const CLEARANCE_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "yellow",
  retrying: "yellow",
  cleared: "green",
  rejected: "red",
};

export const DELIVERY_ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  planned: "gray",
  dispatched: "yellow",
  delivered: "green",
  invoiced: "green",
};

/** QC pass/fail/pending — not a document status enum, but the same tone-registry idea so QCPage doesn't hand-roll its own pill (see docs/ui-ux-audit.md §1.1's dark-mode contrast bug on that hand-rolled version). */
export function qcResultTone(pass: boolean | null): BadgeTone {
  if (pass === null) return "gray";
  return pass ? "green" : "red";
}

export function qcResultLabel(pass: boolean | null): string {
  if (pass === null) return "Pending";
  return pass ? "Pass" : "Fail";
}
