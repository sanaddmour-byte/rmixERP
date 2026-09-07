import { Router } from "express";
import { eq } from "drizzle-orm";
import { company, withTenant } from "@rmixerp/db";
import { UpdateCompanyBody, type Company } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { notFound, validationError } from "../lib/errors";
import { writeAudit } from "../audit";

export const companyRouter = Router();
const MODULE = "company";

type CompanyRow = typeof company.$inferSelect;

function toApi(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    taxNumber: row.taxNumber,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

companyRouter.get("/company", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [r] = await tx.select().from(company).where(eq(company.id, req.auth!.companyId));
    return r;
  });
  if (!row) {
    res.status(404).json(notFound("Company"));
    return;
  }
  res.status(200).json(toApi(row));
});

companyRouter.put("/company", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const updated = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [before] = await tx.select().from(company).where(eq(company.id, req.auth!.companyId));
    if (!before) return null;

    const [row] = await tx
      .update(company)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.taxNumber !== undefined && { taxNumber: input.taxNumber }),
        updatedAt: new Date(),
      })
      .where(eq(company.id, req.auth!.companyId))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "company",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Company"));
    return;
  }
  res.status(200).json(toApi(updated));
});
