import type { ClearanceOutcome, ClearanceProvider, ClearanceSubmissionInput } from "@rmixerp/core";

/**
 * Real JoFotara/ISTD submission shell. Built against `ClearanceProvider`
 * only — it is NOT wired up as the active provider anywhere yet (see
 * `../providerFactory.ts`, which defaults to `MockClearanceProvider` and
 * only selects this one when `CLEARANCE_PROVIDER=jofotara` is explicitly
 * set). Every field below marked `// VERIFY:` is not confirmed against
 * ISTD's real technical specification — see docs/JOFOTARA-OPEN-QUESTIONS.md.
 * What IS grounded (general public/vendor documentation, not primary ISTD
 * docs): JoFotara is a real-time clearance system built on UBL 2.1, using
 * client-id/secret authentication, that accepts the invoice XML
 * Base64-encoded inside a JSON body (not a raw file upload) and returns a
 * QR payload once cleared.
 */

export interface JoFotaraConfig {
  /** // VERIFY: real intake endpoint base URL. */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export class JoFotaraProvider implements ClearanceProvider {
  constructor(private readonly config: JoFotaraConfig) {}

  async submit(input: ClearanceSubmissionInput): Promise<ClearanceOutcome> {
    // VERIFY: exact intake path — placeholder mirrors vendor docs' generic
    // "invoices" intake resource, not a confirmed ISTD path.
    const url = `${this.config.baseUrl}/invoices`;
    // VERIFY: exact JSON body shape and field name for the Base64 XML
    // payload — "invoice" is a placeholder key, not a confirmed field name.
    const body = JSON.stringify({ invoice: Buffer.from(input.ublXml, "utf8").toString("base64") });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // VERIFY: real auth scheme — ISTD docs describe client-id/secret
          // OAuth2, but the exact token endpoint, grant type, and whether
          // credentials are sent as a bearer token vs. dedicated headers
          // is not confirmed.
          "Client-Id": this.config.clientId,
          "Secret-Key": this.config.clientSecret,
        },
        body,
      });
    } catch (err: unknown) {
      return { kind: "transport_error", reason: err instanceof Error ? err.message : "network error" };
    }

    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return { kind: "transport_error", reason: `provider returned ${response.status}` };
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      // VERIFY: real rejection-reason field name/shape.
      const reason =
        payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `provider rejected the submission (status ${response.status})`;
      return { kind: "rejected", reason, responsePayload: payload };
    }

    // VERIFY: real success-response field names for the QR payload and
    // any provider-side tracking reference.
    const qrPayload =
      payload && typeof payload === "object" && "qrCode" in payload && typeof payload.qrCode === "string" ? payload.qrCode : null;
    const providerReference =
      payload && typeof payload === "object" && "invoiceId" in payload && typeof payload.invoiceId === "string"
        ? payload.invoiceId
        : null;

    if (!qrPayload) {
      return { kind: "transport_error", reason: "provider response did not include a recognizable QR payload" };
    }

    return { kind: "cleared", qrPayload, providerReference, responsePayload: payload };
  }
}
