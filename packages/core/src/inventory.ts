import { addFils, mulFilsRoundHalfUp, type Fils } from "./money";

/**
 * Moving-average inventory costing (DOMAIN.md Invariant 8: "recalculated
 * on receipt and on consumption inside the same transaction as the
 * triggering event"). Quantities are milli-units (scaled ×1000, see
 * `quantity.ts`) — never a float.
 */
export interface StockState {
  quantityMilliUnits: bigint;
  averageCostFils: Fils;
}

/**
 * A receipt (stock coming in — a manual `StockAdjustment` until Phase 9's
 * Goods Receipt exists) re-averages cost across the combined quantity.
 * Receiving into a zero/negative balance resets the average to the
 * receipt's own unit cost, since there is no prior valid average to blend.
 */
export function applyStockReceipt(
  state: StockState,
  receiptQuantityMilliUnits: bigint,
  receiptUnitCostFils: Fils,
): StockState {
  if (receiptQuantityMilliUnits <= 0n) {
    throw new Error("applyStockReceipt: receipt quantity must be positive");
  }
  if (state.quantityMilliUnits <= 0n) {
    return {
      quantityMilliUnits: state.quantityMilliUnits + receiptQuantityMilliUnits,
      averageCostFils: receiptUnitCostFils,
    };
  }
  const existingValueFils = mulFilsRoundHalfUp(state.averageCostFils, state.quantityMilliUnits, 1000n);
  const receiptValueFils = mulFilsRoundHalfUp(receiptUnitCostFils, receiptQuantityMilliUnits, 1000n);
  const totalQuantityMilliUnits = state.quantityMilliUnits + receiptQuantityMilliUnits;
  const totalValueFils = addFils(existingValueFils, receiptValueFils);
  const newAverageCostFils = mulFilsRoundHalfUp(totalValueFils, 1000n, totalQuantityMilliUnits);
  return { quantityMilliUnits: totalQuantityMilliUnits, averageCostFils: newAverageCostFils };
}

export interface StockConsumptionResult {
  state: StockState;
  costFils: Fils;
  wentNegative: boolean;
}

/**
 * A consumption (back-flush) draws down quantity at the current average
 * cost — the average itself does not change on consumption, only on
 * receipt. Blocked (throws) when it would take the balance negative
 * unless `allowNegative` (an explicit, audited override) is set.
 */
export function applyStockConsumption(
  state: StockState,
  consumeQuantityMilliUnits: bigint,
  allowNegative: boolean,
): StockConsumptionResult {
  if (consumeQuantityMilliUnits <= 0n) {
    throw new Error("applyStockConsumption: consumption quantity must be positive");
  }
  const resultingQuantityMilliUnits = state.quantityMilliUnits - consumeQuantityMilliUnits;
  const wentNegative = resultingQuantityMilliUnits < 0n;
  if (wentNegative && !allowNegative) {
    throw new Error("applyStockConsumption: insufficient stock (blocked; pass allowNegative to override and audit it)");
  }
  const costFils = mulFilsRoundHalfUp(state.averageCostFils, consumeQuantityMilliUnits, 1000n);
  return {
    state: { quantityMilliUnits: resultingQuantityMilliUnits, averageCostFils: state.averageCostFils },
    costFils,
    wentNegative,
  };
}

export interface YieldVarianceInput {
  batchedM3Milli: bigint;
  returnedM3Milli: bigint;
  /** Null until Phase 5's DeliveryOrder exists — variance is then computed against actual delivered m3 too. */
  deliveredM3Milli: bigint | null;
}

export interface YieldVarianceResult {
  /** Batched minus returned — the net m3 that left the plant. */
  netProducedM3Milli: bigint;
  /** netProduced minus delivered; null while `deliveredM3Milli` is unknown (pre-Phase-5). */
  deliveryVarianceM3Milli: bigint | null;
}

/** Batched vs returned vs delivered m3 (DOMAIN.md Invariant 4) — usable at the production-order level now; extends to per-delivery once DeliveryOrder exists. */
export function computeYieldVariance(input: YieldVarianceInput): YieldVarianceResult {
  const netProducedM3Milli = input.batchedM3Milli - input.returnedM3Milli;
  return {
    netProducedM3Milli,
    deliveryVarianceM3Milli: input.deliveredM3Milli === null ? null : netProducedM3Milli - input.deliveredM3Milli,
  };
}

/**
 * SIMPLIFIED PLACEHOLDER — not verified against real ready-mix batching
 * practice. Applies one uniform adjustment factor to every ingredient in
 * a batch's recipe, rather than the industry-standard approach (moisture
 * correction normally applies only to aggregates, with a corresponding
 * trim to added water, derived from each material's own moisture-content
 * test result). Flagged here the same way CLAUDE.md flags unverified
 * JoFotara fields: do not treat this formula as authoritative — replace
 * it once real moisture-correction requirements are confirmed.
 */
export function applyUniformMoistureAdjustment(baseQuantityMilliUnits: bigint, moistureAdjustmentBasisPoints: number): bigint {
  const factor = 10_000 + moistureAdjustmentBasisPoints;
  return (baseQuantityMilliUnits * BigInt(factor)) / 10_000n;
}
