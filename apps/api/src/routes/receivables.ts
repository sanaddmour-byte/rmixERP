import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  appUser,
  branch,
  collection,
  collectionAllocation,
  customer,
  deliveryOrder,
  invoice,
  postDatedCheque,
  salesOrder,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import {
  addFils,
  assertInvoiceTransition,
  assertPdcTransition,
  deriveInvoiceStatusFromAllocations,
  fils,
  filsToJodString,
  jodStringToFils,
  planFifoAllocation,
  subFils,
  validateManualAllocation,
  ZERO_FILS,
  type Fils,
} from "@rmixerp/core";
import {
  BouncePostDatedChequeBody,
  CreateCollectionBody,
  type Collection,
  type CollectionAllocationItem,
  type CollectionDetail,
  type PostDatedCheque as PostDatedChequeApi,
} from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { idempotent } from "../middleware/idempotency";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { sendCsv } from "../lib/csv";
import { writeAudit } from "../audit";
import { computeOutstandingInvoiceExposure } from "../lib/creditExposure";
import { allocateDocumentNumber } from "./invoices";

export const receivablesRouter = Router();
const COLLECTIONS_MODULE = "collections";
const PDC_MODULE = "postDatedCheques";
const REPORTS_MODULE = "receivablesReports";

type CollectionRow = typeof collection.$inferSelect;
type CollectionAllocationRow = typeof collectionAllocation.$inferSelect;
type PdcRow = typeof postDatedCheque.$inferSelect;

const RECEIPT_PREFIX: Record<CollectionRow["method"], "RCP" | "TRF" | "PDC"> = {
  cash: "RCP",
  bank_transfer: "TRF",
  post_dated_cheque: "PDC",
};

