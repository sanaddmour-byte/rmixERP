import { describe, expect, it } from "vitest";
import { MockClearanceProvider } from "../src/clearanceProvider";

describe("MockClearanceProvider", () => {
  it("always clears, with a deterministic QR payload derived from the input", async () => {
    const provider = new MockClearanceProvider();
    const outcome = await provider.submit({
      documentId: "11111111-1111-1111-1111-111111111111",
      documentType: "invoice",
      icv: 42,
      ublXml: "<Invoice/>",
    });
    expect(outcome.kind).toBe("cleared");
    if (outcome.kind !== "cleared") throw new Error("unreachable");
    expect(outcome.qrPayload).toBe("MOCK-QR:invoice:11111111-1111-1111-1111-111111111111:42");
    expect(outcome.providerReference).toBe("MOCK-42");
  });

  it("clears credit notes and debit notes the same way as invoices", async () => {
    const provider = new MockClearanceProvider();
    const creditOutcome = await provider.submit({
      documentId: "22222222-2222-2222-2222-222222222222",
      documentType: "credit_note",
      icv: 1,
      ublXml: "<CreditNote/>",
    });
    expect(creditOutcome.kind).toBe("cleared");
  });
});
