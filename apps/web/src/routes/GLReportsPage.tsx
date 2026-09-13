import * as React from "react";
import { useGetBalanceSheet, useGetCashFlow, useGetProfitAndLoss, useGetTrialBalance } from "@rmixerp/contract";
import { Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";

function todayIso() {
  return new Date().toISOString();
}

function monthAgoIso() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function TrialBalanceSection() {
  const report = useGetTrialBalance({});
  const r = report.data?.status === 200 ? report.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trial Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Code</th>
              <th className="py-2 pe-4 font-medium">Account</th>
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2 pe-4 font-medium">Balance (JOD)</th>
            </tr>
          </thead>
          <tbody>
            {(r?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No postings yet.
                </td>
              </tr>
            )}
            {r?.rows.map((row) => (
              <tr key={row.accountId} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{row.accountCode}</td>
                <td className="py-2 pe-4">{row.accountName}</td>
                <td className="py-2 pe-4 capitalize">{row.accountType}</td>
                <td className="py-2 pe-4">{row.balanceJod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r && (
          <p className="mt-2 text-sm font-semibold text-navy-700 dark:text-navy-300">
            Total debit {r.totalDebitJod} JOD — Total credit {r.totalCreditJod} JOD
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProfitAndLossSection() {
  const [from] = React.useState(monthAgoIso);
  const [to] = React.useState(todayIso);
  const report = useGetProfitAndLoss({ from, to });
  const r = report.data?.status === 200 ? report.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit &amp; Loss (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">Revenue</p>
          {(r?.revenue.length ?? 0) === 0 && <p className="text-navy-400">None.</p>}
          {r?.revenue.map((row) => (
            <div key={row.accountId} className="flex justify-between text-navy-600 dark:text-navy-300">
              <span>{row.accountName}</span>
              <span>{row.amountJod} JOD</span>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">Expenses</p>
          {(r?.expenses.length ?? 0) === 0 && <p className="text-navy-400">None.</p>}
          {r?.expenses.map((row) => (
            <div key={row.accountId} className="flex justify-between text-navy-600 dark:text-navy-300">
              <span>{row.accountName}</span>
              <span>{row.amountJod} JOD</span>
            </div>
          ))}
        </div>
        {r && (
          <p className="font-semibold text-navy-700 dark:text-navy-300">
            Net income: {r.netIncomeJod} JOD (revenue {r.totalRevenueJod} − expenses {r.totalExpensesJod})
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceSheetSection() {
  const report = useGetBalanceSheet({});
  const r = report.data?.status === 200 ? report.data.data : undefined;

  function rows(title: string, items: { accountId: string; accountName: string; balanceJod: string }[] | undefined) {
    return (
      <div>
        <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">{title}</p>
        {(items?.length ?? 0) === 0 && <p className="text-navy-400">None.</p>}
        {items?.map((row) => (
          <div key={row.accountId} className="flex justify-between text-navy-600 dark:text-navy-300">
            <span>{row.accountName}</span>
            <span>{row.balanceJod} JOD</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance Sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rows("Assets", r?.assets)}
        {rows("Liabilities", r?.liabilities)}
        {rows("Equity", r?.equity)}
        {r && (
          <p className="font-semibold text-navy-700 dark:text-navy-300">
            Total assets {r.totalAssetsJod} JOD = liabilities {r.totalLiabilitiesJod} JOD + equity {r.totalEquityJod} JOD
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CashFlowSection() {
  const [from] = React.useState(monthAgoIso);
  const [to] = React.useState(todayIso);
  const report = useGetCashFlow({ from, to });
  const r = report.data?.status === 200 ? report.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Date</th>
              <th className="py-2 pe-4 font-medium">Description</th>
              <th className="py-2 pe-4 font-medium">Amount (JOD)</th>
              <th className="py-2 pe-4 font-medium">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {(r?.lines.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No cash movements in this window.
                </td>
              </tr>
            )}
            {r?.lines.map((line, idx) => (
              <tr key={idx} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{new Date(line.date).toLocaleDateString()}</td>
                <td className="py-2 pe-4">{line.description}</td>
                <td className="py-2 pe-4">{line.amountJod}</td>
                <td className="py-2 pe-4">{line.runningBalanceJod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r && <p className="mt-2 text-sm font-semibold text-navy-700 dark:text-navy-300">Net change: {r.netChangeJod} JOD</p>}
      </CardContent>
    </Card>
  );
}

/** Back-office/Accountant reports (web-only, no mobile equivalent — matches CLAUDE.md's exception for GL, same footing as ReceivablesReportsPage). */
export function GLReportsPage() {
  const permissions = useModulePermissions("glReports");
  if (!permissions.view) return <p className="text-sm text-navy-400">You do not have access to GL reports.</p>;

  return (
    <div className="space-y-4">
      <TrialBalanceSection />
      <ProfitAndLossSection />
      <BalanceSheetSection />
      <CashFlowSection />
    </div>
  );
}
