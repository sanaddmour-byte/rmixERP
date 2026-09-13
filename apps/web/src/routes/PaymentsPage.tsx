import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useCreatePayment,
  useGetPayment,
  useListBranches,
  useListPayments,
  useListVendorBills,
  useListVendors,
  type CreatePaymentRequestAllocationMode,
  type CreatePaymentRequestMethod,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";

type Method = CreatePaymentRequestMethod;
type AllocationMode = CreatePaymentRequestAllocationMode;

function PaymentDetailPanel({ id }: { id: string }) {
  const detail = useGetPayment(id);
  const d = detail.data?.status === 200 ? detail.data.data : undefined;
  if (detail.isLoading) return <p className="text-sm text-navy-400">Loading…</p>;
  if (!d) return <p className="text-sm text-navy-400">Not found.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {d.receiptNumber} — {d.amountJod} JOD
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-navy-500">
          {d.method.replace(/_/g, " ")} — paid {new Date(d.paidAt).toLocaleDateString()}
          {d.reference && ` — ref ${d.reference}`}
        </p>
        <div>
          <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">Allocations</p>
          {d.allocations.length === 0 && <p className="text-navy-400">None.</p>}
          {d.allocations.map((a) => (
            <div key={a.id} className={`text-navy-600 dark:text-navy-300 ${a.voidedAt ? "line-through opacity-50" : ""}`}>
              {a.amountJod} JOD →{" "}
              <Link href={`/vendor-bills?id=${a.vendorBillId}`} className="text-orange-600 hover:underline dark:text-orange-400">
                bill {a.vendorBillId.slice(0, 8)}…
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecordPaymentPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const permissions = useModulePermissions("payments");
  const vendors = useListVendors({ page: 1, pageSize: 100 });
  const vendorOptions = vendors.data?.status === 200 && typeof vendors.data.data !== "string" ? vendors.data.data.items : [];

  const [vendorId, setVendorId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [method, setMethod] = React.useState<Method>("cash");
  const [amountJod, setAmountJod] = React.useState("");
  const [allocationMode, setAllocationMode] = React.useState<AllocationMode>("fifo");
  const [reference, setReference] = React.useState("");
  const [manualBillId, setManualBillId] = React.useState("");
  const [manualAmountJod, setManualAmountJod] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openBills = useListVendorBills({ page: 1, pageSize: 100, status: "approved", ...(vendorId && { vendorId }) });
  const openBillItems = openBills.data?.status === 200 ? openBills.data.data.items : [];

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions = branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const create = useCreatePayment();

  if (!permissions.create) return null;

  function reset() {
    setAmountJod("");
    setReference("");
    setManualBillId("");
    setManualAmountJod("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        data: {
          vendorId,
          branchId,
          method,
          amountJod,
          paidAt: new Date().toISOString(),
          allocationMode,
          ...(reference && { reference }),
          ...(allocationMode === "manual" && manualBillId && { allocations: [{ vendorBillId: manualBillId, amountJod: manualAmountJod }] }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            reset();
            onCreated(result.data.id);
          } else {
            setError("Could not record the payment — check the amount and allocation.");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Vendor
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                required
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="" disabled>
                  Select…
                </option>
                {vendorOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Branch
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="" disabled>
                  Select…
                </option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Method
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Amount (JOD)
              <Input required value={amountJod} onChange={(e) => setAmountJod(e.target.value)} className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Reference
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="w-40" />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Allocation
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                value={allocationMode}
                onChange={(e) => setAllocationMode(e.target.value as AllocationMode)}
              >
                <option value="fifo">Auto (FIFO by due date)</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            {allocationMode === "manual" && (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  Bill
                  <select
                    className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                    value={manualBillId}
                    onChange={(e) => setManualBillId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {openBillItems.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} — {b.totalJod} JOD
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Amount for this bill (JOD)
                  <Input value={manualAmountJod} onChange={(e) => setManualAmountJod(e.target.value)} className="w-32" />
                </label>
              </>
            )}
            <Button type="submit" disabled={create.isPending || !vendorId || !branchId || !amountJod}>
              Record
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-orange-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get("id"));
  const [vendorFilterId] = React.useState(() => searchParams.get("vendorId") ?? "");
  const list = useListPayments({ page, pageSize: 20, ...(vendorFilterId && { vendorId: vendorFilterId }) });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  const vendors = useListVendors({ page: 1, pageSize: 100 });
  const vendorOptions = vendors.data?.status === 200 && typeof vendors.data.data !== "string" ? vendors.data.data.items : [];
  const vendorById = new Map(vendorOptions.map((v) => [v.id, v.name]));

  return (
    <div className="space-y-4">
      <RecordPaymentPanel
        onCreated={(id) => {
          setSelectedId(id);
          void list.refetch();
        }}
      />

      {vendorFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one vendor.{" "}
          <Link href="/payments" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Receipt #</th>
                <th className="py-2 pe-4 font-medium">Vendor</th>
                <th className="py-2 pe-4 font-medium">Method</th>
                <th className="py-2 pe-4 font-medium">Amount (JOD)</th>
                <th className="py-2 pe-4 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {body?.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-2 pe-4">{row.receiptNumber}</td>
                  <td className="py-2 pe-4">{vendorById.get(row.vendorId) ?? row.vendorId}</td>
                  <td className="py-2 pe-4 capitalize">{row.method.replace(/_/g, " ")}</td>
                  <td className="py-2 pe-4">{row.amountJod}</td>
                  <td className="py-2 pe-4">{new Date(row.paidAt).toLocaleDateString()}</td>
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

      {selectedId && <PaymentDetailPanel id={selectedId} />}
    </div>
  );
}
