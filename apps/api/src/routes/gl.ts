import { Router } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { account, costCenter, journalEntry, journalLine, withTenant, type Tx } from "@rmixerp/db";
import {
  accountBalance,
  addFils,
  fils,
  filsToJodString,
  subFils,
  WELL_KNOWN_ACCOUNT_CODES,
  ZERO_FILS,
  type AccountType,
  type Fils,
} from "@rmixerp/core";
import { CreateCostCenterBody } from "@rmixerp/contract";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { parsePagination, paginatedBody } from "../lib/pagination";
import { notFound, validationError } from "../lib/errors";
import { paramId, queryString } from "../lib/params";

export const glRouter = Router();
const COST_CENTERS_MODULE = "glAccounts";
const JOURNAL_MODULE = "glJournal";
const REPORTS_MODULE = "glReports";

type CostCenterRow = typeof costCenter.$inferSelect;
type JournalEntryRow = typeof journalEntry.$inferSelect;
type JournalLineRow = typeof journalLine.$inferSelect;
type AccountRow = typeof account.$inferSelect;

function costCenterToApi(row: CostCenterRow) {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    code: row.code,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

function journalEntryToApi(row: JournalEntryRow) {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    entryDate: row.entryDate.toISOString(),
    description: row.description,
    sourceDocumentType: row.sourceDocumentType,
    sourceDocumentId: row.sourceDocumentId,
    createdAt: row.createdAt.toISOString(),
  };
}

function journalLineToApi(row: JournalLineRow) {
  return {
    id: row.id,
    journalEntryId: row.journalEntryId,
    accountId: row.accountId,
    costCenterId: row.costCenterId,
    debitJod: filsToJodString(fils(row.debitFils)),
    creditJod: filsToJodString(fils(row.creditFils)),
    description: row.description,
  };
}

glRouter.post("/gl/cost-centers", requireAuth, requirePermission(COST_CENTERS_MODULE, "create"), async (req, res) => {
  const parsed = CreateCostCenterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error.flatten()));
    return;
  }
  const input = parsed.data;

  const row = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [inserted] = await tx
      .insert(costCenter)
      .values({ companyId: req.auth!.companyId, branchId: input.branchId ?? null, code: input.code, name: input.name, createdBy: req.auth!.userId })
      .returning();
    return inserted;
  });
  if (!row) {
    res.status(400).json(validationError({ code: "insert failed" }));
    return;
  }
  res.status(201).json(costCenterToApi(row));
});

