import { describe, expect, it } from "vitest";
import { fils } from "../src/money";
import { planFifoPaymentAllocation, validateManualPaymentAllocation } from "../src/paymentAllocation";

describe("planFifoPaymentAllocation", () => {
  it("applies the payment to the earlier-due bill fully before spilling into the later one", () => {
    const result = planFifoPaymentAllocation(fils(1500n), [
      { vendorBillId: "later", dueDate: new Date("2026-02-01"), outstandingFils: fils(1000n) },
      { vendorBillId: "earlier", dueDate: new Date("2026-01-01"), outstandingFils: fils(1000n) },
    ]);
    expect(result.lines).toEqual([
      { vendorBillId: "earlier", amountFils: fils(1000n) },
      { vendorBillId: "later", amountFils: fils(500n) },
    ]);
    expect(result.unallocatedFils).toBe(fils(0n));
  });

  it("leaves a remainder unallocated when the payment exceeds total outstanding", () => {
    const result = planFifoPaymentAllocation(fils(2000n), [
      { vendorBillId: "a", dueDate: new Date("2026-01-01"), outstandingFils: fils(500n) },
    ]);
    expect(result.lines).toEqual([{ vendorBillId: "a", amountFils: fils(500n) }]);
    expect(result.unallocatedFils).toBe(fils(1500n));
  });

  it("skips a bill with zero outstanding", () => {
    const result = planFifoPaymentAllocation(fils(500n), [
      { vendorBillId: "settled", dueDate: new Date("2026-01-01"), outstandingFils: fils(0n) },
      { vendorBillId: "open", dueDate: new Date("2026-02-01"), outstandingFils: fils(500n) },
    ]);
    expect(result.lines).toEqual([{ vendorBillId: "open", amountFils: fils(500n) }]);
  });
});

describe("validateManualPaymentAllocation", () => {
  const outstanding = new Map([
    ["a", fils(1000n)],
    ["b", fils(500n)],
  ]);

  it("accepts a valid plan", () => {
    const result = validateManualPaymentAllocation(fils(1000n), [{ vendorBillId: "a", amountFils: fils(1000n) }], outstanding);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty plan", () => {
    const result = validateManualPaymentAllocation(fils(100n), [], outstanding);
    expect(result).toEqual({ ok: false, reason: "At least one allocation line is required." });
  });

  it("rejects a duplicate vendor bill", () => {
    const result = validateManualPaymentAllocation(
      fils(100n),
      [
        { vendorBillId: "a", amountFils: fils(50n) },
        { vendorBillId: "a", amountFils: fils(50n) },
      ],
      outstanding,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an allocation exceeding the bill's outstanding balance", () => {
    const result = validateManualPaymentAllocation(fils(1000n), [{ vendorBillId: "b", amountFils: fils(600n) }], outstanding);
    expect(result.ok).toBe(false);
  });

  it("rejects a bill not open for allocation", () => {
    const result = validateManualPaymentAllocation(fils(100n), [{ vendorBillId: "unknown", amountFils: fils(100n) }], outstanding);
    expect(result.ok).toBe(false);
  });

  it("rejects a total exceeding the payment amount", () => {
    const result = validateManualPaymentAllocation(
      fils(100n),
      [
        { vendorBillId: "a", amountFils: fils(60n) },
        { vendorBillId: "b", amountFils: fils(60n) },
      ],
      outstanding,
    );
    expect(result.ok).toBe(false);
  });
});
