import { fils, filsToJodString } from "@rmixerp/core";
import type { UblInvoiceInput, UblLineInput } from "../ubl";

/**
 * Maps our domain rows to the generic UBL input (`../ubl.ts`). Business
 * meaning that's ISTD/JoFotara-specific rather than plain UBL — which
 * activity number a branch submits under, how the seller's registered
 * "income source" maps to our single-company model — is marked
 * `// VERIFY:` (docs/JOFOTARA-OPEN-QUESTIONS.md), not guessed.
 */

export interface ClearableDocumentInput {
  id: string;
  documentNumber: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  issuedAt: Date;
  icv: number;
  supplierName: string;
  supplierTaxNumber: string | null;
  customerName: string;
  customerTaxNumber: string | null;
  subtotalFils: bigint;
  taxFils: bigint;
  totalFils: bigint;
  lines: {
    id: string;
    description: string;
    quantityM3: string | null;
    unitPriceFils: bigint | null;
    netFils: bigint;
    taxRateBasisPoints: number;
    taxFils: bigint;
    totalFils: bigint;
  }[];
}

function mapLine(line: ClearableDocumentInput["lines"][number]): UblLineInput {
  return {
    id: line.id,
    description: line.description,
    quantityM3: line.quantityM3,
    unitPriceJod: line.unitPriceFils !== null ? filsToJodString(fils(line.unitPriceFils)) : null,
    netJod: filsToJodString(fils(line.netFils)),
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxJod: filsToJodString(fils(line.taxFils)),
    totalJod: filsToJodString(fils(line.totalFils)),
  };
}

export function toUblInvoiceInput(doc: ClearableDocumentInput): UblInvoiceInput {
  return {
    documentId: doc.id,
    documentNumber: doc.documentNumber,
    documentType: doc.documentType,
    issueDateIso: doc.issuedAt.toISOString().slice(0, 10),
    icv: doc.icv,
    currencyCode: "JOD",
    // VERIFY: whether JoFotara wants the seller's registered "activity
    // number" alongside/instead of the tax number here — not modeled in
    // our schema yet, since it wasn't needed before this phase.
    supplier: { name: doc.supplierName, taxNumber: doc.supplierTaxNumber },
    customer: { name: doc.customerName, taxNumber: doc.customerTaxNumber },
    lines: doc.lines.map(mapLine),
    subtotalJod: filsToJodString(fils(doc.subtotalFils)),
    taxJod: filsToJodString(fils(doc.taxFils)),
    totalJod: filsToJodString(fils(doc.totalFils)),
  };
}
