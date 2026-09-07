import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  branch,
  creditNote,
  debitNote,
  deliveryOrder,
  invoice,
  invoiceLine,
  invoiceNumberCounter,
  proofOfDelivery,
  salesOrder,
  salesOrderLine,
  withTenant,
  type Tx,
} from "@rmixerp/db";
import { addFils, assertDeliveryOrderTransition, fils, filsToJodString, jodStringToFils, ZERO_FILS } from "@rmixerp/core";
import {
  CreateCreditNoteBody,
  CreateDebitNoteBody,
  GenerateInvoiceBody,
  type CreditNote,
  type DebitNote,
  type Invoice,
  type InvoiceDetail,
  type InvoiceLine,
} from "@rmixerp/contract";
import { computeLineBaseAmounts } from "../lib/orderTotals";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { idempotent } from "../middleware/idempotency";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";
import { writeAudit } from "../audit";

export const invoicesRouter = Router();
const MODULE = "invoices";
/** DOMAIN.md: "a cleared invoice can only be credit-noted, never edited" — credit/debit-note creation requires the invoice to have passed Phase 7's clearance gate. */
const CLEARED_OR_LATER = new Set(["cleared", "issued", "partially_paid", "paid"]);

type InvoiceRow = typeof invoice.$inferSelect;
type InvoiceLineRow = typeof invoiceLine.$inferSelect;
type CreditNoteRow = typeof creditNote.$inferSelect;
type DebitNoteRow = typeof debitNote.$inferSelect;

function clearanceFieldsToApi(row: {
  clearanceStatus: "pending" | "cleared" | "rejected" | "retrying";
  clearanceIcv: number | null;
  clearanceQrPayload: string | null;
  clearanceProviderReference: string | null;
  clearanceAttempts: number;
  clearanceNextRetryAt: Date | null;
  clearanceError: string | null;
}) {
  return {
    clearanceStatus: row.clearanceStatus,
    clearanceIcv: row.clearanceIcv,
    clearanceQrPayload: row.clearanceQrPayload,
    clearanceProviderReference: row.clearanceProviderReference,
    clearanceAttempts: row.clearanceAttempts,
    clearanceNextRetryAt: row.clearanceNextRetryAt?.toISOString() ?? null,
    clearanceError: row.clearanceError,
  };
}

function invoiceToApi(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    customerId: row.customerId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    invoicedAt: row.invoicedAt.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    relatedInvoiceId: row.relatedInvoiceId,
    subtotalJod: filsToJodString(fils(row.subtotalFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    ...clearanceFieldsToApi(row),
  };
}

function lineToApi(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    companyId: row.companyId,
    invoiceId: row.invoiceId,
    deliveryOrderId: row.deliveryOrderId,
    taxTreatment: row.taxTreatment,
    description: row.description,
    quantityM3: row.quantityM3,
    unitPriceJod: row.unitPriceFils !== null ? filsToJodString(fils(row.unitPriceFils)) : null,
    netJod: filsToJodString(fils(row.netFils)),
    taxRateBasisPoints: row.taxRateBasisPoints,
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    createdAt: row.createdAt.toISOString(),
  };
}

export function creditNoteToApi(row: CreditNoteRow): CreditNote {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    invoiceId: row.invoiceId,
    noteNumber: row.noteNumber,
    amountJod: filsToJodString(fils(row.amountFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    ...clearanceFieldsToApi(row),
  };
}

export function debitNoteToApi(row: DebitNoteRow): DebitNote {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    invoiceId: row.invoiceId,
    noteNumber: row.noteNumber,
    amountJod: filsToJodString(fils(row.amountFils)),
    taxJod: filsToJodString(fils(row.taxFils)),
    totalJod: filsToJodString(fils(row.totalFils)),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    ...clearanceFieldsToApi(row),
  };
}

