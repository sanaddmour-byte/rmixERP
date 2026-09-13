import { Router } from "express";
import { isNull } from "drizzle-orm";
import { company, driver, truck, withTenant } from "@rmixerp/db";
import { evaluateDocumentExpiry, type DocumentExpiryLabel } from "@rmixerp/core";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { queryString } from "../lib/params";

export const fleetOpsRouter = Router();

type DocumentField = "registration" | "insurance" | "inspection" | "license";

const LABEL_TO_FIELD: Record<DocumentExpiryLabel, DocumentField> = {
  "truck.registration": "registration",
  "truck.insurance": "insurance",
  "truck.inspection": "inspection",
  "driver.license": "license",
};

interface DocumentExpiryItem {
  entityType: "truck" | "driver";
  entityId: string;
  label: string;
  document: DocumentField;
  expiresAt: Date;
  status: "expired" | "warning";
}

fleetOpsRouter.get("/reports/document-expiry", requireAuth, requirePermission("trucks", "view"), async (req, res) => {
  const asOf = queryString(req, "asOf") ? new Date(queryString(req, "asOf")!) : new Date();

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [companyRow] = await tx.select().from(company);
    const warningDays = companyRow?.documentExpiryWarningDays ?? 30;

    const trucks = await tx.select().from(truck).where(isNull(truck.voidedAt));
    const drivers = await tx.select().from(driver).where(isNull(driver.voidedAt));

    const items: DocumentExpiryItem[] = [];

    for (const t of trucks) {
      const check = evaluateDocumentExpiry({
        asOf,
        warningDays,
        truck: { registrationExpiresAt: t.registrationExpiresAt, insuranceExpiresAt: t.insuranceExpiresAt, inspectionExpiresAt: t.inspectionExpiresAt },
      });
      const byLabel = new Map<DocumentExpiryLabel, Date | null>([
        ["truck.registration", t.registrationExpiresAt],
        ["truck.insurance", t.insuranceExpiresAt],
        ["truck.inspection", t.inspectionExpiresAt],
      ]);
      for (const label of check.expiredDocuments) {
        const expiresAt = byLabel.get(label);
        if (expiresAt) items.push({ entityType: "truck", entityId: t.id, label: t.plateNumber, document: LABEL_TO_FIELD[label], expiresAt, status: "expired" });
      }
      for (const label of check.warningDocuments) {
        const expiresAt = byLabel.get(label);
        if (expiresAt) items.push({ entityType: "truck", entityId: t.id, label: t.plateNumber, document: LABEL_TO_FIELD[label], expiresAt, status: "warning" });
      }
    }

    for (const d of drivers) {
      const check = evaluateDocumentExpiry({ asOf, warningDays, driver: { licenseExpiresAt: d.licenseExpiresAt } });
      if (check.expiredDocuments.includes("driver.license") && d.licenseExpiresAt) {
        items.push({ entityType: "driver", entityId: d.id, label: d.name, document: "license", expiresAt: d.licenseExpiresAt, status: "expired" });
      }
      if (check.warningDocuments.includes("driver.license") && d.licenseExpiresAt) {
        items.push({ entityType: "driver", entityId: d.id, label: d.name, document: "license", expiresAt: d.licenseExpiresAt, status: "warning" });
      }
    }

    return { warningDays, items };
  });

  res.status(200).json({
    asOf: asOf.toISOString(),
    warningDays: result.warningDays,
    items: result.items.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() })),
  });
});
