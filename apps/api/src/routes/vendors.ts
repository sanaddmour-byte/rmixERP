import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { vendor, withTenant, type Tx } from "@rmixerp/db";
import { CreateVendorBody, UpdateVendorBody, VoidVendorBody, type Vendor } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const vendorsRouter = Router();
const MODULE = "vendors";

type VendorRow = typeof vendor.$inferSelect;

function toApi(row: VendorRow): Vendor {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    name: row.name,
    taxNumber: row.taxNumber,
    phone: row.phone,
    email: row.email,
    address: row.address,
    paymentTermsDays: row.paymentTermsDays,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<VendorRow | undefined> {
  const [row] = await tx
    .select()
    .from(vendor)
    .where(and(eq(vendor.id, id), isNull(vendor.voidedAt)));
  return row;
}

vendorsRouter.get("/vendors", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(vendor.voidedAt), q ? ilike(vendor.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(vendor).where(where).orderBy(desc(vendor.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(vendor).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "vendors.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "taxNumber", header: "Tax Number" },
      { key: "phone", header: "Phone" },
      { key: "email", header: "Email" },
      { key: "paymentTermsDays", header: "Payment Terms (days)" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

vendorsRouter.get("/vendors/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Vendor"));
    return;
  }
  res.status(200).json(toApi(row));
});

vendorsRouter.post("/vendors", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(vendor)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId ?? null,
        name: input.name,
        taxNumber: input.taxNumber ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "vendor",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

vendorsRouter.put("/vendors/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;
  const id = paramId(req);

  const updated = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx
      .update(vendor)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.taxNumber !== undefined && { taxNumber: input.taxNumber }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.paymentTermsDays !== undefined && { paymentTermsDays: input.paymentTermsDays }),
        updatedAt: new Date(),
      })
      .where(eq(vendor.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "vendor",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Vendor"));
    return;
  }
  res.status(200).json(toApi(updated));
});

vendorsRouter.delete("/vendors/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidVendorBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(vendor).set({ voidedAt: new Date() }).where(eq(vendor.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "vendor",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Vendor"));
    return;
  }
  res.status(204).send();
});
