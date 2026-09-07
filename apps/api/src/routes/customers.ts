import { Router } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { customer, withTenant, type Tx } from "@rmixerp/db";
import { fils, filsToJodString, jodStringToFils } from "@rmixerp/core";
import { CreateCustomerBody, UpdateCustomerBody, VoidCustomerBody, type Customer } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const customersRouter = Router();
const MODULE = "customers";

type CustomerRow = typeof customer.$inferSelect;

function toApi(row: CustomerRow): Customer {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    name: row.name,
    customerType: row.customerType,
    phone: row.phone,
    email: row.email,
    taxNumber: row.taxNumber,
    nationalId: row.nationalId,
    address: row.address,
    creditLimitJod: filsToJodString(fils(row.creditLimitFils)),
    creditPolicy: row.creditPolicy,
    paymentTermsDays: row.paymentTermsDays,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<CustomerRow | undefined> {
  const [row] = await tx
    .select()
    .from(customer)
    .where(and(eq(customer.id, id), isNull(customer.voidedAt)));
  return row;
}

customersRouter.get("/customers", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(isNull(customer.voidedAt), q ? ilike(customer.name, `%${q}%`) : undefined);
    const [rows, countRows] = await Promise.all([
      tx.select().from(customer).where(where).orderBy(desc(customer.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(customer).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "customers.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "customerType", header: "Type" },
      { key: "phone", header: "Phone" },
      { key: "email", header: "Email" },
      { key: "creditLimitJod", header: "Credit Limit (JOD)" },
      { key: "creditPolicy", header: "Credit Policy" },
      { key: "paymentTermsDays", header: "Payment Terms (days)" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

customersRouter.get("/customers/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Customer"));
    return;
  }
  res.status(200).json(toApi(row));
});

customersRouter.post("/customers", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(customer)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId ?? null,
        name: input.name,
        customerType: input.customerType ?? "company",
        phone: input.phone ?? null,
        email: input.email ?? null,
        taxNumber: input.taxNumber ?? null,
        nationalId: input.nationalId ?? null,
        address: input.address ?? null,
        creditLimitFils: input.creditLimitJod ? jodStringToFils(input.creditLimitJod) : 0n,
        creditPolicy: input.creditPolicy ?? "none",
        paymentTermsDays: input.paymentTermsDays ?? 0,
        notes: input.notes ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "customer",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

customersRouter.put("/customers/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateCustomerBody.safeParse(req.body);
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
      .update(customer)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.customerType !== undefined && { customerType: input.customerType }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.taxNumber !== undefined && { taxNumber: input.taxNumber }),
        ...(input.nationalId !== undefined && { nationalId: input.nationalId }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.creditLimitJod !== undefined && { creditLimitFils: jodStringToFils(input.creditLimitJod) }),
        ...(input.creditPolicy !== undefined && { creditPolicy: input.creditPolicy }),
        ...(input.paymentTermsDays !== undefined && { paymentTermsDays: input.paymentTermsDays }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: new Date(),
      })
      .where(eq(customer.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "customer",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Customer"));
    return;
  }
  res.status(200).json(toApi(updated));
});

customersRouter.delete("/customers/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidCustomerBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(customer).set({ voidedAt: new Date() }).where(eq(customer.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "customer",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Customer"));
    return;
  }
  res.status(204).send();
});
