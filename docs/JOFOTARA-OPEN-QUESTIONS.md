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

## Hard blocker: `istd.gov.jo` is unreachable from this environment

The agentic session that most recently worked this list was given ISTD's
official procedure manual URL (`https://istd.gov.jo/ebv4.0/root_storage/en/eb_list_page/procedure_manual_for_linking_to_the_jordanian_national_electronic_invoicing_system.pdf`)
and attempted to fetch it twice, in two separate sessions. Both attempts
failed identically: `getaddrinfo ENOTFOUND istd.gov.jo` — the domain does
not resolve from this environment's network, because it is outside the
session's allowed outbound domains (an environment-level network policy,
not something fixable from inside the session). No ISTD sandbox account
was available either. **None of the 9 open questions below were advanced
by that attempt** — do not read the rest of this document as "checked
against the manual and still unresolved"; it is "never actually read."

To close this out: either (a) add `istd.gov.jo` (and any ISTD API
subdomain the manual turns out to specify) to the environment's allowed
network domains and re-run the fetch, (b) download the manual outside this
environment and paste its relevant sections into a session with no network
restriction on reading pasted text, or (c) obtain ISTD sandbox credentials
and point a session at them directly. Only one of these — not a vendor
blog, not a general description of JoFotara — resolves the questions
below.

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

## What was fixed independently of the above (no ISTD access needed)

None of these touch the 9 open questions — they're provider-agnostic
robustness/workflow gaps a review found, fixed without knowing ISTD's
actual field formats:

- **Rejected documents had no way back.** `rejected` was effectively a
  dead end — the invoice state machine already allowed `rejected ->
  draft` but no route ever used it, and the UI showed no action at all
  for a rejected row. Added `POST /invoices/{id}/correct-and-resubmit`,
  `/credit-notes/{id}/correct-and-resubmit`, `/debit-notes/{id}/correct-
  and-resubmit` (`apps/api/src/clearance/service.ts`'s
  `correctAndResubmit*` functions) — audited, resets the attempt counter
  for a fresh retry/backoff cycle, reuses the same ICV (still the fiscal
  document's identity, not the attempt's). A "Correct & resubmit" button
  now appears on the clearance queue for rejected rows. This only reopens
  the *submission* path — it cannot fix *why* a document was rejected,
  since this system has no capability to edit an invoice's line items/
  amounts once created at all (a separate, pre-existing gap, not
  something to improvise a design for here).
- **No request timeout.** `JoFotaraProvider.submit`'s `fetch` call had no
  `AbortController`/timeout — a hung connection would wait indefinitely
  rather than failing into the bounded-retry path. Added a 30s default
  timeout (configurable via `JoFotaraConfig.timeoutMs`), verified with a
  test server that accepts the connection and never responds
  (`apps/api/test/jofotaraProvider.test.ts`).
- **Simulation was invisible.** Nothing told an operator that
  `MockClearanceProvider` — not real ISTD clearance — was active.
  `MockClearanceProvider`'s QR/reference already carried a `MOCK-` prefix,
  but that's only visible on a document that already cleared, and easy to
  miss. Added `GET /clearance-provider-info` and a persistent "Simulated
  clearance" banner on the clearance queue screen whenever
  `CLEARANCE_PROVIDER=jofotara` isn't set.