glRouter.get("/gl/cost-centers", requireAuth, requirePermission(COST_CENTERS_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = sql`${costCenter.voidedAt} is null`;
    const [rows, countRows] = await Promise.all([
      tx.select().from(costCenter).where(where).orderBy(costCenter.code).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(costCenter).where(where),
    ]);
    return { items: rows.map(costCenterToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

glRouter.get("/gl/journal-entries", requireAuth, requirePermission(JOURNAL_MODULE, "view"), async (req, res) => {
  const pagination = parsePagination(req);
  const sourceDocumentType = queryString(req, "sourceDocumentType");
  const branchId = queryString(req, "branchId");

  const { items, total } = await withTenant(db, req.auth!.companyId, async (tx) => {
    const where = and(
      sourceDocumentType ? eq(journalEntry.sourceDocumentType, sourceDocumentType) : undefined,
      branchId ? eq(journalEntry.branchId, branchId) : undefined,
    );
    const [rows, countRows] = await Promise.all([
      tx.select().from(journalEntry).where(where).orderBy(desc(journalEntry.entryDate)).limit(pagination.limit).offset(pagination.offset),
      tx.select({ count: sql<number>`count(*)::int` }).from(journalEntry).where(where),
    ]);
    return { items: rows.map(journalEntryToApi), total: countRows[0]?.count ?? 0 };
  });
  res.status(200).json(paginatedBody(items, total, pagination));
});

glRouter.get("/gl/journal-entries/:id", requireAuth, requirePermission(JOURNAL_MODULE, "view"), async (req, res) => {
  const id = paramId(req);
  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [row] = await tx.select().from(journalEntry).where(eq(journalEntry.id, id));
    if (!row) return null;
    const lines = await tx.select().from(journalLine).where(eq(journalLine.journalEntryId, id));
    return { ...journalEntryToApi(row), lines: lines.map(journalLineToApi) };
  });
  if (!body) {
    res.status(404).json(notFound("Journal entry"));
    return;
  }
  res.status(200).json(body);
});

/** Every non-voided account's net debit/credit total up to (and including) `asOf`. */
async function computeAccountTotals(tx: Tx, companyId: string, asOf: Date): Promise<{ accounts: AccountRow[]; totalsByAccountId: Map<string, { debit: Fils; credit: Fils }> }> {
  const accounts = await tx.select().from(account).where(and(eq(account.companyId, companyId), sql`${account.voidedAt} is null`));
  const lines = await tx
    .select({ accountId: journalLine.accountId, debitFils: journalLine.debitFils, creditFils: journalLine.creditFils })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(and(eq(journalEntry.companyId, companyId), lte(journalEntry.entryDate, asOf)));

  const totalsByAccountId = new Map<string, { debit: Fils; credit: Fils }>();
  for (const l of lines) {
    const existing = totalsByAccountId.get(l.accountId) ?? { debit: ZERO_FILS, credit: ZERO_FILS };
    totalsByAccountId.set(l.accountId, { debit: addFils(existing.debit, fils(l.debitFils)), credit: addFils(existing.credit, fils(l.creditFils)) });
  }
  return { accounts, totalsByAccountId };
}

glRouter.get("/gl/reports/trial-balance", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const asOf = queryString(req, "asOf") ? new Date(queryString(req, "asOf")!) : new Date();

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const { accounts, totalsByAccountId } = await computeAccountTotals(tx, req.auth!.companyId, asOf);
    const rows = accounts.map((a) => {
      const totals = totalsByAccountId.get(a.id) ?? { debit: ZERO_FILS, credit: ZERO_FILS };
      return {
        accountId: a.id,
        accountCode: a.code,
        accountName: a.name,
        accountType: a.type,
        balanceJod: filsToJodString(accountBalance(a.type, totals.debit, totals.credit)),
      };
    });
    let totalDebitFils = ZERO_FILS;
    let totalCreditFils = ZERO_FILS;
    for (const t of totalsByAccountId.values()) {
      totalDebitFils = addFils(totalDebitFils, t.debit);
      totalCreditFils = addFils(totalCreditFils, t.credit);
    }
    return { asOf: asOf.toISOString(), rows, totalDebitJod: filsToJodString(totalDebitFils), totalCreditJod: filsToJodString(totalCreditFils) };
  });
  res.status(200).json(body);
});

glRouter.get("/gl/reports/profit-and-loss", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const fromRaw = queryString(req, "from");
  const toRaw = queryString(req, "to");
  if (!fromRaw || !toRaw) {
    res.status(400).json(validationError({ from: "from and to are required" }));
    return;
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const accounts = await tx
      .select()
      .from(account)
      .where(and(eq(account.companyId, req.auth!.companyId), sql`${account.voidedAt} is null`));
    const lines = await tx
      .select({ accountId: journalLine.accountId, debitFils: journalLine.debitFils, creditFils: journalLine.creditFils })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(and(eq(journalEntry.companyId, req.auth!.companyId), gte(journalEntry.entryDate, from), lte(journalEntry.entryDate, to)));

    const totalsByAccountId = new Map<string, { debit: Fils; credit: Fils }>();
    for (const l of lines) {
      const existing = totalsByAccountId.get(l.accountId) ?? { debit: ZERO_FILS, credit: ZERO_FILS };
      totalsByAccountId.set(l.accountId, { debit: addFils(existing.debit, fils(l.debitFils)), credit: addFils(existing.credit, fils(l.creditFils)) });
    }

    function rowsFor(type: AccountType) {
      return accounts
        .filter((a) => a.type === type)
        .map((a) => {
          const t = totalsByAccountId.get(a.id) ?? { debit: ZERO_FILS, credit: ZERO_FILS };
          return { accountId: a.id, accountCode: a.code, accountName: a.name, balanceFils: accountBalance(type, t.debit, t.credit) };
        })
        .filter((r) => r.balanceFils !== ZERO_FILS);
    }

    const revenueRows = rowsFor("revenue");
    const expenseRows = rowsFor("expense");
    const totalRevenueFils = addFils(...revenueRows.map((r) => r.balanceFils), ZERO_FILS);
    const totalExpensesFils = addFils(...expenseRows.map((r) => r.balanceFils), ZERO_FILS);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      revenue: revenueRows.map(({ balanceFils, ...r }) => ({ ...r, amountJod: filsToJodString(balanceFils) })),
      expenses: expenseRows.map(({ balanceFils, ...r }) => ({ ...r, amountJod: filsToJodString(balanceFils) })),
      totalRevenueJod: filsToJodString(totalRevenueFils),
      totalExpensesJod: filsToJodString(totalExpensesFils),
      netIncomeJod: filsToJodString(subFils(totalRevenueFils, totalExpensesFils)),
    };
  });
  res.status(200).json(body);
});