function collectionToApi(row: CollectionRow): Collection {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    method: row.method,
    receiptNumber: row.receiptNumber,
    amountJod: filsToJodString(fils(row.amountFils)),
    receivedAt: row.receivedAt.toISOString(),
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function allocationToApi(row: CollectionAllocationRow): CollectionAllocationItem {
  return {
    id: row.id,
    companyId: row.companyId,
    collectionId: row.collectionId,
    invoiceId: row.invoiceId,
    amountJod: filsToJodString(fils(row.amountFils)),
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function pdcToApi(row: PdcRow): PostDatedChequeApi {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    collectionId: row.collectionId,
    bankName: row.bankName,
    chequeNumber: row.chequeNumber,
    dueDate: row.dueDate.toISOString(),
    status: row.status,
    depositedAt: row.depositedAt?.toISOString() ?? null,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    bouncedAt: row.bouncedAt?.toISOString() ?? null,
    bounceReason: row.bounceReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

async function loadCollectionDetail(tx: Tx, id: string): Promise<CollectionDetail | null> {
  const [row] = await tx.select().from(collection).where(and(eq(collection.id, id), isNull(collection.voidedAt)));
  if (!row) return null;
  const allocations = await tx.select().from(collectionAllocation).where(eq(collectionAllocation.collectionId, id));
  const [pdcRow] = await tx.select().from(postDatedCheque).where(eq(postDatedCheque.collectionId, id));
  return {
    ...collectionToApi(row),
    allocations: allocations.map(allocationToApi),
    postDatedCheque: pdcRow ? pdcToApi(pdcRow) : null,
  };
}

/** Sums an invoice's non-voided allocations. */
async function totalAllocatedForInvoice(tx: Tx, invoiceId: string): Promise<Fils> {
  const rows = await tx
    .select({ amountFils: collectionAllocation.amountFils })
    .from(collectionAllocation)
    .where(and(eq(collectionAllocation.invoiceId, invoiceId), isNull(collectionAllocation.voidedAt)));
  return addFils(...rows.map((r) => fils(r.amountFils)), ZERO_FILS);
}

/**
 * Voids every non-voided allocation row for one collection and reopens
 * whatever invoices they were applied to (DOMAIN.md: a bounced/cancelled
 * PDC "reopens the invoice ... unwinding allocations"). Used by both
 * bounce and cancel — a cancelled-before-clearing cheque is exactly as
 * unwound as a bounced one.
 */
async function unwindCollectionAllocations(
  tx: Tx,
  companyId: string,
  actorUserId: string,
  collectionId: string,
): Promise<void> {
  const allocations = await tx
    .select()
    .from(collectionAllocation)
    .where(and(eq(collectionAllocation.collectionId, collectionId), isNull(collectionAllocation.voidedAt)));

  for (const alloc of allocations) {
    await tx.update(collectionAllocation).set({ voidedAt: new Date() }).where(eq(collectionAllocation.id, alloc.id));

    const [invRow] = await tx.select().from(invoice).where(eq(invoice.id, alloc.invoiceId));
    if (!invRow) continue;
    const remaining = await totalAllocatedForInvoice(tx, alloc.invoiceId);
    const newStatus = deriveInvoiceStatusFromAllocations(fils(invRow.totalFils), remaining);
    if (newStatus !== invRow.status) {
      assertInvoiceTransition(invRow.status, newStatus);
      const [after] = await tx.update(invoice).set({ status: newStatus }).where(eq(invoice.id, invRow.id)).returning();
      await writeAudit(tx, {
        companyId,
        branchId: invRow.branchId,
        actorUserId,
        entityType: "invoice",
        entityId: invRow.id,
        action: "transition:reopened",
        before: invRow,
        after,
      });
    }
  }
}

receivablesRouter.post(
  "/collections",
  requireAuth,
  requirePermission(COLLECTIONS_MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const parsed = CreateCollectionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;

    if (input.method === "post_dated_cheque" && (!input.bankName || !input.chequeNumber || !input.chequeDueDate)) {
      res
        .status(400)
        .json(validationError({ method: "post_dated_cheque requires bankName, chequeNumber, and chequeDueDate" }));
      return;
    }
    if (input.allocationMode === "manual" && (!input.allocations || input.allocations.length === 0)) {
      res.status(400).json(validationError({ allocations: "allocationMode 'manual' requires at least one allocation line" }));
      return;
    }

    const amountFils = jodStringToFils(input.amountJod);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const [custRow] = await tx.select().from(customer).where(eq(customer.id, input.customerId));
      if (!custRow) return { kind: "customer_not_found" as const };
      const [branchRow] = await tx.select().from(branch).where(eq(branch.id, input.branchId));
      if (!branchRow) return { kind: "branch_not_found" as const };

      // Row-locked so a concurrent collection against the same customer's
      // invoices can't compute allocation off a stale outstanding figure.
      const openInvoices = await tx
        .select()
        .from(invoice)
        .where(and(eq(invoice.customerId, input.customerId), inArray(invoice.status, ["issued", "partially_paid"]), isNull(invoice.voidedAt)))
        .for("update");

      const allocatedByInvoice = new Map<string, Fils>();
      for (const inv of openInvoices) {
        allocatedByInvoice.set(inv.id, await totalAllocatedForInvoice(tx, inv.id));
      }
      const outstandingByInvoiceId = new Map(
        openInvoices.map((inv) => [inv.id, subFils(fils(inv.totalFils), allocatedByInvoice.get(inv.id) ?? ZERO_FILS)]),
      );

      let planLines: { invoiceId: string; amountFils: Fils }[];
      if (input.allocationMode === "fifo") {
        const { lines, unallocatedFils } = planFifoAllocation(
          amountFils,
          openInvoices.map((inv) => ({
            invoiceId: inv.id,
            dueDate: inv.dueDate ?? inv.invoicedAt,
            outstandingFils: outstandingByInvoiceId.get(inv.id)!,
          })),
        );
        if (unallocatedFils > ZERO_FILS) {
          return {
            kind: "invalid_allocation" as const,
            reason: "Collection amount exceeds total outstanding across this customer's open invoices — use allocationMode 'manual' to record a partial application.",
          };
        }
        planLines = lines;
      } else {
        const lines = (input.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amountFils: jodStringToFils(a.amountJod) }));
        const validation = validateManualAllocation(amountFils, lines, outstandingByInvoiceId);
        if (!validation.ok) return { kind: "invalid_allocation" as const, reason: validation.reason };
        planLines = lines;
      }

      if (planLines.length === 0) {
        return { kind: "invalid_allocation" as const, reason: "This customer has no open invoices to allocate against." };
      }

      const prefix = RECEIPT_PREFIX[input.method];
      const receiptNumber = await allocateDocumentNumber(tx, req.auth!.companyId, input.branchId, prefix, `${prefix}-${branchRow.code}`);

      const [collectionRow] = await tx
        .insert(collection)
        .values({
          companyId: req.auth!.companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          method: input.method,
          receiptNumber,
          amountFils,
          receivedAt: new Date(input.receivedAt),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!collectionRow) throw new Error("collection insert returned no row");

      if (input.method === "post_dated_cheque") {
        await tx.insert(postDatedCheque).values({
          companyId: req.auth!.companyId,
          branchId: input.branchId,
          customerId: input.customerId,
          collectionId: collectionRow.id,
          bankName: input.bankName!,
          chequeNumber: input.chequeNumber!,
          dueDate: new Date(input.chequeDueDate!),
          createdBy: req.auth!.userId,
        });
      }

      for (const line of planLines) {
        await tx.insert(collectionAllocation).values({
          companyId: req.auth!.companyId,
          collectionId: collectionRow.id,
          invoiceId: line.invoiceId,
          amountFils: line.amountFils,
          createdBy: req.auth!.userId,
        });

        const invRow = openInvoices.find((i) => i.id === line.invoiceId)!;
        const newAllocated = addFils(allocatedByInvoice.get(line.invoiceId) ?? ZERO_FILS, line.amountFils);
        const newStatus = deriveInvoiceStatusFromAllocations(fils(invRow.totalFils), newAllocated);
        if (newStatus !== invRow.status) {
          assertInvoiceTransition(invRow.status, newStatus);
          const [after] = await tx.update(invoice).set({ status: newStatus }).where(eq(invoice.id, invRow.id)).returning();
          await writeAudit(tx, {
            companyId: req.auth!.companyId,
            branchId: invRow.branchId,
            actorUserId: req.auth!.userId,
            entityType: "invoice",
            entityId: invRow.id,
            action: `transition:${newStatus}`,
            before: invRow,
            after,
          });
        }
      }

      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: input.branchId,
        actorUserId: req.auth!.userId,
        entityType: "collection",
        entityId: collectionRow.id,
        action: "create",
        after: collectionRow,
      });

      return { kind: "ok" as const, collectionId: collectionRow.id };
    });

    if (result.kind === "customer_not_found") {
      res.status(404).json(notFound("Customer"));
      return;
    }
    if (result.kind === "branch_not_found") {
      res.status(404).json(notFound("Branch"));
      return;
    }
    if (result.kind === "invalid_allocation") {
      res.status(400).json(validationError({ allocations: result.reason }));
      return;
    }
    const detail = await withTenant(db, req.auth!.companyId, (tx) => loadCollectionDetail(tx, result.collectionId));
    res.status(201).json(detail!);
  },
);

