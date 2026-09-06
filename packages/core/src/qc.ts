/**
 * Cube-test pass/fail evaluation (DOMAIN.md Invariant 6). A concrete
 * product's characteristic strength is, by definition, a 28-day figure
 * (or whatever `designAgeDays` the product specifies) — testing at an
 * earlier age (7-day is the common early indicator) is informational
 * only, not a formal pass/fail verdict, since strength keeps developing
 * up to the design age. This equates "when do we render a verdict" with
 * the product's own design age, which is standard industry practice, not
 * a guessed conversion formula (contrast with `inventory.ts`'s
 * `applyUniformMoistureAdjustment`, which *is* a documented placeholder).
 */
export interface CubeTestEvaluationInput {
  specimenStrengthsMpa: readonly number[];
  ageDays: number;
  designAgeDays: number;
  characteristicStrengthMpa: number;
}

export interface CubeTestEvaluationResult {
  averageStrengthMpa: number;
  /** null when `ageDays !== designAgeDays` — recorded but not evaluated. */
  pass: boolean | null;
}

export function evaluateCubeTest(input: CubeTestEvaluationInput): CubeTestEvaluationResult {
  if (input.specimenStrengthsMpa.length === 0) {
    throw new Error("evaluateCubeTest: at least one specimen strength is required");
  }
  for (const strength of input.specimenStrengthsMpa) {
    if (strength < 0) {
      throw new Error("evaluateCubeTest: specimen strength cannot be negative");
    }
  }
  const averageStrengthMpa =
    input.specimenStrengthsMpa.reduce((sum, strength) => sum + strength, 0) / input.specimenStrengthsMpa.length;
  const pass = input.ageDays === input.designAgeDays ? averageStrengthMpa >= input.characteristicStrengthMpa : null;
  return { averageStrengthMpa, pass };
}
