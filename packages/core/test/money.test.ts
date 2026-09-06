import { describe, expect, it } from "vitest";
import {
  addFils,
  allocateFilsEvenly,
  compareFils,
  filsToJodString,
  jodStringToFils,
  mulFilsRoundHalfUp,
  negateFils,
  subFils,
  taxForLine,
  ZERO_FILS,
} from "../src/money";

describe("jodStringToFils / filsToJodString round-trip", () => {
  it.each([
    ["0.000", "0.000"],
    ["1234.567", "1234.567"],
    ["1234.5", "1234.500"],
    ["1234", "1234.000"],
    ["-45.001", "-45.001"],
  ])("parses %s and formats back to %s", (input, expected) => {
    expect(filsToJodString(jodStringToFils(input))).toBe(expected);
  });

  it("rejects more than 3 decimal places", () => {
    expect(() => jodStringToFils("1.2345")).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => jodStringToFils("abc")).toThrow();
  });
});

describe("addFils / subFils / negateFils", () => {
  it("adds an arbitrary number of amounts with no float drift", () => {
    const parts = Array.from({ length: 10 }, () => jodStringToFils("0.1"));
    expect(filsToJodString(addFils(...parts))).toBe("1.000");
  });

  it("subtracts and negates", () => {
    const a = jodStringToFils("10.000");
    const b = jodStringToFils("3.500");
    expect(filsToJodString(subFils(a, b))).toBe("6.500");
    expect(filsToJodString(negateFils(b))).toBe("-3.500");
  });

  it("sums to exactly zero for equal and opposite amounts", () => {
    const a = jodStringToFils("99.999");
    expect(addFils(a, negateFils(a))).toBe(ZERO_FILS);
  });
});

describe("mulFilsRoundHalfUp", () => {
  it("rounds .5 fils up in magnitude, away from zero", () => {
    // 1 fils * 1/2 = 0.5 fils -> rounds to 1
    const amount = jodStringToFils("0.001");
    expect(mulFilsRoundHalfUp(amount, 1n, 2n)).toBe(jodStringToFils("0.001"));
  });

  it("rounds down when remainder is less than half", () => {
    const amount = jodStringToFils("0.010");
    // 10 * 1/3 = 3.33 -> 3
    expect(mulFilsRoundHalfUp(amount, 1n, 3n)).toBe(jodStringToFils("0.003"));
  });

  it("handles negative amounts symmetrically", () => {
    const amount = jodStringToFils("-0.010");
    expect(mulFilsRoundHalfUp(amount, 1n, 3n)).toBe(jodStringToFils("-0.003"));
  });
});

describe("taxForLine — per-line rounding, never sum-then-tax", () => {
  it("computes 16% GST per line, rounded half-up", () => {
    expect(filsToJodString(taxForLine(jodStringToFils("10.000"), 1_600n))).toBe("1.600");
  });

  it("gives a different (and wrong) result if you sum net first and tax once", () => {
    // 3 lines of 0.003 JOD net. Taxing each line individually rounds each
    // line's tax down to zero; summing the net first and taxing once
    // rounds up to 1 fils instead. Per-line-then-sum is the required rule.
    const lineNet = jodStringToFils("0.003");
    const taxRate = 1_600n; // 16.00% in basis points

    const perLineTax = taxForLine(lineNet, taxRate);
    const totalTaxSummedPerLine = addFils(perLineTax, perLineTax, perLineTax);

    const summedNetFirst = addFils(lineNet, lineNet, lineNet);
    const taxOnSummedNet = taxForLine(summedNetFirst, taxRate);

    expect(filsToJodString(totalTaxSummedPerLine)).toBe("0.000");
    expect(filsToJodString(taxOnSummedNet)).toBe("0.001");
    expect(totalTaxSummedPerLine).not.toBe(taxOnSummedNet);
  });
});

describe("allocateFilsEvenly", () => {
  it("splits without losing or fabricating fils", () => {
    const total = jodStringToFils("10.000");
    const shares = allocateFilsEvenly(total, 3);
    expect(shares.map(filsToJodString)).toEqual(["3.334", "3.333", "3.333"]);
    expect(addFils(...shares)).toBe(total);
  });

  it("handles a total that divides evenly", () => {
    const total = jodStringToFils("9.000");
    const shares = allocateFilsEvenly(total, 3);
    expect(shares.every((s) => s === jodStringToFils("3.000"))).toBe(true);
  });

  it("throws for a non-positive count", () => {
    expect(() => allocateFilsEvenly(jodStringToFils("1.000"), 0)).toThrow();
  });
});

describe("compareFils", () => {
  it("orders amounts correctly", () => {
    expect(compareFils(jodStringToFils("1.000"), jodStringToFils("2.000"))).toBe(-1);
    expect(compareFils(jodStringToFils("2.000"), jodStringToFils("1.000"))).toBe(1);
    expect(compareFils(jodStringToFils("2.000"), jodStringToFils("2.000"))).toBe(0);
  });
});
