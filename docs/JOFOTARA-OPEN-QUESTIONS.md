# JoFotara / ISTD open questions

Created in Phase 7 (Clearance), per `CLAUDE.md`'s rule: never guess
JoFotara/ISTD field formats — mark unverified fields `// VERIFY:` in code
and list them here instead. `JoFotaraProvider`
(`apps/api/src/clearance/jofotara/provider.ts`) is a shell built against the
`ClearanceProvider` interface; it is **not** the active provider in any
environment today — `MockClearanceProvider` is, via
`apps/api/src/clearance/providerFactory.ts`, until these are resolved and the
shell is verified against ISTD's real technical specification (or a sandbox
account).

## What is grounded (general public/vendor documentation, not primary ISTD docs)

- JoFotara is Jordan's National E-Invoicing System, operated by the Income
  and Sales Tax Department (ISTD). Phase 2 (real-time clearance, mandatory)
  went live 1 April 2025 under the Amended Billing and Control Regulation
  No. 2 of 2025.
- It uses a UBL 2.1 based document format and a continuous-transaction-
  control (CTC) clearance model — the authority validates every invoice in
  real time before it's legally valid.
- Submission uses client-id/secret credentials, and the UBL XML is sent
  Base64-encoded as a field inside a JSON request body, not as a raw XML
  file upload.
- The authority maintains a gap-free ICV (Invoice Counter Value) and
  returns a QR payload once an invoice is cleared.

Sources (secondary/vendor, not ISTD's own technical spec — treat as
directional, not authoritative):
- https://mozon-tech.com/en/blog/the-ultimate-guide-to-jofotara/
- https://jo.invoiceq.com/en/e-invoicing/connecting-to-jofotara/
- https://orchidatax.com/countries-compliance/jordan-e-invoicing-compliance/
- https://tax2gov.com/jordan-jofotara-e-invoicing-api/

## Open questions (must be resolved from ISTD's real technical spec or a sandbox account before `JoFotaraProvider` is ever pointed at production)

1. **Intake endpoint.** Real base URL and path (`provider.ts` uses a
   placeholder `{baseUrl}/invoices`).
2. **Auth flow.** Whether client-id/secret is exchanged for a bearer token
   via a separate OAuth2 token endpoint (grant type, scope), or sent
   directly as request headers on each submission (`provider.ts` currently
   sends `Client-Id`/`Secret-Key` headers directly — a placeholder, not
   confirmed).
3. **Request body shape.** The exact JSON key for the Base64-encoded UBL
   XML (`provider.ts` uses `"invoice"` as a placeholder key), and whether
   any other fields are required alongside it.
4. **Response shape on success.** Field names for the returned QR payload
   and any provider-side tracking/reference id (`provider.ts` reads
   `qrCode`/`invoiceId` as placeholders).
5. **Response shape on business rejection vs. transport failure.** What
   HTTP status codes and body shape distinguish "the authority validated
   and rejected this invoice" (terminal, DOMAIN.md/PLAN.md) from "the
   request never reached validation" (retryable). `provider.ts` currently
   treats 5xx/408/429 as transport errors and any other non-2xx as a
   rejection — this is a reasonable default, not a confirmed contract.
6. **ICV / income-source-sequence placement in the XML.** `ubl.ts` places
   it in a placeholder `cac:AdditionalDocumentReference` element — the real
   JoFotara UBL profile almost certainly has a specific, different
   extension point for this.
7. **Seller identification.** Whether JoFotara wants the seller's tax
   number, a separate "activity number" (registered economic activity),
   or both, and where each goes in the XML. Our schema currently only has
   `company.taxNumber` — no `activityNumber` field exists yet; add one
   once this is confirmed rather than guessing a value into `taxNumber`.
8. **Credit/debit note document shape.** Whether JoFotara expects a
   separate UBL `CreditNote`/`DebitNote` root document, or (as `ubl.ts`
   currently assumes) a single `Invoice` root with `InvoiceTypeCode`
   381/383 distinguishing them. Both patterns exist across real-world
   e-invoicing systems; not confirmed for JoFotara specifically.
9. **QR payload format.** Whether the QR payload JoFotara returns is
   meant to be rendered as-is (a pre-built QR image/string) or built
   client-side from returned fields (TLV-encoded, as some other national
   e-invoicing systems require). `qrPayload` is currently stored and
   surfaced verbatim as returned.

## How to close these out

Resolve each item against ISTD's actual technical integration guide (or a
sandbox/test account with real request/response captures), update
`apps/api/src/clearance/jofotara/{provider,mapping}.ts` and `../ubl.ts`
accordingly, remove the corresponding `// VERIFY:` comment, and delete the
question from this file. Do not mark an item resolved from secondary
sources (vendor blog posts, marketing pages) — the whole point of this
list is that only ISTD's own spec (or verified sandbox behavior) counts.
