/**
 * Money is always an integer count of fils (1 JOD = 1000 fils). Never
 * represent money as `number`/float anywhere in this codebase — construct
 * it only through `fils()`/`toFils()` and read it only through the
 * functions in this file.
 */
export type Fils = bigint & { readonly __brand: "Fils" };

const FILS_PER_JOD = 1000n;

export function fils(value: bigint): Fils {
  return value as Fils;
}

export const ZERO_FILS = fils(0n);

/** Parses a decimal JOD string (e.g. "1234.567" or "1234.5") into Fils, rejecting more than 3 decimal places. */
export function jodStringToFils(input: string): Fils {
  const trimmed = input.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid JOD amount: "${input}"`);
  }
  const [, sign = "", whole = "0", fraction = ""] = match;
  const paddedFraction = fraction.padEnd(3, "0");
  const magnitude = BigInt(whole) * FILS_PER_JOD + BigInt(paddedFraction);
  return fils(sign === "-" ? -magnitude : magnitude);
}

export function filsToJodString(amount: Fils): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / FILS_PER_JOD;
  const fraction = abs % FILS_PER_JOD;
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()}.${fraction.toString().padStart(3, "0")}`;
}

export function addFils(...amounts: Fils[]): Fils {
  return fils(amounts.reduce<bigint>((sum, a) => sum + a, 0n));
}

export function subFils(a: Fils, b: Fils): Fils {
  return fils(a - b);
}

export function negateFils(a: Fils): Fils {
  return fils(-a);
}

/**
 * Multiplies a fils amount by a rational factor (numerator/denominator),
 * rounding half-up to the nearest fils. Use this for tax-per-line and
 * quantity × unit-price computations — never floating point.
 */
export function mulFilsRoundHalfUp(
  amount: Fils,
  numerator: bigint,
  denominator: bigint,
): Fils {
  if (denominator === 0n) {
    throw new Error("mulFilsRoundHalfUp: denominator must not be zero");
  }
  const negative = (amount < 0n) !== (numerator < 0n);
  const absAmount = amount < 0n ? -amount : amount;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const product = absAmount * absNumerator;
  const twiceRemainder = (product % absDenominator) * 2n;
  let quotient = product / absDenominator;
  if (twiceRemainder >= absDenominator) {
    quotient += 1n;
  }
  return fils(negative ? -quotient : quotient);
}

/** Computes tax for a single line, rounded half-up to the fils. Callers must sum per-line tax, never sum-then-tax. */
export function taxForLine(lineNetAmount: Fils, taxRateBasisPoints: bigint): Fils {
  return mulFilsRoundHalfUp(lineNetAmount, taxRateBasisPoints, 10_000n);
}

/**
 * Splits a total into `count` shares that sum back exactly to the total,
 * distributing the remainder one fils at a time to the earliest shares.
 * Use this instead of naive division whenever an amount must be divided
 * without losing or fabricating fils (e.g. allocating a receipt evenly).
 */
export function allocateFilsEvenly(total: Fils, count: number): Fils[] {
  if (count <= 0) {
    throw new Error("allocateFilsEvenly: count must be positive");
  }
  const base = total / BigInt(count);
  const remainder = total - base * BigInt(count);
  const remainderAbs = remainder < 0n ? -remainder : remainder;
  const step = remainder < 0n ? -1n : 1n;
  return Array.from({ length: count }, (_, i) =>
    fils(base + (BigInt(i) < remainderAbs ? step : 0n)),
  );
}

export function isNegative(amount: Fils): boolean {
  return amount < 0n;
}

export function compareFils(a: Fils, b: Fils): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
