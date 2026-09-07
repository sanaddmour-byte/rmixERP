/**
 * A clearance provider submits a fiscal document (invoice, credit note, or
 * debit note) to a government e-invoicing authority for real-time
 * validation ("clearance") and returns either a cleared result (with the
 * authority's QR payload) or a rejection/transport failure. This interface
 * is deliberately provider-agnostic — Jordan's JoFotara/ISTD system is the
 * only real implementation planned, but nothing here assumes its specific
 * field formats. See `apps/api/src/clearance/jofotara/` for that shell and
 * `docs/JOFOTARA-OPEN-QUESTIONS.md` for what in it is still unverified.
 */

export interface ClearanceSubmissionInput {
  /** Our own document id (invoice/credit-note/debit-note primary key) — reused as the UBL document UUID, never a separately generated one. */
  documentId: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  /** The gapless, monotonically increasing counter value this submission was allocated (DOMAIN.md/PLAN.md's "per-income-source-sequence monotonic ICV"). */
  icv: number;
  /** A fully-formed UBL 2.1 XML document (`packages/core`'s / the API layer's UBL builder). */
  ublXml: string;
}

export type ClearanceOutcome =
  /** The authority validated and cleared the document. */
  | { kind: "cleared"; qrPayload: string; providerReference: string | null; responsePayload: unknown }
  /** The authority validated the document and rejected it on business grounds (bad data, wrong tax number, etc.) — terminal, never auto-retried (CLAUDE.md/PLAN.md). */
  | { kind: "rejected"; reason: string; responsePayload: unknown }
  /** The submission never reached a validation verdict (network failure, timeout, 5xx, auth failure) — eligible for bounded exponential-backoff retry. */
  | { kind: "transport_error"; reason: string };

export interface ClearanceProvider {
  submit(input: ClearanceSubmissionInput): Promise<ClearanceOutcome>;
}

/**
 * Default provider (CLAUDE.md/PLAN.md: "MockClearanceProvider (default)").
 * Deterministically clears every submission — no network call, no
 * unverified field mapping — so the rest of the clearance pipeline
 * (state transitions, retry accounting, the admin queue) is fully
 * exercisable and testable without a real JoFotara account. Never wired
 * to production traffic once a real provider is configured; see
 * `apps/api/src/clearance/providerFactory.ts`.
 */
export class MockClearanceProvider implements ClearanceProvider {
  async submit(input: ClearanceSubmissionInput): Promise<ClearanceOutcome> {
    await Promise.resolve();
    return {
      kind: "cleared",
      qrPayload: `MOCK-QR:${input.documentType}:${input.documentId}:${input.icv}`,
      providerReference: `MOCK-${input.icv}`,
      responsePayload: { mock: true, documentId: input.documentId, icv: input.icv },
    };
  }
}
