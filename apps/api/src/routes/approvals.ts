import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { purchaseOrder, purchaseRequest, vendorBill, withTenant } from "@rmixerp/db";
import { fils, filsToJodString } from "@rmixerp/core";
import type { ApprovalItem } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";

export const approvalsRouter = Router();

/**
 * Cross-module approvals inbox (PLAN.md Phase 10): every document type in
 * this codebase that actually sits in a submitted/pending state awaiting
 * someone with `:approve` to act on it, in one unified list. Credit/
 * document-expiry overrides at dispatch are a different pattern (blocked
 * then immediately overridden with a reason, not triaged later from a
 * queue) and deliberately don't appear here.
 */
approvalsRouter.get("/approvals", requireAuth, async (req, res) => {
  const perms = req.auth!.permissions ?? [];

  const items = await withTenant(db, req.auth!.companyId, async (tx) => {
    const results: ApprovalItem[] = [];

    if (perms.includes("purchaseRequests:approve")) {
      const rows = await tx
        .select()
        .from(purchaseRequest)
        .where(and(eq(purchaseRequest.status, "submitted"), isNull(purchaseRequest.voidedAt)));
      for (const r of rows) {
        results.push({ documentType: "purchase_request", id: r.id, number: r.requestNumber, branchId: r.branchId, amountJod: null, createdAt: r.createdAt.toISOString() });
      }
    }

    if (perms.includes("purchaseOrders:approve")) {
      const rows = await tx
        .select()
        .from(purchaseOrder)
        .where(and(eq(purchaseOrder.status, "submitted"), isNull(purchaseOrder.voidedAt)));
      for (const r of rows) {
        results.push({ documentType: "purchase_order", id: r.id, number: r.poNumber, branchId: r.branchId, amountJod: filsToJodString(fils(r.totalFils)), createdAt: r.createdAt.toISOString() });
      }
    }

    if (perms.includes("vendorBills:approve")) {
      const rows = await tx.select().from(vendorBill).where(and(eq(vendorBill.status, "draft"), isNull(vendorBill.voidedAt)));
      for (const r of rows) {
        results.push({ documentType: "vendor_bill", id: r.id, number: r.billNumber, branchId: r.branchId, amountJod: filsToJodString(fils(r.totalFils)), createdAt: r.createdAt.toISOString() });
      }
    }

    return results;
  });

  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.status(200).json({ items });
});
