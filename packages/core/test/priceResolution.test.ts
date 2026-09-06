import { describe, expect, it } from "vitest";
import { jodStringToFils } from "../src/money";
import { resolvePrice, type PriceListLineCandidate } from "../src/priceResolution";

function candidate(
  tier: PriceListLineCandidate["tier"],
  overrides: Partial<PriceListLineCandidate> = {},
): PriceListLineCandidate {
  return {
    tier,
    priceListId: `pl-${tier}`,
    priceListLineId: `pll-${tier}`,
    concreteUnitPriceFils: jodStringToFils("10.000"),
    deliveryUnitPriceFils: jodStringToFils("2.000"),
    taxRateBasisPoints: 1600,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
  };
}

const asOf = new Date("2026-06-01T00:00:00Z");

describe("resolvePrice", () => {
  it("falls back to company default when nothing more specific exists", () => {
    const result = resolvePrice([candidate("company")], asOf);
    expect(result?.tier).toBe("company");
  });

  it("prefers branch over company", () => {
    const result = resolvePrice([candidate("company"), candidate("branch")], asOf);
    expect(result?.tier).toBe("branch");
  });

  it("prefers customer over branch and company", () => {
    const result = resolvePrice(
      [candidate("company"), candidate("branch"), candidate("customer")],
      asOf,
    );
    expect(result?.tier).toBe("customer");
  });

  it("prefers project over every other tier", () => {
    const result = resolvePrice(
      [candidate("company"), candidate("branch"), candidate("customer"), candidate("project")],
      asOf,
    );
    expect(result?.tier).toBe("project");
    expect(result?.priceListLineId).toBe("pll-project");
  });

  it("returns null when there are no candidates at all", () => {
    expect(resolvePrice([], asOf)).toBeNull();
  });

  it("ignores a line that isn't effective yet", () => {
    const result = resolvePrice(
      [
        candidate("project", { effectiveFrom: new Date("2027-01-01T00:00:00Z") }),
        candidate("company"),
      ],
      asOf,
    );
    expect(result?.tier).toBe("company");
  });

  it("ignores a line whose effective window has ended", () => {
    const result = resolvePrice(
      [
        candidate("customer", { effectiveTo: new Date("2026-03-01T00:00:00Z") }),
        candidate("branch"),
      ],
      asOf,
    );
    expect(result?.tier).toBe("branch");
  });

  it("includes a line on its exact effectiveFrom/effectiveTo boundaries", () => {
    const result = resolvePrice(
      [candidate("project", { effectiveFrom: asOf, effectiveTo: asOf })],
      asOf,
    );
    expect(result?.tier).toBe("project");
  });

  it("carries through the resolved line's own price/tax fields, not the loser's", () => {
    const result = resolvePrice(
      [
        candidate("branch", {
          concreteUnitPriceFils: jodStringToFils("99.000"),
          taxRateBasisPoints: 0,
        }),
        candidate("project", {
          concreteUnitPriceFils: jodStringToFils("42.500"),
          deliveryUnitPriceFils: jodStringToFils("3.250"),
          taxRateBasisPoints: 1600,
        }),
      ],
      asOf,
    );
    expect(result).toMatchObject({
      tier: "project",
      concreteUnitPriceFils: jodStringToFils("42.500"),
      deliveryUnitPriceFils: jodStringToFils("3.250"),
      taxRateBasisPoints: 1600,
    });
  });
});