receivablesRouter.get("/collections", requireAuth, requirePermission(COLLECTIONS_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const customerId = queryString(req, "customerId");
  const method = queryString(req, "method");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(collection.voidedAt),
      customerId ? eq(collection.customerId, customerId) : undefined,
      method ? eq(collection.method, method as CollectionRow["method"]) : undefined,
    );
    const rows = await tx.select().from(collection).where(where).orderBy(desc(collection.receivedAt)).limit(pagination.limit).offset(pagination.offset);
    const countRows = await tx.select({ count: sql<number>`count(*)::int` }).from(collection).where(where);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(collectionToApi), total, pagination));
});

receivablesRouter.get("/collections/:id", requireAuth, requirePermission(COLLECTIONS_MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadCollectionDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Collection"));
    return;
  }
  res.status(200).json(body);
});

receivablesRouter.get("/post-dated-cheques", requireAuth, requirePermission(PDC_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const customerId = queryString(req, "customerId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(postDatedCheque.voidedAt),
      status ? eq(postDatedCheque.status, status as PdcRow["status"]) : undefined,
      customerId ? eq(postDatedCheque.customerId, customerId) : undefined,
    );
    const rows = await tx.select().from(postDatedCheque).where(where).orderBy(postDatedCheque.dueDate).limit(pagination.limit).offset(pagination.offset);
    const countRows = await tx.select({ count: sql<number>`count(*)::int` }).from(postDatedCheque).where(where);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(pdcToApi), total, pagination));
});

