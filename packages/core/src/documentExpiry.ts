/**
 * Equipment/driver document-expiry check (PLAN.md Phase 10): a truck or
 * driver with an already-expired license/registration/insurance/inspection
 * document blocks assignment to a delivery at dispatch — mirroring
 * `creditCheck.ts`'s blocked/override shape rather than inventing a new
 * one. A document within `warningDays` of expiring is surfaced as a
 * warning (informational, never blocking) so back-office staff can renew
 * ahead of the actual block.
 */

export type DocumentExpiryLabel = "truck.registration" | "truck.insurance" | "truck.inspection" | "driver.license";

export interface DocumentExpiryCheckInput {
  asOf: Date;
  /** Days-before-expiry at which a still-valid document starts showing as a warning. */
  warningDays: number;
  truck?: {
    registrationExpiresAt: Date | null;
    insuranceExpiresAt: Date | null;
    inspectionExpiresAt: Date | null;
  } | null;
  driver?: {
    licenseExpiresAt: Date | null;
  } | null;
}

export interface DocumentExpiryCheckResult {
  blocked: boolean;
  expiredDocuments: DocumentExpiryLabel[];
  warningDocuments: DocumentExpiryLabel[];
}

function classify(
  label: DocumentExpiryLabel,
  expiresAt: Date | null | undefined,
  asOf: Date,
  warningDays: number,
  expired: DocumentExpiryLabel[],
  warning: DocumentExpiryLabel[],
): void {
  if (!expiresAt) return;
  if (expiresAt.getTime() < asOf.getTime()) {
    expired.push(label);
    return;
  }
  const warningThresholdMs = asOf.getTime() + warningDays * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() <= warningThresholdMs) {
    warning.push(label);
  }
}

/** A document with no expiry date on file is treated as fine (not tracked, not blocking) — a documented minimum, not a guessed default. */
export function evaluateDocumentExpiry(input: DocumentExpiryCheckInput): DocumentExpiryCheckResult {
  const expiredDocuments: DocumentExpiryLabel[] = [];
  const warningDocuments: DocumentExpiryLabel[] = [];

  if (input.truck) {
    classify("truck.registration", input.truck.registrationExpiresAt, input.asOf, input.warningDays, expiredDocuments, warningDocuments);
    classify("truck.insurance", input.truck.insuranceExpiresAt, input.asOf, input.warningDays, expiredDocuments, warningDocuments);
    classify("truck.inspection", input.truck.inspectionExpiresAt, input.asOf, input.warningDays, expiredDocuments, warningDocuments);
  }
  if (input.driver) {
    classify("driver.license", input.driver.licenseExpiresAt, input.asOf, input.warningDays, expiredDocuments, warningDocuments);
  }

  return { blocked: expiredDocuments.length > 0, expiredDocuments, warningDocuments };
}
