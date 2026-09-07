import { addFils, decimalStringToMilliUnits, fils, mulFilsRoundHalfUp, taxForLine, type Fils } from "@rmixerp/core";

export interface LineBaseFields {
  concreteUnitPriceFils: bigint;
  deliveryUnitPriceFils: bigint;
  quantityM3: string;
  taxRateBasisPoints: number;
}

/** Concrete is taxable; delivery/transport is tax-exempt (matches Phase 6's combined+split invoice rule). */
export function computeLineBaseAmounts(line: LineBaseFields) {
  const qtyMilli = decimalStringToMilliUnits(line.quantityM3);
  const concreteNetFils = mulFilsRoundHalfUp(fils(line.concreteUnitPriceFils), qtyMilli, 1000n);
  const deliveryNetFils = mulFilsRoundHalfUp(fils(line.deliveryUnitPriceFils), qtyMilli, 1000n);
  const concreteTaxFils = taxForLine(concreteNetFils, BigInt(line.taxRateBasisPoints));
  return { concreteNetFils, deliveryNetFils, concreteTaxFils };
}

export interface ChargeTypeSnapshot {
  calculationMethod: "flat" | "per_unit" | "percentage";
  defaultAmountFils: bigint | null;
  percentageBasisPoints: number | null;
  taxRateBasisPoints: number;
}

/**
 * Computes one charge's pre-tax amount and tax, given the charge type's
 * configured rate. Callers must validate that the charge type carries the
 * rate its calculationMethod needs (and that `quantity` is present for
 * `per_unit`) before calling this — it throws on missing configuration
 * rather than guessing, since that would be a data-integrity bug, not a
 * request-validation failure.
 */
export function computeChargeAmount(
  chargeType: ChargeTypeSnapshot,
  quantity: string | null,
  lineNetFilsBeforeCharges: Fils,
): { amountFils: Fils; taxFils: Fils } {
  let amountFils: Fils;
  if (chargeType.calculationMethod === "flat") {
    if (chargeType.defaultAmountFils === null) {
      throw new Error("flat charge type has no defaultAmountFils configured");
    }
    amountFils = fils(chargeType.defaultAmountFils);
  } else if (chargeType.calculationMethod === "per_unit") {
    if (chargeType.defaultAmountFils === null) {
      throw new Error("per_unit charge type has no defaultAmountFils configured");
    }
    if (!quantity) {
      throw new Error("per_unit charge requires a quantity");
    }
    amountFils = mulFilsRoundHalfUp(fils(chargeType.defaultAmountFils), decimalStringToMilliUnits(quantity), 1000n);
  } else {
    if (chargeType.percentageBasisPoints === null) {
      throw new Error("percentage charge type has no percentageBasisPoints configured");
    }
    amountFils = mulFilsRoundHalfUp(lineNetFilsBeforeCharges, BigInt(chargeType.percentageBasisPoints), 10_000n);
  }
  const taxFils = taxForLine(amountFils, BigInt(chargeType.taxRateBasisPoints));
  return { amountFils, taxFils };
}

export interface ChargeAmounts {
  amountFils: bigint;
  taxFils: bigint;
}

/** Recomputes one line's net/tax/total from its base concrete+delivery amounts plus every active charge on it. */
export function computeLineTotals(
  base: { concreteNetFils: Fils; deliveryNetFils: Fils; concreteTaxFils: Fils },
  charges: ChargeAmounts[],
): { netFils: Fils; taxFils: Fils; totalFils: Fils } {
  const chargesNetFils = addFils(...charges.map((c) => fils(c.amountFils)));
  const chargesTaxFils = addFils(...charges.map((c) => fils(c.taxFils)));
  const netFils = addFils(base.concreteNetFils, base.deliveryNetFils, chargesNetFils);
  const taxFils = addFils(base.concreteTaxFils, chargesTaxFils);
  return { netFils, taxFils, totalFils: addFils(netFils, taxFils) };
}

export interface LineTotals {
  netFils: bigint;
  taxFils: bigint;
  totalFils: bigint;
}

/** Recomputes the quotation/sales-order header's subtotal/tax/total from every active line's totals. */
export function computeHeaderTotals(lines: LineTotals[]): { subtotalFils: Fils; taxFils: Fils; totalFils: Fils } {
  const subtotalFils = addFils(...lines.map((l) => fils(l.netFils)));
  const taxFils = addFils(...lines.map((l) => fils(l.taxFils)));
  const totalFils = addFils(...lines.map((l) => fils(l.totalFils)));
  return { subtotalFils, taxFils, totalFils };
}
