import * as React from "react";
import {
  useCreateCollection,
  useGetCollection,
  useListBranches,
  useListCollections,
  useListCustomers,
  useListInvoices,
  type CreateCollectionRequestAllocationMode,
  type CreateCollectionRequestMethod,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";

type Method = CreateCollectionRequestMethod;
type AllocationMode = CreateCollectionRequestAllocationMode;

function CollectionDetailPanel({ id }: { id: string }) {
  const detail = useGetCollection(id);
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
          {d.method.replace(/_/g, " ")} — received {new Date(d.receivedAt).toLocaleDateString()}
          {d.reference && ` — ref ${d.reference}`}
        </p>
        <div>
          <p className="mb-1 font-semibold text-navy-700 dark:text-navy-300">Allocations</p>
          {d.allocations.length === 0 && <p className="text-navy-400">None.</p>}
          {d.allocations.map((a) => (
            <div key={a.id} className={`text-navy-600 dark:text-navy-300 ${a.voidedAt ? "line-through opacity-50" : ""}`}>
              {a.amountJod} JOD → invoice {a.invoiceId.slice(0, 8)}… {a.voidedAt && "(unwound)"}
            </div>
          ))}
        </div>
        {d.postDatedCheque && (
          <div className="rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-2">
            <p className="font-semibold text-navy-700 dark:text-navy-300">Post-dated cheque</p>
            <p className="text-navy-600 dark:text-navy-300">
              {d.postDatedCheque.bankName} #{d.postDatedCheque.chequeNumber} — due {new Date(d.postDatedCheque.dueDate).toLocaleDateString()} —{" "}
              <span className="capitalize">{d.postDatedCheque.status}</span>
            </p>
            {d.postDatedCheque.bounceReason && <p className="text-orange-700">Bounced: {d.postDatedCheque.bounceReason}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordCollectionPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const permissions = useModulePermissions("collections");
  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions = customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];

  const [customerId, setCustomerId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [method, setMethod] = React.useState<Method>("cash");
  const [amountJod, setAmountJod] = React.useState("");
  const [allocationMode, setAllocationMode] = React.useState<AllocationMode>("fifo");
  const [reference, setReference] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeDueDate, setChequeDueDate] = React.useState("");
  const [manualInvoiceId, setManualInvoiceId] = React.useState("");
  const [manualAmountJod, setManualAmountJod] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openInvoices = useListInvoices({ page: 1, pageSize: 100, status: "issued", ...(customerId && { customerId }) });
  const openInvoiceItems = openInvoices.data?.status === 200 ? openInvoices.data.data.items : [];

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions = branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const create = useCreateCollection();

  if (!permissions.create) return null;

  function reset() {
    setAmountJod("");
    setReference("");
    setBankName("");
    setChequeNumber("");
    setChequeDueDate("");
    setManualInvoiceId("");
    setManualAmountJod("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        data: {
          customerId,
          branchId,
          method,
          amountJod,
          receivedAt: new Date().toISOString(),
          allocationMode,
          ...(reference && { reference }),
          ...(method === "post_dated_cheque" && { bankName, chequeNumber, chequeDueDate: new Date(chequeDueDate).toISOString() }),
          ...(allocationMode === "manual" && manualInvoiceId && { allocations: [{ invoiceId: manualInvoiceId, amountJod: manualAmountJod }] }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            reset();
            onCreated(result.data.id);
          } else {
            setError("Could not record the collection — check the amount and allocation.");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Collection</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Customer
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="" disabled>
                  Select…
                </option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                <option value="post_dated_cheque">Post-dated Cheque</option>
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

          {method === "post_dated_cheque" && (
            <div className="flex flex-wrap gap-2 rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-2">
              <label className="flex flex-col gap-1 text-xs">
                Bank
                <Input required value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-40" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Cheque #
                <Input required value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="w-32" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Cheque due date
                <Input required type="date" value={chequeDueDate} onChange={(e) => setChequeDueDate(e.target.value)} className="w-40" />
              </label>
            </div>
          )}

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
                  Invoice
                  <select
                    className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                    value={manualInvoiceId}
                    onChange={(e) => setManualInvoiceId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {openInvoiceItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} — {i.totalJod} JOD
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Amount for this invoice (JOD)
                  <Input value={manualAmountJod} onChange={(e) => setManualAmountJod(e.target.value)} className="w-32" />
                </label>
              </>
            )}
            <Button type="submit" disabled={create.isPending || !customerId || !branchId || !amountJod}>
              Record
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-orange-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function CollectionsPage() {
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const list = useListCollections({ page, pageSize: 20 });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions = customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];
  const customerById = new Map(customerOptions.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <RecordCollectionPanel
        onCreated={(id) => {
          setSelectedId(id);
          void list.refetch();
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Receipt #</th>
                <th className="py-2 pe-4 font-medium">Customer</th>
                <th className="py-2 pe-4 font-medium">Method</th>
                <th className="py-2 pe-4 font-medium">Amount (JOD)</th>
                <th className="py-2 pe-4 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {body?.items.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800" onClick={() => setSelectedId(row.id)}>
                  <td className="py-2 pe-4">{row.receiptNumber}</td>
                  <td className="py-2 pe-4">{customerById.get(row.customerId) ?? row.customerId}</td>
                  <td className="py-2 pe-4 capitalize">{row.method.replace(/_/g, " ")}</td>
                  <td className="py-2 pe-4">{row.amountJod}</td>
                  <td className="py-2 pe-4">{new Date(row.receivedAt).toLocaleDateString()}</td>
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

      {selectedId && <CollectionDetailPanel id={selectedId} />}
    </div>
  );
}
