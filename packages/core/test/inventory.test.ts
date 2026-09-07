import { describe, expect, it } from "vitest";
import { jodStringToFils, filsToJodString } from "../src/money";
import { decimalStringToMilliUnits } from "../src/quantity";
import {
  applyStockConsumption,
  applyStockReceipt,
  applyUniformMoistureAdjustment,
  computeYieldVariance,
} from "../src/inventory";

describe("applyStockReceipt", () => {
  it("sets the average cost directly on the first receipt into an empty balance", () => {
    const result = applyStockReceipt(
      { quantityMilliUnits: 0n, averageCostFils: jodStringToFils("0") },
      decimalStringToMilliUnits("1000"),
      jodStringToFils("0.050"),
    );
    expect(result.quantityMilliUnits).toBe(decimalStringToMilliUnits("1000"));
    expect(result.averageCostFils).toBe(jodStringToFils("0.050"));
  });

  it("re-averages cost across the combined quantity on a second receipt", () => {
    const afterFirst = applyStockReceipt(
      { quantityMilliUnits: 0n, averageCostFils: jodStringToFils("0") },
      decimalStringToMilliUnits("1000"),
      jodStringToFils("0.050"),
    );
    // 1000 units @ 0.050 = 50.000 JOD value; receive 1000 more @ 0.070 = 70.000 JOD value
    // combined: 2000 units, 120.000 JOD -> average 0.060 JOD/unit
    const afterSecond = applyStockReceipt(afterFirst, decimalStringToMilliUnits("1000"), jodStringToFils("0.070"));
    expect(afterSecond.quantityMilliUnits).toBe(decimalStringToMilliUnits("2000"));
    expect(filsToJodString(afterSecond.averageCostFils)).toBe("0.060");
  });

  it("rejects a non-positive receipt quantity", () => {
    expect(() =>
      applyStockReceipt({ quantityMilliUnits: 0n, averageCostFils: jodStringToFils("0") }, 0n, jodStringToFils("1")),
    ).toThrow();
  });
});

describe("applyStockConsumption", () => {
  const stocked = { quantityMilliUnits: decimalStringToMilliUnits("1000"), averageCostFils: jodStringToFils("0.060") };

  it("draws down quantity at the current average cost, leaving the average unchanged", () => {
    const result = applyStockConsumption(stocked, decimalStringToMilliUnits("400"), false);
    expect(result.wentNegative).toBe(false);
    expect(result.state.quantityMilliUnits).toBe(decimalStringToMilliUnits("600"));
    expect(result.state.averageCostFils).toBe(jodStringToFils("0.060"));
    expect(filsToJodString(result.costFils)).toBe("24.000"); // 400 * 0.060
  });

  it("blocks a consumption that would take the balance negative", () => {
    expect(() => applyStockConsumption(stocked, decimalStringToMilliUnits("2000"), false)).toThrow(/insufficient stock/);
  });

  it("allows going negative when explicitly overridden", () => {
    const result = applyStockConsumption(stocked, decimalStringToMilliUnits("2000"), true);
    expect(result.wentNegative).toBe(true);
    expect(result.state.quantityMilliUnits).toBe(-decimalStringToMilliUnits("1000"));
  });
});

describe("computeYieldVariance", () => {
  it("computes net produced as batched minus returned", () => {
    const result = computeYieldVariance({
      batchedM3Milli: decimalStringToMilliUnits("10"),
      returnedM3Milli: decimalStringToMilliUnits("0.5"),
      deliveredM3Milli: null,
    });
    expect(result.netProducedM3Milli).toBe(decimalStringToMilliUnits("9.5"));
    expect(result.deliveryVarianceM3Milli).toBeNull();
  });

  it("computes delivery variance once delivered quantity is known", () => {
    const result = computeYieldVariance({
      batchedM3Milli: decimalStringToMilliUnits("10"),
      returnedM3Milli: decimalStringToMilliUnits("0.5"),
      deliveredM3Milli: decimalStringToMilliUnits("9"),
    });
    expect(result.deliveryVarianceM3Milli).toBe(decimalStringToMilliUnits("0.5"));
  });
});

describe("applyUniformMoistureAdjustment (documented simplification)", () => {
  it("scales the base quantity up by the given basis points", () => {
    const result = applyUniformMoistureAdjustment(decimalStringToMilliUnits("100"), 500); // +5%
    expect(result).toBe(decimalStringToMilliUnits("105"));
  });

  it("leaves the quantity unchanged at zero adjustment", () => {
    const result = applyUniformMoistureAdjustment(decimalStringToMilliUnits("100"), 0);
    expect(result).toBe(decimalStringToMilliUnits("100"));
  });

  it("scales down for a negative adjustment", () => {
    const result = applyUniformMoistureAdjustment(decimalStringToMilliUnits("100"), -1000); // -10%
    expect(result).toBe(decimalStringToMilliUnits("90"));
  });
});
