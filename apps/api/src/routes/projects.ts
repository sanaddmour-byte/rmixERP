import { Router } from "express";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { project, withTenant, type Tx } from "@rmixerp/db";
import { CreateProjectBody, UpdateProjectBody, VoidProjectBody, type Project } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { sendCsv } from "../lib/csv";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const projectsRouter = Router();
const MODULE = "projects";

type ProjectRow = typeof project.$inferSelect;

function toApi(row: ProjectRow): Project {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    name: row.name,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function findActive(tx: Tx, id: string): Promise<ProjectRow | undefined> {
  const [row] = await tx
    .select()
    .from(project)
    .where(and(eq(project.id, id), isNull(project.voidedAt)));
  return row;
}

projectsRouter.get("/projects", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const q = queryString(req, "q");
  const customerId = queryString(req, "customerId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(project.voidedAt),
      q ? ilike(project.name, `%${q}%`) : undefined,
      customerId ? eq(project.customerId, customerId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(project).where(where).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(project).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  if (queryString(req, "format") === "csv") {
    sendCsv(res, "projects.csv", items.map(toApi), [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "customerId", header: "Customer ID" },
      { key: "address", header: "Address" },
    ]);
    return;
  }
  res.status(200).json(paginatedBody(items.map(toApi), total, pagination));
});

projectsRouter.get("/projects/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const row = await withTenant(db, req.auth!.companyId, (tx) => findActive(tx, paramId(req)));
  if (!row) {
    res.status(404).json(notFound("Project"));
    return;
  }
  res.status(200).json(toApi(row));
});

projectsRouter.post("/projects", requireAuth, requirePermission(MODULE, "create"), async (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const created = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx
      .insert(project)
      .values({
        companyId: req.auth!.companyId,
        branchId: input.branchId ?? null,
        customerId: input.customerId,
        name: input.name,
        address: input.address ?? null,
        createdBy: req.auth!.userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "project",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });

  res.status(201).json(toApi(created));
});

projectsRouter.put("/projects/:id", requireAuth, requirePermission(MODULE, "edit"), async (req, res) => {
  const parsed = UpdateProjectBody.safeParse(req.body);
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
      .update(project)
      .set({
        ...(input.branchId !== undefined && { branchId: input.branchId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.address !== undefined && { address: input.address }),
        updatedAt: new Date(),
      })
      .where(eq(project.id, id))
      .returning();
    if (!row) throw new Error("update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "project",
      entityId: row.id,
      action: "update",
      before,
      after: row,
    });
    return row;
  });

  if (!updated) {
    res.status(404).json(notFound("Project"));
    return;
  }
  res.status(200).json(toApi(updated));
});

projectsRouter.delete("/projects/:id", requireAuth, requirePermission(MODULE, "void"), async (req, res) => {
  const parsed = VoidProjectBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;
  const id = paramId(req);

  const voided = await withTenant(db, req.auth!.companyId, async (tx) => {
    const before = await findActive(tx, id);
    if (!before) return null;

    const [row] = await tx.update(project).set({ voidedAt: new Date() }).where(eq(project.id, id)).returning();
    if (!row) throw new Error("void returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      actorUserId: req.auth!.userId,
      entityType: "project",
      entityId: row.id,
      action: "void",
      before,
      after: row,
      reason,
    });
    return row;
  });

  if (!voided) {
    res.status(404).json(notFound("Project"));
    return;
  }
  res.status(204).send();
});