export async function loadInvoiceDetail(tx: Tx, id: string): Promise<InvoiceDetail | null> {
  const [row] = await tx.select().from(invoice).where(and(eq(invoice.id, id), isNull(invoice.voidedAt)));
  if (!row) return null;
  // Sequential, not Promise.all: a transaction's queries share one
  // Postgres connection, which can only process one query at a time —
  // see PLAN.md's Phase 6 note on the pre-existing Promise.all([select,
  // count]) pattern used across most list endpoints.
  const lines = await tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id));
  const notes1 = await tx.select().from(creditNote).where(eq(creditNote.invoiceId, id));
  const notes2 = await tx.select().from(debitNote).where(eq(debitNote.invoiceId, id));
  return {
    ...invoiceToApi(row),
    lines: lines.map(lineToApi),
    creditNotes: notes1.map(creditNoteToApi),
    debitNotes: notes2.map(debitNoteToApi),
  };
}

/**
 * "{PREFIX}-{YYMM}-{SEQ}" (invoices use PREFIX={branchCode}; credit/debit
 * notes prepend their own type marker, "CN-{branchCode}"/"DN-{branchCode}",
 * an obvious extension of the same documented invoice-numbering scheme,
 * not a separately guessed format). SEQ is atomically allocated in the
 * same transaction as the document (DOMAIN.md/PLAN.md's gapless rule).
 * Reused by Phase 8's receivables routes for receipt numbering
 * ("RCP"/"TRF"/"PDC" docTypes) — the same gapless-per-(branch,docType,
 * yearMonth) counter table works for any document series, not just
 * invoicing's own three.
 */
