import { describe, expect, it } from "vitest";
import { fils } from "../src/money";
import {
  deriveInvoiceStatusFromAllocations,
  isInvoiceOpenForAllocation,
  planFifoAllocation,
  validateManualAllocation,
} from "../src/collectionAllocation";

describe("planFifoAllocation", () => {
  it("applies the collection to the earliest-due invoice first, fully, before moving to the next", () => {
    const { lines, unallocatedFils } = planFifoAllocation(fils(150_000n), [
      { invoiceId: "b", dueDate: new Date("2026-02-01"), outstandingFils: fils(100_000n) },
      { invoiceId: "a", dueDate: new Date("2026-01-01"), outstandingFils: fils(80_000n) },
    ]);
    expect(lines).toEqual([
      { invoiceId: "a", amountFils: fils(80_000n) },
      { invoiceId: "b", amountFils: fils(70_000n) },
    ]);
    expect(unallocatedFils).toBe(fils(0n));
  });

  it("leaves a remainder unallocated when the collection exceeds total outstanding", () => {
    const { lines, unallocatedFils } = planFifoAllocation(fils(200_000n), [
      { invoiceId: "a", dueDate: new Date("2026-01-01"), outstandingFils: fils(50_000n) },
    ]);
    expect(lines).toEqual([{ invoiceId: "a", amountFils: fils(50_000n) }]);
    expect(unallocatedFils).toBe(fils(150_000n));
  });

  it("skips invoices with zero or negative outstanding", () => {
    const { lines } = planFifoAllocation(fils(10_000n), [
      { invoiceId: "a", dueDate: new Date("2026-01-01"), outstandingFils: fils(0n) },
      { invoiceId: "b", dueDate: new Date("2026-02-01"), outstandingFils: fils(10_000n) },
    ]);
    expect(lines).toEqual([{ invoiceId: "b", amountFils: fils(10_000n) }]);
  });

  it("returns no lines and the full amount unallocated when there are no open invoices", () => {
    const { lines, unallocatedFils } = planFifoAllocation(fils(10_000n), []);
    expect(lines).toEqual([]);
    expect(unallocatedFils).toBe(fils(10_000n));
  });
});

describe("validateManualAllocation", () => {
  const outstanding = new Map([
    ["a", fils(50_000n)],
    ["b", fils(30_000n)],
  ]);

  it("accepts a valid plan that doesn't exceed the collection amount or any invoice's balance", () => {
    const result = validateManualAllocation(fils(60_000n), [
      { invoiceId: "a", amountFils: fils(40_000n) },
      { invoiceId: "b", amountFils: fils(20_000n) },
    ], outstanding);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty plan", () => {
    const result = validateManualAllocation(fils(10_000n), [], outstanding);
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate invoice id", () => {
    const result = validateManualAllocation(
      fils(50_000n),
      [
        { invoiceId: "a", amountFils: fils(20_000n) },
        { invoiceId: "a", amountFils: fils(20_000n) },
      ],
      outstanding,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an allocation exceeding the invoice's outstanding balance", () => {
    const result = validateManualAllocation(fils(100_000n), [{ invoiceId: "a", amountFils: fils(60_000n) }], outstanding);
    expect(result.ok).toBe(false);
  });

  it("rejects a total exceeding the collection amount", () => {
    const result = validateManualAllocation(
      fils(10_000n),
      [
        { invoiceId: "a", amountFils: fils(6_000n) },
        { invoiceId: "b", amountFils: fils(6_000n) },
      ],
      outstanding,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invoice id not present in the outstanding map", () => {
    const result = validateManualAllocation(fils(10_000n), [{ invoiceId: "z", amountFils: fils(5_000n) }], outstanding);
    expect(result.ok).toBe(false);
  });

  it("rejects a zero or negative allocation line", () => {
    const result = validateManualAllocation(fils(10_000n), [{ invoiceId: "a", amountFils: fils(0n) }], outstanding);
    expect(result.ok).toBe(false);
  });
});

describe("deriveInvoiceStatusFromAllocations", () => {
  it("stays issued when nothing is allocated", () => {
    expect(deriveInvoiceStatusFromAllocations(fils(100_000n), fils(0n))).toBe("issued");
  });

  it("is partially_paid when allocated is between zero and the total", () => {
    expect(deriveInvoiceStatusFromAllocations(fils(100_000n), fils(40_000n))).toBe("partially_paid");
  });

  it("is paid once allocated meets or exceeds the total", () => {
    expect(deriveInvoiceStatusFromAllocations(fils(100_000n), fils(100_000n))).toBe("paid");
    expect(deriveInvoiceStatusFromAllocations(fils(100_000n), fils(120_000n))).toBe("paid");
  });
});

describe("isInvoiceOpenForAllocation", () => {
  it("is true only for issued and partially_paid", () => {
    expect(isInvoiceOpenForAllocation("issued")).toBe(true);
    expect(isInvoiceOpenForAllocation("partially_paid")).toBe(true);
    expect(isInvoiceOpenForAllocation("paid")).toBe(false);
    expect(isInvoiceOpenForAllocation("draft")).toBe(false);
    expect(isInvoiceOpenForAllocation("cleared")).toBe(false);
  });
});
