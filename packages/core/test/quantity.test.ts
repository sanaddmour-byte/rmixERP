import { describe, expect, it } from "vitest";
import { mulFilsRoundHalfUp, jodStringToFils, filsToJodString } from "../src/money";
import { decimalStringToMilliUnits, milliUnitsToDecimalString } from "../src/quantity";

describe("decimalStringToMilliUnits / milliUnitsToDecimalString", () => {
  it("round-trips a whole number", () => {
    expect(decimalStringToMilliUnits("7")).toBe(7000n);
    expect(milliUnitsToDecimalString(7000n)).toBe("7.000");
  });

  it("round-trips a fractional quantity", () => {
    expect(decimalStringToMilliUnits("6.5")).toBe(6500n);
    expect(milliUnitsToDecimalString(6500n)).toBe("6.500");
  });

  it("rejects more than 3 decimal places", () => {
    expect(() => decimalStringToMilliUnits("1.2345")).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => decimalStringToMilliUnits("not-a-number")).toThrow();
  });
});

describe("pricing a quantity without floats", () => {
  it("computes 6.5 m3 at 42.750 JOD/m3 exactly", () => {
    const unitPriceFils = jodStringToFils("42.750");
    const qtyMilli = decimalStringToMilliUnits("6.5");
    const netFils = mulFilsRoundHalfUp(unitPriceFils, qtyMilli, 1000n);
    expect(filsToJodString(netFils)).toBe("277.875");
  });

  it("rounds half-up on an inexact product", () => {
    const unitPriceFils = jodStringToFils("0.001");
    const qtyMilli = decimalStringToMilliUnits("0.5");
    const netFils = mulFilsRoundHalfUp(unitPriceFils, qtyMilli, 1000n);
    // 1 fils * 0.5 = 0.5 -> rounds half-up to 1 fils
    expect(netFils).toBe(1n);
  });
});