export async function allocateDocumentNumber(
  tx: Tx,
  companyId: string,
  branchId: string,
  docType: "invoice" | "credit_note" | "debit_note" | "RCP" | "TRF" | "PDC",
  displayPrefix: string,
): Promise<string> {
  const now = new Date();
  const yearMonth = `${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [row] = await tx
    .insert(invoiceNumberCounter)
    .values({ companyId, branchId, docType, yearMonth, nextSeq: 1 })
    .onConflictDoUpdate({
      target: [invoiceNumberCounter.branchId, invoiceNumberCounter.docType, invoiceNumberCounter.yearMonth],
      set: { nextSeq: sql`${invoiceNumberCounter.nextSeq} + 1` },
    })
    .returning();
  if (!row) throw new Error("invoice number counter upsert returned no row");
  return `${displayPrefix}-${yearMonth}-${String(row.nextSeq).padStart(4, "0")}`;
}

interface DraftLine {
  taxTreatment: "taxable" | "exempt";
  description: string;
  quantityM3: string;
  unitPriceFils: bigint;
  netFils: bigint;
  taxRateBasisPoints: number;
  taxFils: bigint;
  totalFils: bigint;
}

async function createInvoiceWithLines(
  tx: Tx,
  args: {
    companyId: string;
    branchId: string;
    branchCode: string;
    customerId: string;
    deliveryOrderId: string;
    createdBy: string;
    lines: DraftLine[];
  },
): Promise<{ invoiceRow: InvoiceRow; lineRows: InvoiceLineRow[] }> {
  const invoiceNumber = await allocateDocumentNumber(tx, args.companyId, args.branchId, "invoice", args.branchCode);
  const subtotalFils = addFils(...args.lines.map((l) => fils(l.netFils)));
  const taxFilsTotal = addFils(...args.lines.map((l) => fils(l.taxFils)));
  const totalFils = addFils(subtotalFils, taxFilsTotal);

  const [invoiceRow] = await tx
    .insert(invoice)
    .values({
      companyId: args.companyId,
      branchId: args.branchId,
      customerId: args.customerId,
      invoiceNumber,
      subtotalFils,
      taxFils: taxFilsTotal,
      totalFils,
      createdBy: args.createdBy,
    })
    .returning();
  if (!invoiceRow) throw new Error("invoice insert returned no row");

  const lineRows = await tx
    .insert(invoiceLine)
    .values(
      args.lines.map((l) => ({
        companyId: args.companyId,
        invoiceId: invoiceRow.id,
        deliveryOrderId: args.deliveryOrderId,
        taxTreatment: l.taxTreatment,
        description: l.description,
        quantityM3: l.quantityM3,
        unitPriceFils: l.unitPriceFils,
        netFils: l.netFils,
        taxRateBasisPoints: l.taxRateBasisPoints,
        taxFils: l.taxFils,
        totalFils: l.totalFils,
        createdBy: args.createdBy,
      })),
    )
    .onConflictDoNothing({ target: [invoiceLine.deliveryOrderId, invoiceLine.taxTreatment] })
    .returning();

  return { invoiceRow, lineRows };
}

invoicesRouter.post(
  "/delivery-orders/:id/invoice",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const parsed = GenerateInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const mode = parsed.data.mode;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      // Row lock: serializes concurrent invoicing attempts against the
      // same delivery order — the loser sees status already flipped to
      // "invoiced" once it acquires the lock, per DOMAIN.md Invariant 1's
      // "exactly one succeeds" requirement. The UNIQUE(deliveryOrderId,
      // taxTreatment) constraint on invoice_line is the DB-level backstop
      // DOMAIN.md explicitly demands on top of this ("not application
      // logic alone"), not the primary mechanism.
      const [order] = await tx
        .select()
        .from(deliveryOrder)
        .where(and(eq(deliveryOrder.id, id), isNull(deliveryOrder.voidedAt)))
        .for("update");
      if (!order) return { kind: "not_found" as const };
      if (order.status !== "delivered") return { kind: "invalid_status" as const };
      if (!order.salesOrderLineId) return { kind: "no_sales_order_line" as const };

      const [line] = await tx.select().from(salesOrderLine).where(eq(salesOrderLine.id, order.salesOrderLineId));
      if (!line) throw new Error("delivery order references a missing sales order line");
      const [salesOrderRow] = await tx.select().from(salesOrder).where(eq(salesOrder.id, order.salesOrderId));
      if (!salesOrderRow) throw new Error("delivery order references a missing sales order");
      const [branchRow] = await tx.select().from(branch).where(eq(branch.id, order.branchId));
      if (!branchRow) throw new Error("delivery order references a missing branch");
      const [pod] = await tx.select().from(proofOfDelivery).where(eq(proofOfDelivery.deliveryOrderId, id));
      const billedQuantityM3 = pod?.receivedQuantityM3 ?? order.quantityM3;

      const base = computeLineBaseAmounts({
        concreteUnitPriceFils: line.concreteUnitPriceFils,
        deliveryUnitPriceFils: line.deliveryUnitPriceFils,
        quantityM3: billedQuantityM3,
        taxRateBasisPoints: line.taxRateBasisPoints,
      });

      const taxableLine: DraftLine = {
        taxTreatment: "taxable",
        description: "Concrete supply",
        quantityM3: billedQuantityM3,
        unitPriceFils: line.concreteUnitPriceFils,
        netFils: base.concreteNetFils,
        taxRateBasisPoints: line.taxRateBasisPoints,
        taxFils: base.concreteTaxFils,
        totalFils: addFils(base.concreteNetFils, base.concreteTaxFils),
      };
      const exemptLine: DraftLine | null =
        base.deliveryNetFils > ZERO_FILS
          ? {
              taxTreatment: "exempt",
              description: "Delivery / transport",
              quantityM3: billedQuantityM3,
              unitPriceFils: line.deliveryUnitPriceFils,
              netFils: base.deliveryNetFils,
              taxRateBasisPoints: 0,
              taxFils: ZERO_FILS,
              totalFils: base.deliveryNetFils,
            }
          : null;

      const createdInvoices: { invoiceRow: InvoiceRow; lineRows: InvoiceLineRow[] }[] = [];

      if (mode === "combined") {
        const lines = exemptLine ? [taxableLine, exemptLine] : [taxableLine];
        createdInvoices.push(
          await createInvoiceWithLines(tx, {
            companyId: req.auth!.companyId,
            branchId: order.branchId,
            branchCode: branchRow.code,
            customerId: salesOrderRow.customerId,
            deliveryOrderId: id,
            createdBy: req.auth!.userId,
            lines,
          }),
        );
      } else {
        createdInvoices.push(
          await createInvoiceWithLines(tx, {
            companyId: req.auth!.companyId,
            branchId: order.branchId,
            branchCode: branchRow.code,
            customerId: salesOrderRow.customerId,
            deliveryOrderId: id,
            createdBy: req.auth!.userId,
            lines: [taxableLine],
          }),
        );
        if (exemptLine) {
          createdInvoices.push(
            await createInvoiceWithLines(tx, {
              companyId: req.auth!.companyId,
              branchId: order.branchId,
              branchCode: branchRow.code,
              customerId: salesOrderRow.customerId,
              deliveryOrderId: id,
              createdBy: req.auth!.userId,
              lines: [exemptLine],
            }),
          );
        }
      }

      // Every draft line insert must have actually claimed its slot —
      // an empty lineRows array means the unique constraint backstop
      // caught a race the row lock should have already prevented.
      if (createdInvoices.some((c) => c.lineRows.length === 0)) {
        return { kind: "already_invoiced" as const };
      }

      if (createdInvoices.length === 2) {
        const [first, second] = createdInvoices;
        await tx.update(invoice).set({ relatedInvoiceId: second!.invoiceRow.id }).where(eq(invoice.id, first!.invoiceRow.id));
        await tx.update(invoice).set({ relatedInvoiceId: first!.invoiceRow.id }).where(eq(invoice.id, second!.invoiceRow.id));
      }

      const before = order;
      assertDeliveryOrderTransition(order.status, "invoiced");
      const [updatedOrder] = await tx
        .update(deliveryOrder)
        .set({ status: "invoiced", updatedAt: new Date() })
        .where(eq(deliveryOrder.id, id))
        .returning();
      if (!updatedOrder) throw new Error("delivery order update returned no row");

      for (const created of createdInvoices) {
        await writeAudit(tx, {
          companyId: req.auth!.companyId,
          branchId: order.branchId,
          actorUserId: req.auth!.userId,
          entityType: "invoice",
          entityId: created.invoiceRow.id,
          action: "create",
          after: created.invoiceRow,
        });
      }
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: order.branchId,
        actorUserId: req.auth!.userId,
        entityType: "delivery_order",
        entityId: id,
        action: "transition:invoiced",
        before,
        after: updatedOrder,
      });

      return { kind: "ok" as const, invoiceIds: createdInvoices.map((c) => c.invoiceRow.id) };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Delivery order"));
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json(validationError({ status: "delivery order must be delivered" }));
      return;
    }
    if (result.kind === "no_sales_order_line") {
      res
        .status(400)
        .json(validationError({ salesOrderLineId: "delivery order has no sales-order-line reference to invoice against" }));
      return;
    }
    if (result.kind === "already_invoiced") {
      res.status(409).json({
        error: { message: "This delivery order has already been invoiced", code: "already_invoiced" },
      });
      return;
    }

    const invoices = await withTenant(db, req.auth!.companyId, async (tx) => {
      const details = await Promise.all(result.invoiceIds.map((invoiceId) => loadInvoiceDetail(tx, invoiceId)));
      return details.filter((d): d is InvoiceDetail => d !== null);
    });
    res.status(201).json({ invoices });
  },
);

invoicesRouter.get("/invoices", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const status = queryString(req, "status");
  const branchId = queryString(req, "branchId");
  const customerId = queryString(req, "customerId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      isNull(invoice.voidedAt),
      status ? eq(invoice.status, status as InvoiceRow["status"]) : undefined,
      branchId ? eq(invoice.branchId, branchId) : undefined,
      customerId ? eq(invoice.customerId, customerId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(invoice).where(where).orderBy(desc(invoice.createdAt)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(invoice).where(where),
    ]);
    return { items: rows, total: countRows[0]?.count ?? 0 };
  });

  res.status(200).json(paginatedBody(items.map(invoiceToApi), total, pagination));
});

invoicesRouter.get("/invoices/:id", requireAuth, requirePermission(MODULE, "view"), async (req, res) => {
  const body = await withTenant(db, req.auth!.companyId, (tx) => loadInvoiceDetail(tx, paramId(req)));
  if (!body) {
    res.status(404).json(notFound("Invoice"));
    return;
  }
  res.status(200).json(body);
});

invoicesRouter.post(
  "/invoices/:id/credit-notes",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const parsed = CreateCreditNoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const [invoiceRow] = await tx.select().from(invoice).where(and(eq(invoice.id, id), isNull(invoice.voidedAt)));
      if (!invoiceRow) return { kind: "not_found" as const };
      // DOMAIN.md: "a cleared invoice can only be credit-noted, never
      // edited" — the inverse also holds structurally: a NOT-yet-cleared
      // invoice cannot be credit-noted either, since clearance (Phase 7)
      // is the point the invoice becomes a real fiscal document.
      if (!CLEARED_OR_LATER.has(invoiceRow.status)) {
        return { kind: "not_cleared" as const, status: invoiceRow.status };
      }

      const amountFils = jodStringToFils(input.amountJod);
      const taxFils = input.taxJod ? jodStringToFils(input.taxJod) : ZERO_FILS;
      const totalFils = addFils(amountFils, taxFils);
      const [branchRow] = await tx.select().from(branch).where(eq(branch.id, invoiceRow.branchId));
      if (!branchRow) throw new Error("invoice references a missing branch");
      const noteNumber = await allocateDocumentNumber(
        tx,
        req.auth!.companyId,
        invoiceRow.branchId,
        "credit_note",
        `CN-${branchRow.code}`,
      );

      const [row] = await tx
        .insert(creditNote)
        .values({
          companyId: req.auth!.companyId,
          branchId: invoiceRow.branchId,
          invoiceId: id,
          noteNumber,
          amountFils,
          taxFils,
          totalFils,
          reason: input.reason,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: invoiceRow.branchId,
        actorUserId: req.auth!.userId,
        entityType: "credit_note",
        entityId: row.id,
        action: "create",
        after: row,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Invoice"));
      return;
    }
    if (result.kind === "not_cleared") {
      res.status(400).json(validationError({ status: `Invoice must be cleared before it can be credit-noted (current status: ${result.status}).` }));
      return;
    }
    res.status(201).json((await withTenant(db, req.auth!.companyId, (tx) => loadInvoiceDetail(tx, id)))!);
  },
);

invoicesRouter.post(
  "/invoices/:id/debit-notes",
  requireAuth,
  requirePermission(MODULE, "create"),
  idempotent(),
  async (req, res) => {
    const parsed = CreateDebitNoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationError(parsed.error.flatten()));
      return;
    }
    const input = parsed.data;
    const id = paramId(req);

    const result = await withTenant(db, req.auth!.companyId, async (tx) => {
      const [invoiceRow] = await tx.select().from(invoice).where(and(eq(invoice.id, id), isNull(invoice.voidedAt)));
      if (!invoiceRow) return { kind: "not_found" as const };
      if (!CLEARED_OR_LATER.has(invoiceRow.status)) {
        return { kind: "not_cleared" as const, status: invoiceRow.status };
      }

      const amountFils = jodStringToFils(input.amountJod);
      const taxFils = input.taxJod ? jodStringToFils(input.taxJod) : ZERO_FILS;
      const totalFils = addFils(amountFils, taxFils);
      const [branchRow] = await tx.select().from(branch).where(eq(branch.id, invoiceRow.branchId));
      if (!branchRow) throw new Error("invoice references a missing branch");
      const noteNumber = await allocateDocumentNumber(
        tx,
        req.auth!.companyId,
        invoiceRow.branchId,
        "debit_note",
        `DN-${branchRow.code}`,
      );

      const [row] = await tx
        .insert(debitNote)
        .values({
          companyId: req.auth!.companyId,
          branchId: invoiceRow.branchId,
          invoiceId: id,
          noteNumber,
          amountFils,
          taxFils,
          totalFils,
          reason: input.reason,
          createdBy: req.auth!.userId,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      await writeAudit(tx, {
        companyId: req.auth!.companyId,
        branchId: invoiceRow.branchId,
        actorUserId: req.auth!.userId,
        entityType: "debit_note",
        entityId: row.id,
        action: "create",
        after: row,
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json(notFound("Invoice"));
      return;
    }
    if (result.kind === "not_cleared") {
      res.status(400).json(validationError({ status: `Invoice must be cleared before it can be debit-noted (current status: ${result.status}).` }));
      return;
    }
    res.status(201).json((await withTenant(db, req.auth!.companyId, (tx) => loadInvoiceDetail(tx, id)))!);
  },
);
