import { describe, expect, it } from "vitest";
import { computeRetryDelayMs, MAX_CLEARANCE_ATTEMPTS } from "../src/clearanceRetry";

describe("computeRetryDelayMs", () => {
  it("doubles the delay for each successive attempt", () => {
    expect(computeRetryDelayMs(1)).toBe(30_000);
    expect(computeRetryDelayMs(2)).toBe(60_000);
    expect(computeRetryDelayMs(3)).toBe(120_000);
    expect(computeRetryDelayMs(4)).toBe(240_000);
  });

  it("caps the delay at 30 minutes", () => {
    expect(computeRetryDelayMs(7)).toBe(30 * 60_000);
  });

  it("returns null once MAX_CLEARANCE_ATTEMPTS is reached, stopping auto-retry", () => {
    expect(computeRetryDelayMs(MAX_CLEARANCE_ATTEMPTS)).toBeNull();
    expect(computeRetryDelayMs(MAX_CLEARANCE_ATTEMPTS + 1)).toBeNull();
  });

  it("never returns a delay for the attempt right before the cap", () => {
    expect(computeRetryDelayMs(MAX_CLEARANCE_ATTEMPTS - 1)).not.toBeNull();
  });
});
