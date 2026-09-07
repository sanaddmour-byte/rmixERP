import { describe, expect, it } from "vitest";
import { jodStringToFils } from "../src/money";
import { evaluateCreditCheck } from "../src/creditCheck";

describe("evaluateCreditCheck", () => {
  it("is always ok under policy none, even far over the limit", () => {
    const result = evaluateCreditCheck({
      policy: "none",
      creditLimitFils: jodStringToFils("1000.000"),
      currentOutstandingFils: jodStringToFils("900.000"),
      newOrderAmountFils: jodStringToFils("500.000"),
    });
    expect(result.outcome).toBe("ok");
    expect(result.exceedsByFils).toBe(jodStringToFils("0.000"));
  });

  it("is ok when the projected total is within the limit", () => {
    const result = evaluateCreditCheck({
      policy: "block",
      creditLimitFils: jodStringToFils("1000.000"),
      currentOutstandingFils: jodStringToFils("400.000"),
      newOrderAmountFils: jodStringToFils("500.000"),
    });
    expect(result.outcome).toBe("ok");
    expect(result.projectedOutstandingFils).toBe(jodStringToFils("900.000"));
  });

  it("is ok exactly at the limit (not exceeding)", () => {
    const result = evaluateCreditCheck({
      policy: "block",
      creditLimitFils: jodStringToFils("1000.000"),
      currentOutstandingFils: jodStringToFils("500.000"),
      newOrderAmountFils: jodStringToFils("500.000"),
    });
    expect(result.outcome).toBe("ok");
  });

  it("warns but does not block under policy warning", () => {
    const result = evaluateCreditCheck({
      policy: "warning",
      creditLimitFils: jodStringToFils("1000.000"),
      currentOutstandingFils: jodStringToFils("900.000"),
      newOrderAmountFils: jodStringToFils("500.000"),
    });
    expect(result.outcome).toBe("warning");
    expect(result.exceedsByFils).toBe(jodStringToFils("400.000"));
  });

  it("blocks under policy block when the limit is exceeded", () => {
    const result = evaluateCreditCheck({
      policy: "block",
      creditLimitFils: jodStringToFils("1000.000"),
      currentOutstandingFils: jodStringToFils("900.000"),
      newOrderAmountFils: jodStringToFils("500.000"),
    });
    expect(result.outcome).toBe("blocked");
    expect(result.exceedsByFils).toBe(jodStringToFils("400.000"));
    expect(result.projectedOutstandingFils).toBe(jodStringToFils("1400.000"));
  });
});
