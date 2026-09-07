import { describe, expect, it } from "vitest";
import { evaluateCubeTest } from "../src/qc";

describe("evaluateCubeTest", () => {
  it("passes at the design age when the average meets the characteristic strength", () => {
    const result = evaluateCubeTest({
      specimenStrengthsMpa: [31, 32, 33],
      ageDays: 28,
      designAgeDays: 28,
      characteristicStrengthMpa: 30,
    });
    expect(result.averageStrengthMpa).toBe(32);
    expect(result.pass).toBe(true);
  });

  it("fails at the design age when the average is below the characteristic strength", () => {
    const result = evaluateCubeTest({
      specimenStrengthsMpa: [25, 26, 24],
      ageDays: 28,
      designAgeDays: 28,
      characteristicStrengthMpa: 30,
    });
    expect(result.averageStrengthMpa).toBeCloseTo(25);
    expect(result.pass).toBe(false);
  });

  it("passes exactly at the boundary (average equal to characteristic strength)", () => {
    const result = evaluateCubeTest({
      specimenStrengthsMpa: [30, 30, 30],
      ageDays: 28,
      designAgeDays: 28,
      characteristicStrengthMpa: 30,
    });
    expect(result.pass).toBe(true);
  });

  it("does not render a verdict before the design age", () => {
    const result = evaluateCubeTest({
      specimenStrengthsMpa: [18, 19, 20],
      ageDays: 7,
      designAgeDays: 28,
      characteristicStrengthMpa: 30,
    });
    expect(result.averageStrengthMpa).toBe(19);
    expect(result.pass).toBeNull();
  });

  it("respects a configurable design age", () => {
    const result = evaluateCubeTest({
      specimenStrengthsMpa: [40, 41, 42],
      ageDays: 56,
      designAgeDays: 56,
      characteristicStrengthMpa: 40,
    });
    expect(result.pass).toBe(true);
  });

  it("throws on an empty specimen list", () => {
    expect(() =>
      evaluateCubeTest({ specimenStrengthsMpa: [], ageDays: 28, designAgeDays: 28, characteristicStrengthMpa: 30 }),
    ).toThrow(/at least one specimen/);
  });

  it("throws on a negative specimen strength", () => {
    expect(() =>
      evaluateCubeTest({
        specimenStrengthsMpa: [30, -1],
        ageDays: 28,
        designAgeDays: 28,
        characteristicStrengthMpa: 30,
      }),
    ).toThrow(/cannot be negative/);
  });
});
