import { addFils, compareFils, subFils, ZERO_FILS, type Fils } from "./money";

export const CREDIT_POLICIES = ["none", "warning", "block"] as const;
export type CreditPolicy = (typeof CREDIT_POLICIES)[number];

export type CreditCheckOutcome = "ok" | "warning" | "blocked";

export interface CreditCheckInput {
  policy: CreditPolicy;
  creditLimitFils: Fils;
  /** Existing exposure (open invoices + other unfulfilled orders), computed by the caller — this function does no I/O. */
  currentOutstandingFils: Fils;
  newOrderAmountFils: Fils;
}

export interface CreditCheckResult {
  outcome: CreditCheckOutcome;
  projectedOutstandingFils: Fils;
  /** How far projected exposure exceeds the credit limit; zero when within limit. */
  exceedsByFils: Fils;
}

/**
 * Evaluates a customer's credit standing against a new order, per
 * DOMAIN.md/PLAN.md's policy: `none` never blocks, `warning` flags but
 * allows, `block` requires a privileged override (enforced by the caller —
 * this function only reports the outcome, it does not authorize anything).
 */
export function evaluateCreditCheck(input: CreditCheckInput): CreditCheckResult {
  const projectedOutstandingFils = addFils(input.currentOutstandingFils, input.newOrderAmountFils);
  const exceeds = compareFils(projectedOutstandingFils, input.creditLimitFils) > 0;
  const exceedsByFils = exceeds ? subFils(projectedOutstandingFils, input.creditLimitFils) : ZERO_FILS;

  if (!exceeds || input.policy === "none") {
    return { outcome: "ok", projectedOutstandingFils, exceedsByFils: ZERO_FILS };
  }
  return {
    outcome: input.policy === "warning" ? "warning" : "blocked",
    projectedOutstandingFils,
    exceedsByFils,
  };
}
