/**
 * Quantities (e.g. m3 of concrete) are scaled by 1000 into an integer
 * "milli-units" bigint, the same convention `Fils` uses for money — never a
 * float. Use `mulFilsRoundHalfUp(unitPriceFils, quantityMilliUnits, 1000n)`
 * to price a quantity without floating point.
 */
import { InputParseError } from "./errors";

const MILLI_PER_UNIT = 1000n;

export function decimalStringToMilliUnits(input: string): bigint {
  const trimmed = input.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match) {
    throw new InputParseError(`Invalid decimal quantity: "${input}" — expected a decimal number with up to 3 decimal places, e.g. "12.500".`);
  }
  const [, sign = "", whole = "0", fraction = ""] = match;
  const paddedFraction = fraction.padEnd(3, "0");
  const magnitude = BigInt(whole) * MILLI_PER_UNIT + BigInt(paddedFraction);
  return sign === "-" ? -magnitude : magnitude;
}

export function milliUnitsToDecimalString(amount: bigint): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / MILLI_PER_UNIT;
  const fraction = abs % MILLI_PER_UNIT;
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()}.${fraction.toString().padStart(3, "0")}`;
}
