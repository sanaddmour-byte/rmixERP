import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useCreateCreditNote,
  useCreateDebitNote,
  useGenerateInvoice,
  useGetInvoice,
  useIssueInvoice,
  useListCustomers,
  useListDeliveryOrders,
  useListInvoices,
  useSubmitInvoiceForClearance,
  type Invoice,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type InvoiceStatus = Invoice["status"];

function GenerateInvoicePanel({ onGenerated }: { onGenerated: (invoiceId: string) => void }) {
  const permissions = useModulePermissions("invoices");
  const undelivered = useListDeliveryOrders({ page: 1, pageSize: 50, status: "delivered" });
  const options = undelivered.data?.status === 200 ? undelivered.data.data.items : [];
  const generate = useGenerateInvoice();

  const [deliveryOrderId, setDeliveryOrderId] = React.useState("");
  const [mode, setMode] = React.useState<"combined" | "split">("combined");
  const [error, setError] = React.useState<string | null>(null);

  if (!permissions.create) return null;

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    generate.mutate(
      { id: deliveryOrderId, data: { mode } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setDeliveryOrderId("");
            void undelivered.refetch();
            onGenerated(result.data.invoices[0]!.id);
          } else if (result.status === 409) {
            setError("This delivery order has already been invoiced.");
          } else {
            setError("Could not generate the invoice.");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Invoice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {options.length === 0 && <p className="text-sm text-navy-400">No delivered, not-yet-invoiced delivery orders.</p>}
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Delivery Order
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              required
              value={deliveryOrderId}
              onChange={(e) => setDeliveryOrderId(e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.quantityM3} m³ — {new Date(o.scheduledAt).toLocaleDateString()} — {o.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Mode
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={mode}
              onChange={(e) => setMode(e.target.value as "combined" | "split")}
            >
              <option value="combined">Combined (one invoice)</option>
              <option value="split">Split (taxable + exempt pair)</option>
            </select>
          </label>
          <Button type="submit" disabled={generate.isPending || !deliveryOrderId}>
            Generate
          </Button>
        </form>
        {error && <p className="text-sm text-orange-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

function InvoiceDetailPanel({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const permissions = useModulePermissions("invoices");
  const clearancePermissions = useModulePermissions("clearance");
  const detail = useGetInvoice(id);
  const createCredit = useCreateCreditNote(refetchOnSuccess(detail));
  const createDebit = useCreateDebitNote(refetchOnSuccess(detail));
  const submitForClearance = useSubmitInvoiceForClearance(refetchOnSuccess(detail));
  const issue = useIssueInvoice(refetchOnSuccess(detail));

  const [creditAmount, setCreditAmount] = React.useState("");
  const [creditReason, setCreditReason] = React.useState("");
  const [debitAmount, setDebitAmount] = React.useState("");
  const [debitReason, setDebitReason] = React.useState("");

  const inv = detail.data?.status === 200 ? detail.data.data : undefined;
  if (detail.isLoading) return <p className="text-sm text-navy-400">Loading…</p>;
  if (!inv) return <p className="text-sm text-navy-400">Not found.</p>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          Invoice {inv.invoiceNumber} — <span className="capitalize">{inv.status.replace(/_/g, " ")}</span>
        </CardTitle>
        {clearancePermissions.create && (
          <div className="flex gap-2">
            {(inv.status === "draft" || inv.clearanceStatus === "retrying") && (
              <Button size="sm" disabled={submitForClearance.isPending} onClick={() => submitForClearance.mutate({ id })}>
                {inv.clearanceStatus === "retrying" ? "Retry Clearance" : "Submit for Clearance"}
              </Button>
            )}
            {inv.status === "cleared" && (
              <Button size="sm" disabled={issue.isPending} onClick={() => issue.mutate({ id })}>
                Issue
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {inv.relatedInvoiceId && (
          <p className="text-navy-500">
            Paired with invoice{" "}
            <button
              type="button"
              onClick={() => onSelect(inv.relatedInvoiceId!)}
              className="text-orange-600 hover:underline dark:text-orange-400"
            >
              {inv.relatedInvoiceId.slice(0, 8)}…
            </button>
          </p>
        )}
        <div className="rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-3 text-xs text-navy-600 dark:text-navy-300">
          <span className="font-semibold capitalize">Clearance: {inv.clearanceStatus.replace(/_/g, " ")}</span>
          {inv.clearanceIcv !== null && <span className="ms-3">ICV {inv.clearanceIcv}</span>}
          {inv.clearanceQrPayload && <span className="ms-3">QR: {inv.clearanceQrPayload}</span>}
          {inv.clearanceError && <span className="ms-3 text-orange-700">{inv.clearanceError}</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Description</th>
              <th className="py-2 pe-4 font-medium">Treatment</th>
              <th className="py-2 pe-4 font-medium">Net</th>
              <th className="py-2 pe-4 font-medium">Tax</th>
              <th className="py-2 pe-4 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{l.description}</td>
                <td className="py-2 pe-4 capitalize">{l.taxTreatment}</td>
                <td className="py-2 pe-4">{l.netJod}</td>
                <td className="py-2 pe-4">{l.taxJod}</td>
                <td className="py-2 pe-4">{l.totalJod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-6 font-semibold text-navy-700 dark:text-navy-300">
          <span>Subtotal: {inv.subtotalJod} JOD</span>
          <span>Tax: {inv.taxJod} JOD</span>
          <span>Total: {inv.totalJod} JOD</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="font-semibold text-navy-700 dark:text-navy-300">Credit Notes</p>
            {inv.creditNotes.length === 0 && <p className="text-navy-400">None.</p>}
            {inv.creditNotes.map((n) => (
              <div key={n.id} className="text-navy-600 dark:text-navy-300">
                {n.noteNumber}: {n.totalJod} JOD — {n.reason}
              </div>
            ))}
            {permissions.create && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createCredit.mutate({ id, data: { amountJod: creditAmount, reason: creditReason } });
                  setCreditAmount("");
                  setCreditReason("");
                }}
                className="flex flex-wrap items-end gap-2"
              >
                <Input placeholder="Amount (JOD)" required value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="w-28" />
                <Input placeholder="Reason" required value={creditReason} onChange={(e) => setCreditReason(e.target.value)} className="w-48" />
                <Button type="submit" size="sm" disabled={createCredit.isPending}>
                  Add
                </Button>
              </form>
            )}
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-navy-700 dark:text-navy-300">Debit Notes</p>
            {inv.debitNotes.length === 0 && <p className="text-navy-400">None.</p>}
            {inv.debitNotes.map((n) => (
              <div key={n.id} className="text-navy-600 dark:text-navy-300">
                {n.noteNumber}: {n.totalJod} JOD — {n.reason}
              </div>
            ))}
            {permissions.create && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createDebit.mutate({ id, data: { amountJod: debitAmount, reason: debitReason } });
                  setDebitAmount("");
                  setDebitReason("");
                }}
                className="flex flex-wrap items-end gap-2"
              >
                <Input placeholder="Amount (JOD)" required value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} className="w-28" />
                <Input placeholder="Reason" required value={debitReason} onChange={(e) => setDebitReason(e.target.value)} className="w-48" />
                <Button type="submit" size="sm" disabled={createDebit.isPending}>
                  Add
                </Button>
              </form>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InvoicesPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<InvoiceStatus | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get("id"));
  const [customerFilterId] = React.useState(() => searchParams.get("customerId") ?? "");

  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];
  const customerById = new Map(customerOptions.map((c) => [c.id, c.name]));

  const list = useListInvoices({
    page,
    pageSize: 20,
    ...(status && { status }),
    ...(customerFilterId && { customerId: customerFilterId }),
  });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  return (
    <div className="space-y-4">
      <GenerateInvoicePanel
        onGenerated={(invoiceId) => {
          setSelectedId(invoiceId);
          void list.refetch();
        }}
      />

      {customerFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one customer.{" "}
          <Link href="/invoices" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Invoices</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InvoiceStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_clearance">Pending Clearance</option>
            <option value="cleared">Cleared</option>
            <option value="issued">Issued</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Invoice #</th>
                <th className="py-2 pe-4 font-medium">Customer</th>
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Clearance</th>
                <th className="py-2 pe-4 font-medium">Total (JOD)</th>
                <th className="py-2 pe-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    No records yet.
                  </td>
                </tr>
              )}
              {body?.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-2 pe-4">{row.invoiceNumber}</td>
                  <td className="py-2 pe-4">
                    <Link
                      href={`/receivables-reports?customerId=${row.customerId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customerById.get(row.customerId) ?? row.customerId}
                    </Link>
                  </td>
                  <td className="py-2 pe-4 capitalize">{row.status.replace(/_/g, " ")}</td>
                  <td className="py-2 pe-4 capitalize">{row.clearanceStatus.replace(/_/g, " ")}</td>
                  <td className="py-2 pe-4">{row.totalJod}</td>
                  <td className="py-2 pe-4">{new Date(row.invoicedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-sm text-navy-500 dark:text-navy-400">
            <span>
              Page {page} of {totalPages} ({body?.total ?? 0} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedId && <InvoiceDetailPanel id={selectedId} onSelect={setSelectedId} />}
    </div>
  );
}