glRouter.get("/gl/reports/balance-sheet", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const asOf = queryString(req, "asOf") ? new Date(queryString(req, "asOf")!) : new Date();

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const { accounts, totalsByAccountId } = await computeAccountTotals(tx, req.auth!.companyId, asOf);

    function rowsFor(type: AccountType) {
      return accounts.filter((a) => a.type === type).map((a) => {
        const t = totalsByAccountId.get(a.id) ?? { debit: ZERO_FILS, credit: ZERO_FILS };
        return { accountId: a.id, accountCode: a.code, accountName: a.name, accountType: a.type, balanceFils: accountBalance(type, t.debit, t.credit) };
      });
    }

    const assetRows = rowsFor("asset");
    const liabilityRows = rowsFor("liability");
    const equityRows = rowsFor("equity");
    const revenueRows = rowsFor("revenue");
    const expenseRows = rowsFor("expense");

    const sumFils = (rows: { balanceFils: Fils }[]) => addFils(...rows.map((r) => r.balanceFils), ZERO_FILS);

    const totalAssetsFils = sumFils(assetRows);
    const totalLiabilitiesFils = sumFils(liabilityRows);
    // Retained earnings from net income folds into equity so assets == liabilities + equity.
    const netIncomeFils = subFils(sumFils(revenueRows), sumFils(expenseRows));
    const totalEquityFils = addFils(sumFils(equityRows), netIncomeFils);

    const dropFils = <T extends { balanceFils: Fils }>(rows: T[]) =>
      rows.map(({ balanceFils, ...r }) => ({ ...r, balanceJod: filsToJodString(balanceFils) }));

    return {
      asOf: asOf.toISOString(),
      assets: dropFils(assetRows),
      liabilities: dropFils(liabilityRows),
      equity: dropFils(equityRows),
      totalAssetsJod: filsToJodString(totalAssetsFils),
      totalLiabilitiesJod: filsToJodString(totalLiabilitiesFils),
      totalEquityJod: filsToJodString(totalEquityFils),
    };
  });
  res.status(200).json(body);
});

glRouter.get("/gl/reports/cash-flow", requireAuth, requirePermission(REPORTS_MODULE, "view"), async (req, res) => {
  const fromRaw = queryString(req, "from");
  const toRaw = queryString(req, "to");
  if (!fromRaw || !toRaw) {
    res.status(400).json(validationError({ from: "from and to are required" }));
    return;
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  const body = await withTenant(db, req.auth!.companyId, async (tx) => {
    const [cashAccount] = await tx
      .select()
      .from(account)
      .where(and(eq(account.companyId, req.auth!.companyId), eq(account.code, WELL_KNOWN_ACCOUNT_CODES.cash)));
    if (!cashAccount) return { from: from.toISOString(), to: to.toISOString(), lines: [], netChangeJod: "0.000" };

    const rows = await tx
      .select({
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        sourceDocumentType: journalEntry.sourceDocumentType,
        debitFils: journalLine.debitFils,
        creditFils: journalLine.creditFils,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(and(eq(journalLine.accountId, cashAccount.id), gte(journalEntry.entryDate, from), lte(journalEntry.entryDate, to)))
      .orderBy(journalEntry.entryDate);

    let running = ZERO_FILS;
    const lines = rows.map((r) => {
      const signed = subFils(fils(r.debitFils), fils(r.creditFils));
      running = addFils(running, signed);
      return {
        date: r.entryDate.toISOString(),
        description: r.description,
        sourceDocumentType: r.sourceDocumentType,
        amountJod: filsToJodString(signed),
        runningBalanceJod: filsToJodString(running),
      };
    });

    return { from: from.toISOString(), to: to.toISOString(), lines, netChangeJod: filsToJodString(running) };
  });
  res.status(200).json(body);
});
