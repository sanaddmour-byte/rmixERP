import * as React from "react";
import {
  useGetAgingReport,
  useGetCreditControlDashboard,
  useGetCreditOverridesReport,
  useGetCustomerStatement,
  useListCustomers,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

function utilizationTone(basisPoints: number): BadgeTone {
  if (basisPoints > 10_000) return "red";
  if (basisPoints >= 7_000) return "yellow";
  return "green";
}

function CustomerStatementSection() {
  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions = customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];
  const [customerId, setCustomerId] = React.useState("");

  const statement = useGetCustomerStatement({ customerId }, { query: { enabled: Boolean(customerId) } });
  const s = statement.data?.status === 200 ? statement.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Statement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Select a customer…</option>
          {customerOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {s && (
          <div className="space-y-2 text-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                  <th className="py-2 pe-4 font-medium">Date</th>
                  <th className="py-2 pe-4 font-medium">Type</th>
                  <th className="py-2 pe-4 font-medium">Document #</th>
                  <th className="py-2 pe-4 font-medium">Debit</th>
                  <th className="py-2 pe-4 font-medium">Credit</th>
                  <th className="py-2 pe-4 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l, idx) => (
                  <tr key={idx} className="border-b border-navy-100 dark:border-navy-800">
                    <td className="py-2 pe-4">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="py-2 pe-4 capitalize">{l.type}</td>
                    <td className="py-2 pe-4">{l.documentNumber}</td>
                    <td className="py-2 pe-4">{l.debitJod !== "0.000" ? l.debitJod : "—"}</td>
                    <td className="py-2 pe-4">{l.creditJod !== "0.000" ? l.creditJod : "—"}</td>
                    <td className="py-2 pe-4">{l.runningBalanceJod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-semibold text-navy-700 dark:text-navy-300">Closing balance: {s.closingBalanceJod} JOD</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgingReportSection() {
  const aging = useGetAgingReport({});
  const a = aging.data?.status === 200 ? aging.data.data : undefined;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Aging Report</CardTitle>
        <a href="/api/reports/aging?format=csv" download>
          <Button size="sm" variant="outline">
            Export CSV
          </Button>
        </a>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Customer</th>
              <th className="py-2 pe-4 font-medium">Current</th>
              <th className="py-2 pe-4 font-medium">1-30d</th>
              <th className="py-2 pe-4 font-medium">31-60d</th>
              <th className="py-2 pe-4 font-medium">90+d</th>
              <th className="py-2 pe-4 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {(a?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No open invoices.
                </td>
              </tr>
            )}
            {a?.items.map((i) => (
              <tr key={i.customerId} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{i.customerName}</td>
                <td className="py-2 pe-4">{i.currentJod}</td>
                <td className="py-2 pe-4">{i.days30Jod}</td>
                <td className={`py-2 pe-4 ${i.days60Jod !== "0.000" ? "font-medium text-yellow-700" : ""}`}>{i.days60Jod}</td>
                <td className={`py-2 pe-4 ${i.days90PlusJod !== "0.000" ? "font-medium text-red-700" : ""}`}>{i.days90PlusJod}</td>
                <td className="py-2 pe-4 font-semibold">{i.totalJod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {a && <p className="mt-2 text-sm font-semibold text-navy-700 dark:text-navy-300">Grand total: {a.grandTotalJod} JOD</p>}
      </CardContent>
    </Card>
  );
}

function CreditControlSection() {
  const dashboard = useGetCreditControlDashboard();
  const d = dashboard.data?.status === 200 ? dashboard.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit Control Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Customer</th>
              <th className="py-2 pe-4 font-medium">Policy</th>
              <th className="py-2 pe-4 font-medium">Limit</th>
              <th className="py-2 pe-4 font-medium">Outstanding</th>
              <th className="py-2 pe-4 font-medium">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {(d?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No outstanding exposure.
                </td>
              </tr>
            )}
            {d?.items.map((i) => (
              <tr key={i.customerId} className={`border-b border-navy-100 dark:border-navy-800 ${i.utilizationBasisPoints > 10_000 ? "bg-red-50" : ""}`}>
                <td className="py-2 pe-4">{i.customerName}</td>
                <td className="py-2 pe-4 capitalize">{i.creditPolicy}</td>
                <td className="py-2 pe-4">{i.creditLimitJod}</td>
                <td className="py-2 pe-4">{i.outstandingJod}</td>
                <td className="py-2 pe-4">
                  <StatusBadge
                    label={`${(i.utilizationBasisPoints / 100).toFixed(1)}%`}
                    tone={utilizationTone(i.utilizationBasisPoints)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CreditOverridesSection() {
  const report = useGetCreditOverridesReport({});
  const r = report.data?.status === 200 ? report.data.data : undefined;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Credit Overrides Report</CardTitle>
        <a href="/api/reports/credit-overrides?format=csv" download>
          <Button size="sm" variant="outline">
            Export CSV
          </Button>
        </a>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2 pe-4 font-medium">Customer</th>
              <th className="py-2 pe-4 font-medium">Exceeded By</th>
              <th className="py-2 pe-4 font-medium">By</th>
              <th className="py-2 pe-4 font-medium">Reason</th>
              <th className="py-2 pe-4 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {(r?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No overrides recorded.
                </td>
              </tr>
            )}
            {r?.items.map((i) => (
              <tr key={i.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4 capitalize">{i.documentType.replace(/_/g, " ")}</td>
                <td className="py-2 pe-4">{i.customerName}</td>
                <td className="py-2 pe-4">{i.exceededByJod}</td>
                <td className="py-2 pe-4">{i.overriddenByName ?? "—"}</td>
                <td className="py-2 pe-4">{i.reason ?? "—"}</td>
                <td className="py-2 pe-4">{new Date(i.overriddenAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r && r.totalsByUser.length > 0 && (
          <div>
            <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">Totals by user</p>
            {r.totalsByUser.map((t) => (
              <p key={t.userId} className="text-sm text-navy-600 dark:text-navy-300">
                {t.userName}: {t.count} override{t.count === 1 ? "" : "s"}, {t.totalExceededByJod} JOD total exceeded
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Combines the four receivables reports into one page (matching the established pattern of stacking related sections, e.g. Phase 4's QCPage). Back-office/Accountant screens — see CollectionsPage/PostDatedChequesPage for the mobile-critical field-facing screens. */
export function ReceivablesReportsPage() {
  const permissions = useModulePermissions("receivablesReports");
  if (!permissions.view) return <p className="text-sm text-navy-400">You do not have access to receivables reports.</p>;

  return (
    <div className="space-y-4">
      <CustomerStatementSection />
      <AgingReportSection />
      <CreditControlSection />
      <CreditOverridesSection />
    </div>
  );
}
