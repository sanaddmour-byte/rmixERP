/**
 * Generic UBL 2.1 Invoice document builder. The element set and codes used
 * here (UBLVersionID, InvoiceTypeCode 388/381/383, unit code "MTQ" for
 * cubic metres, the Supplier/Customer/TaxTotal/LegalMonetaryTotal/
 * InvoiceLine structure) are the public OASIS UBL 2.1 / UN-CEFACT
 * standard, not JoFotara-specific guesses. What JoFotara's own profile
 * does on top of plain UBL 2.1 (exact namespaces/extensions for the ICV
 * and QR code, the income-source-sequence field, any additional
 * mandatory elements) is NOT verified — those spots are marked
 * `// VERIFY:` and mirrored in docs/JOFOTARA-OPEN-QUESTIONS.md, per
 * CLAUDE.md's "never guess JoFotara/ISTD field formats" rule.
 */

export interface UblPartyInput {
  name: string;
  taxNumber: string | null;
}

export interface UblLineInput {
  id: string;
  description: string;
  quantityM3: string | null;
  unitPriceJod: string | null;
  netJod: string;
  taxRateBasisPoints: number;
  taxJod: string;
  totalJod: string;
}

export interface UblInvoiceInput {
  /** Reused as `cbc:UUID` — our own document id, never a separately generated one. */
  documentId: string;
  /** `cbc:ID` — our own gapless document number. */
  documentNumber: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  /** `YYYY-MM-DD` */
  issueDateIso: string;
  /** DOMAIN.md/PLAN.md's "per-income-source-sequence monotonic ICV". // VERIFY: exact element/placement for JoFotara's ICV — see docs/JOFOTARA-OPEN-QUESTIONS.md. */
  icv: number;
  currencyCode: string;
  supplier: UblPartyInput;
  customer: UblPartyInput;
  lines: UblLineInput[];
  subtotalJod: string;
  taxJod: string;
  totalJod: string;
}

// UN/CEFACT UNCL1001 document-name codes — public, not JoFotara-specific.
const INVOICE_TYPE_CODE: Record<UblInvoiceInput["documentType"], string> = {
  invoice: "388", // Tax invoice
  credit_note: "381", // Credit note
  debit_note: "383", // Debit note
};

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function partyXml(tag: "cac:AccountingSupplierParty" | "cac:AccountingCustomerParty", party: UblPartyInput): string {
  return `
  <${tag}>
    <cac:Party>
      ${party.taxNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(party.taxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(party.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </${tag}>`;
}

function lineXml(line: UblLineInput): string {
  return `
  <cac:InvoiceLine>
    <cbc:ID>${xmlEscape(line.id)}</cbc:ID>
    ${line.quantityM3 !== null ? `<cbc:InvoicedQuantity unitCode="MTQ">${xmlEscape(line.quantityM3)}</cbc:InvoicedQuantity>` : ""}
    <cbc:LineExtensionAmount currencyID="JOD">${xmlEscape(line.netJod)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="JOD">${xmlEscape(line.taxJod)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="JOD">${xmlEscape(line.taxJod)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${(line.taxRateBasisPoints / 100).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.description)}</cbc:Name>
    </cac:Item>
    ${line.unitPriceJod !== null ? `<cac:Price><cbc:PriceAmount currencyID="JOD">${xmlEscape(line.unitPriceJod)}</cbc:PriceAmount></cac:Price>` : ""}
  </cac:InvoiceLine>`;
}

export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  const lines = input.lines.map(lineXml).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${xmlEscape(input.documentNumber)}</cbc:ID>
  <cbc:UUID>${xmlEscape(input.documentId)}</cbc:UUID>
  <cbc:IssueDate>${xmlEscape(input.issueDateIso)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>${INVOICE_TYPE_CODE[input.documentType]}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${xmlEscape(input.currencyCode)}</cbc:DocumentCurrencyCode>
  <!-- VERIFY: JoFotara's income-source-sequence / ICV element and namespace — this AdditionalDocumentReference placement is a placeholder, not a verified JoFotara field (docs/JOFOTARA-OPEN-QUESTIONS.md). -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${input.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  ${partyXml("cac:AccountingSupplierParty", input.supplier)}
  ${partyXml("cac:AccountingCustomerParty", input.customer)}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="JOD">${xmlEscape(input.taxJod)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="JOD">${xmlEscape(input.subtotalJod)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="JOD">${xmlEscape(input.subtotalJod)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="JOD">${xmlEscape(input.totalJod)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="JOD">${xmlEscape(input.totalJod)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
}