async function transitionPdc(
  req: Request,
  res: Response,
  toStatus: PdcRow["status"],
  extra: (tx: Tx, before: PdcRow) => Promise<Partial<PdcRow>>,
  unwind: boolean,
): Promise<void> {
  const id = paramId(req);
  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [before] = await tx.select().from(postDatedCheque).where(and(eq(postDatedCheque.id, id), isNull(postDatedCheque.voidedAt))).for("update");
    if (!before) return { kind: "not_found" as const };
    if (!(await (async () => {
      try {
        assertPdcTransition(before.status, toStatus);
        return true;
      } catch {
        return false;
      }
    })())) {
      return { kind: "invalid_transition" as const, status: before.status };
    }

    if (unwind) {
      await unwindCollectionAllocations(tx, req.auth!.companyId, req.auth!.userId, before.collectionId);
    }

    const patch = await extra(tx, before);
    const [after] = await tx.update(postDatedCheque).set({ status: toStatus, ...patch }).where(eq(postDatedCheque.id, id)).returning();
    if (!after) throw new Error("post-dated cheque update returned no row");
    await writeAudit(tx, {
      companyId: req.auth!.companyId,
      branchId: before.branchId,
      actorUserId: req.auth!.userId,
      entityType: "post_dated_cheque",
      entityId: id,
      action: `transition:${toStatus}`,
      before,
      after,
    });
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") {
    res.status(404).json(notFound("Post-dated cheque"));
    return;
  }
  if (result.kind === "invalid_transition") {
    res.status(400).json(validationError({ status: `Cannot transition a ${result.status} cheque to ${toStatus}.` }));
    return;
  }
  const [row] = await withTenant(db, req.auth!.companyId, (tx) => tx.select().from(postDatedCheque).where(eq(postDatedCheque.id, id)));
  res.status(200).json(pdcToApi(row!));
}

receivablesRouter.post("/post-dated-cheques/:id/deposit", requireAuth, requirePermission(PDC_MODULE, "edit"), (req, res) =>
  transitionPdc(req, res, "deposited", async () => ({ depositedAt: new Date() }), false),
);

receivablesRouter.post("/post-dated-cheques/:id/clear", requireAuth, requirePermission(PDC_MODULE, "edit"), (req, res) =>
  transitionPdc(req, res, "cleared", async () => ({ clearedAt: new Date() }), false),
);

receivablesRouter.post("/post-dated-cheques/:id/bounce", requireAuth, requirePermission(PDC_MODULE, "approve"), async (req, res) => {
  const parsed = BouncePostDatedChequeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  await transitionPdc(req, res, "bounced", async () => ({ bouncedAt: new Date(), bounceReason: parsed.data.reason }), true);
});

receivablesRouter.post("/post-dated-cheques/:id/cancel", requireAuth, requirePermission(PDC_MODULE, "edit"), (req, res) =>
  transitionPdc(req, res, "cancelled", async () => ({}), true),
);

