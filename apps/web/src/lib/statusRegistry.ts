import type { BadgeTone } from "../components/StatusBadge";

/**
 * One tone map per status-bearing entity, shared by every screen that
 * shows that status — so "what does yellow mean here" has one answer per
 * entity instead of each page inventing its own. Add a new entry here
 * when a new entity's status needs a badge; never inline a tone map in a
 * page component.
 */
export const DELIVERY_ORDER_STATUS_TONE: Record<"planned" | "dispatched" | "delivered" | "invoiced", BadgeTone> = {
  planned: "gray",
  dispatched: "yellow",
  delivered: "green",
  invoiced: "green",
};
