import { describe, expect, it } from "vitest";
import { accountBalance, assertJournalEntryBalanced, normalBalanceSide } from "../src/journalEntry";
import { fils } from "../src/money";

describe("assertJournalEntryBalanced", () => {
  it("accepts a simple balanced two-line entry", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "cash", debitFils: 1000n, creditFils: 0n },
        { accountId: "revenue", debitFils: 0n, creditFils: 1000n },
      ]),
    ).not.toThrow();
  });

  it("accepts a balanced multi-line entry (one debit split across several credits)", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "inventory", debitFils: 1000n, creditFils: 0n },
        { accountId: "ap", debitFils: 0n, creditFils: 600n },
        { accountId: "cash", debitFils: 0n, creditFils: 400n },
      ]),
    ).not.toThrow();
  });

  it("rejects an entry where debits and credits don't sum to the same total", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "cash", debitFils: 1000n, creditFils: 0n },
        { accountId: "revenue", debitFils: 0n, creditFils: 900n },
      ]),
    ).toThrow(/does not balance/);
  });

  it("rejects a line carrying both a debit and a credit", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "cash", debitFils: 500n, creditFils: 500n },
        { accountId: "revenue", debitFils: 0n, creditFils: 500n },
      ]),
    ).toThrow(/debit-only or credit-only/);
  });

  it("rejects a line carrying neither a debit nor a credit", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "cash", debitFils: 0n, creditFils: 0n },
        { accountId: "revenue", debitFils: 0n, creditFils: 0n },
      ]),
    ).toThrow(/debit-only or credit-only/);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      assertJournalEntryBalanced([
        { accountId: "cash", debitFils: -100n, creditFils: 0n },
        { accountId: "revenue", debitFils: 0n, creditFils: -100n },
      ]),
    ).toThrow(/cannot be negative/);
  });

  it("rejects an entry with fewer than two lines", () => {
    expect(() => assertJournalEntryBalanced([{ accountId: "cash", debitFils: 100n, creditFils: 0n }])).toThrow(
      /at least two lines/,
    );
  });
});

describe("normalBalanceSide / accountBalance", () => {
  it("asset and expense accounts are debit-normal", () => {
    expect(normalBalanceSide("asset")).toBe("debit");
    expect(normalBalanceSide("expense")).toBe("debit");
  });

  it("liability, equity, and revenue accounts are credit-normal", () => {
    expect(normalBalanceSide("liability")).toBe("credit");
    expect(normalBalanceSide("equity")).toBe("credit");
    expect(normalBalanceSide("revenue")).toBe("credit");
  });

  it("a debit-normal account with more debits than credits has a positive balance", () => {
    expect(accountBalance("asset", fils(1000n), fils(300n))).toBe(fils(700n));
  });

  it("a credit-normal account with more credits than debits has a positive balance", () => {
    expect(accountBalance("liability", fils(200n), fils(900n))).toBe(fils(700n));
  });

  it("goes negative when an account moves against its normal side", () => {
    expect(accountBalance("liability", fils(900n), fils(200n))).toBe(fils(-700n));
  });
});