receivablesRouter.get("/reports/customer-statement", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const customerId = queryString(req, "customerId");
  if (!customerId) {
    res.status(400).json(validationError({ customerId: "customerId is required" }));
    return;
  }
  const from = queryString(req, "from");
  const to = queryString(req, "to");

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [custRow] = await tx.select().from(customer).where(eq(customer.id, customerId));
    if (!custRow) return null;

    const invoiceWhere = and(
      eq(invoice.customerId, customerId),
      isNull(invoice.voidedAt),
      inArray(invoice.status, ["issued", "partially_paid", "paid"]),
      from ? gte(invoice.invoicedAt, new Date(from)) : undefined,
      to ? lte(invoice.invoicedAt, new Date(to)) : undefined,
    );
    const invoiceRows = await tx.select().from(invoice).where(invoiceWhere);

    const invoiceIds = invoiceRows.map((i) => i.id);
    const collectionRows =
      invoiceIds.length === 0
        ? []
        : await tx
            .select({
              collectionId: collectionAllocation.collectionId,
              amountFils: collectionAllocation.amountFils,
              receivedAt: collection.receivedAt,
              receiptNumber: collection.receiptNumber,
            })
            .from(collectionAllocation)
            .innerJoin(collection, eq(collection.id, collectionAllocation.collectionId))
            .where(
              and(
                inArray(collectionAllocation.invoiceId, invoiceIds),
                isNull(collectionAllocation.voidedAt),
                from ? gte(collection.receivedAt, new Date(from)) : undefined,
                to ? lte(collection.receivedAt, new Date(to)) : undefined,
              ),
            );

    type Line = { date: Date; type: "invoice" | "collection"; documentNumber: string; debitFils: Fils; creditFils: Fils };
    const lines: Line[] = [
      ...invoiceRows.map((i): Line => ({ date: i.invoicedAt, type: "invoice", documentNumber: i.invoiceNumber, debitFils: fils(i.totalFils), creditFils: ZERO_FILS })),
      ...collectionRows.map((c): Line => ({ date: c.receivedAt, type: "collection", documentNumber: c.receiptNumber, debitFils: ZERO_FILS, creditFils: fils(c.amountFils) })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = ZERO_FILS;
    const openingBalanceFils = ZERO_FILS; // No pre-Phase-8 receivables history to open a balance from.
    running = openingBalanceFils;
    const apiLines = lines.map((l) => {
      running = addFils(running, l.debitFils, subFils(ZERO_FILS, l.creditFils));
      return {
        date: l.date.toISOString(),
        type: l.type,
        documentNumber: l.documentNumber,
        debitJod: filsToJodString(l.debitFils),
        creditJod: filsToJodString(l.creditFils),
        runningBalanceJod: filsToJodString(running),
      };
    });

    return {
      customerId: custRow.id,
      customerName: custRow.name,
      openingBalanceJod: filsToJodString(openingBalanceFils),
      lines: apiLines,
      closingBalanceJod: filsToJodString(running),
    };
  });

  if (!result) {
    res.status(404).json(notFound("Customer"));
    return;
  }
  res.status(200).json(result);
});

const AGING_DAY_MS = 24 * 60 * 60 * 1000;

receivablesRouter.get("/reports/aging", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const asOf = queryString(req, "asOf") ? new Date(queryString(req, "asOf")!) : new Date();
  const format = queryString(req, "format");

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const openInvoices = await tx
      .select()
      .from(invoice)
      .where(and(inArray(invoice.status, ["issued", "partially_paid"]), isNull(invoice.voidedAt)));
    if (openInvoices.length === 0) return { asOf: asOf.toISOString(), items: [], grandTotalJod: filsToJodString(ZERO_FILS) };

    const invoiceIds = openInvoices.map((i) => i.id);
    const allocations = await tx
      .select({ invoiceId: collectionAllocation.invoiceId, amountFils: collectionAllocation.amountFils })
      .from(collectionAllocation)
      .where(and(inArray(collectionAllocation.invoiceId, invoiceIds), isNull(collectionAllocation.voidedAt)));
    const allocatedByInvoice = new Map<string, bigint>();
    for (const a of allocations) allocatedByInvoice.set(a.invoiceId, (allocatedByInvoice.get(a.invoiceId) ?? 0n) + a.amountFils);

    const customerIds = [...new Set(openInvoices.map((i) => i.customerId))];
    const customerRows = await tx.select().from(customer).where(inArray(customer.id, customerIds));
    const customerById = new Map(customerRows.map((c) => [c.id, c.name]));

    // Standard AR aging buckets: current (not yet due), 1-30/31-60/61-90/90+ days past due.
    const buckets = new Map<string, { currentFils: Fils; days30Fils: Fils; days60Fils: Fils; days90PlusFils: Fils }>();
    for (const inv of openInvoices) {
      const outstanding = subFils(fils(inv.totalFils), fils(allocatedByInvoice.get(inv.id) ?? 0n));
      if (outstanding <= ZERO_FILS) continue;
      const dueDate = inv.dueDate ?? inv.invoicedAt;
      const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / AGING_DAY_MS);
      const bucket = buckets.get(inv.customerId) ?? { currentFils: ZERO_FILS, days30Fils: ZERO_FILS, days60Fils: ZERO_FILS, days90PlusFils: ZERO_FILS };
      if (daysPastDue <= 0) bucket.currentFils = addFils(bucket.currentFils, outstanding);
      else if (daysPastDue <= 30) bucket.days30Fils = addFils(bucket.days30Fils, outstanding);
      else if (daysPastDue <= 60) bucket.days60Fils = addFils(bucket.days60Fils, outstanding);
      else bucket.days90PlusFils = addFils(bucket.days90PlusFils, outstanding);
      buckets.set(inv.customerId, bucket);
    }

    const items = [...buckets.entries()].map(([customerId, b]) => ({
      customerId,
      customerName: customerById.get(customerId) ?? customerId,
      currentJod: filsToJodString(b.currentFils),
      days30Jod: filsToJodString(b.days30Fils),
      days60Jod: filsToJodString(b.days60Fils),
      days90PlusJod: filsToJodString(b.days90PlusFils),
      totalJod: filsToJodString(addFils(b.currentFils, b.days30Fils, b.days60Fils, b.days90PlusFils)),
    }));
    const grandTotalFils = addFils(...[...buckets.values()].map((b) => addFils(b.currentFils, b.days30Fils, b.days60Fils, b.days90PlusFils)), ZERO_FILS);

    return { asOf: asOf.toISOString(), items, grandTotalJod: filsToJodString(grandTotalFils) };
  });

  if (format === "csv") {
    sendCsv(res, "aging-report.csv", body.items, [
      { key: "customerName", header: "Customer" },
      { key: "currentJod", header: "Current (JOD)" },
      { key: "days30Jod", header: "1-30 days (JOD)" },
      { key: "days60Jod", header: "31-60 days (JOD)" },
      { key: "days90PlusJod", header: "90+ days (JOD)" },
      { key: "totalJod", header: "Total (JOD)" },
    ]);
    return;
  }
  res.status(200).json(body);
});

