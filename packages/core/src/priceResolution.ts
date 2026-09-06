import type { Fils } from "./money";

/**
 * project-specific -> customer-specific -> branch -> company default.
 * Matches `packages/db`'s `price_list.tier` column one-to-one.
 */
export const PRICE_RESOLUTION_TIER_ORDER = ["project", "customer", "branch", "company"] as const;
export type PriceResolutionTier = (typeof PRICE_RESOLUTION_TIER_ORDER)[number];

export interface PriceListLineCandidate {
  tier: PriceResolutionTier;
  priceListId: string;
  priceListLineId: string;
  concreteUnitPriceFils: Fils;
  deliveryUnitPriceFils: Fils;
  taxRateBasisPoints: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface ResolvedPrice {
  tier: PriceResolutionTier;
  priceListId: string;
  priceListLineId: string;
  concreteUnitPriceFils: Fils;
  deliveryUnitPriceFils: Fils;
  taxRateBasisPoints: number;
}

function isActiveAt(candidate: PriceListLineCandidate, asOf: Date): boolean {
  if (candidate.effectiveFrom.getTime() > asOf.getTime()) return false;
  if (candidate.effectiveTo && candidate.effectiveTo.getTime() < asOf.getTime()) return false;
  return true;
}

/**
 * Resolves the price for one product at one point in time, given every
 * candidate line that could apply (already fetched by the caller — this
 * function does no I/O, per CLAUDE.md's price-resolution rule). Picks the
 * highest-precedence tier that has an active line as of `asOf`; ties within
 * a tier (e.g. two overlapping project-tier lines) are broken by the most
 * recently created (`create` order is the caller's responsibility — pass
 * candidates pre-sorted if more than one per tier is possible).
 *
 * Returns `null` when nothing applies at all (no company-default price is
 * configured for the product) — callers must handle that, not assume a
 * price always exists.
 */
export function resolvePrice(
  candidates: readonly PriceListLineCandidate[],
  asOf: Date = new Date(),
): ResolvedPrice | null {
  const active = candidates.filter((c) => isActiveAt(c, asOf));
  for (const tier of PRICE_RESOLUTION_TIER_ORDER) {
    const match = active.find((c) => c.tier === tier);
    if (match) {
      return {
        tier: match.tier,
        priceListId: match.priceListId,
        priceListLineId: match.priceListLineId,
        concreteUnitPriceFils: match.concreteUnitPriceFils,
        deliveryUnitPriceFils: match.deliveryUnitPriceFils,
        taxRateBasisPoints: match.taxRateBasisPoints,
      };
    }
  }
  return null;
}