receivablesRouter.get("/reports/credit-control", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const items = await withTenant(db, req.auth!.companyId, async (tx) => {
    const openInvoices = await tx
      .select({ customerId: invoice.customerId })
      .from(invoice)
      .where(and(inArray(invoice.status, ["issued", "partially_paid"]), isNull(invoice.voidedAt)));
    const customerIds = [...new Set(openInvoices.map((i) => i.customerId))];
    if (customerIds.length === 0) return [];

    const customerRows = await tx.select().from(customer).where(inArray(customer.id, customerIds));
    const results = [];
    for (const cust of customerRows) {
      const outstandingFils = await computeOutstandingInvoiceExposure(tx, cust.id);
      if (outstandingFils <= ZERO_FILS) continue;
      const limitFils = fils(cust.creditLimitFils);
      const utilizationBasisPoints = limitFils > ZERO_FILS ? Number((outstandingFils * 10_000n) / limitFils) : 10_000;
      results.push({
        customerId: cust.id,
        customerName: cust.name,
        creditLimitJod: filsToJodString(limitFils),
        creditPolicy: cust.creditPolicy,
        outstandingJod: filsToJodString(outstandingFils),
        utilizationBasisPoints,
      });
    }
    return results.sort((a, b) => b.utilizationBasisPoints - a.utilizationBasisPoints);
  });

  res.status(200).json({ items });
});

interface OverrideDoc {
  id: string;
  documentType: "sales_order" | "delivery_order";
  customerId: string;
  exceededByFils: Fils;
  overriddenByUserId: string | null;
  reason: string | null;
  overriddenAt: Date;
}

receivablesRouter.get("/reports/credit-overrides", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const from = queryString(req, "from");
  const to = queryString(req, "to");
  const userId = queryString(req, "userId");
  const format = queryString(req, "format");

  const result = await withTenant(db, req.auth!.companyId, async (tx) => {
    const soWhere = and(
      eq(salesOrder.creditOverride, true),
      isNull(salesOrder.voidedAt),
      from ? gte(salesOrder.updatedAt, new Date(from)) : undefined,
      to ? lte(salesOrder.updatedAt, new Date(to)) : undefined,
      userId ? eq(salesOrder.creditOverrideBy, userId) : undefined,
    );
    const soRows = await tx.select().from(salesOrder).where(soWhere);

    const doWhere = and(
      eq(deliveryOrder.creditOverride, true),
      isNull(deliveryOrder.voidedAt),
      from ? gte(deliveryOrder.updatedAt, new Date(from)) : undefined,
      to ? lte(deliveryOrder.updatedAt, new Date(to)) : undefined,
      userId ? eq(deliveryOrder.creditOverrideBy, userId) : undefined,
    );
    const doRows = await tx
      .select({ deliveryOrder, customerId: salesOrder.customerId })
      .from(deliveryOrder)
      .innerJoin(salesOrder, eq(salesOrder.id, deliveryOrder.salesOrderId))
      .where(doWhere);

    const docs: OverrideDoc[] = [
      ...soRows.map(
        (r): OverrideDoc => ({
          id: r.id,
          documentType: "sales_order",
          customerId: r.customerId,
          exceededByFils: fils(r.creditCheckExceedsByFils ?? 0n),
          overriddenByUserId: r.creditOverrideBy,
          reason: r.creditOverrideReason,
          overriddenAt: r.updatedAt,
        }),
      ),
      ...doRows.map(
        (r): OverrideDoc => ({
          id: r.deliveryOrder.id,
          documentType: "delivery_order",
          customerId: r.customerId,
          exceededByFils: fils(r.deliveryOrder.creditCheckExceedsByFils ?? 0n),
          overriddenByUserId: r.deliveryOrder.creditOverrideBy,
          reason: r.deliveryOrder.creditOverrideReason,
          overriddenAt: r.deliveryOrder.updatedAt,
        }),
      ),
    ].sort((a, b) => b.overriddenAt.getTime() - a.overriddenAt.getTime());

    const customerIds = [...new Set(docs.map((d) => d.customerId))];
    const userIds = [...new Set(docs.map((d) => d.overriddenByUserId).filter((v): v is string => v !== null))];
    const customerRows = customerIds.length > 0 ? await tx.select().from(customer).where(inArray(customer.id, customerIds)) : [];
    const userRows = userIds.length > 0 ? await tx.select().from(appUser).where(inArray(appUser.id, userIds)) : [];
    const customerById = new Map(customerRows.map((c) => [c.id, c.name]));
    const userById = new Map(userRows.map((u) => [u.id, u.displayName]));

    const items = docs.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      customerId: d.customerId,
      customerName: customerById.get(d.customerId) ?? d.customerId,
      exceededByJod: filsToJodString(d.exceededByFils),
      overriddenByUserId: d.overriddenByUserId,
      overriddenByName: d.overriddenByUserId ? (userById.get(d.overriddenByUserId) ?? null) : null,
      reason: d.reason,
      overriddenAt: d.overriddenAt.toISOString(),
    }));

    const totalsByUserMap = new Map<string, { userName: string; count: number; totalExceededByFils: Fils }>();
    for (const d of docs) {
      if (!d.overriddenByUserId) continue;
      const existing = totalsByUserMap.get(d.overriddenByUserId) ?? {
        userName: userById.get(d.overriddenByUserId) ?? d.overriddenByUserId,
        count: 0,
        totalExceededByFils: ZERO_FILS,
      };
      existing.count += 1;
      existing.totalExceededByFils = addFils(existing.totalExceededByFils, d.exceededByFils);
      totalsByUserMap.set(d.overriddenByUserId, existing);
    }
    const totalsByUser = [...totalsByUserMap.entries()].map(([uid, v]) => ({
      userId: uid,
      userName: v.userName,
      count: v.count,
      totalExceededByJod: filsToJodString(v.totalExceededByFils),
    }));

    return { items, totalsByUser };
  });

  if (format === "csv") {
    sendCsv(res, "credit-overrides.csv", result.items, [
      { key: "documentType", header: "Document Type" },
      { key: "customerName", header: "Customer" },
      { key: "exceededByJod", header: "Exceeded By (JOD)" },
      { key: "overriddenByName", header: "Overridden By" },
      { key: "reason", header: "Reason" },
      { key: "overriddenAt", header: "Overridden At" },
    ]);
    return;
  }
  res.status(200).json(result);
});
