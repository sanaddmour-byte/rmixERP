import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useApproveVendorBill,
  useCreateVendorBill,
  useGetPurchaseOrder,
  useListPurchaseOrders,
  useListRawMaterials,
  useListVendorBills,
  type VendorBill,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

type Status = VendorBill["status"];

const STATUS_TONE: Record<Status, BadgeTone> = {
  draft: "gray",
  approved: "yellow",
  partially_paid: "yellow",
  paid: "green",
  cancelled: "gray",
};

function BillAgainstPurchaseOrder({ purchaseOrderId, onBilled }: { purchaseOrderId: string; onBilled: () => void }) {
  const po = useGetPurchaseOrder(purchaseOrderId);
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const rawMaterialOptions = rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];
  const create = useCreateVendorBill();

  const o = po.data?.status === 200 ? po.data.data : undefined;
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [vendorReference, setVendorReference] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (po.isLoading) return <p className="text-navy-500">Loading purchase order…</p>;
  if (!o) return <p className="text-navy-500">Purchase order not found.</p>;
  if (o.status !== "received" && o.status !== "billed") {
    return <p className="text-sm text-navy-500">This purchase order has no goods received yet — nothing to bill.</p>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dueDate) {
      setError("Set a due date.");
      return;
    }
    const lines = Object.entries(quantities)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([purchaseOrderLineId, quantity]) => ({
        purchaseOrderLineId,
        quantity,
        description: rawMaterialOptions.find((r) => r.id === o!.lines.find((l) => l.id === purchaseOrderLineId)?.rawMaterialId)?.name ?? "Goods",
      }));
    if (lines.length === 0) {
      setError("Enter a quantity for at least one line.");
      return;
    }
    create.mutate(
      { data: { purchaseOrderId, ...(vendorReference && { vendorReference }), dueDate: new Date(dueDate).toISOString(), lines } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setQuantities({});
            setVendorReference("");
            setDueDate("");
            void po.refetch();
            onBilled();
          } else {
            setError("Could not create the bill — check the quantities against what remains unbilled.");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Vendor Bill — {o.poNumber}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Raw Material</th>
                <th className="py-2 pe-4 font-medium">Received</th>
                <th className="py-2 pe-4 font-medium">Bill quantity</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((line) => (
                <tr key={line.id} className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4">{rawMaterialOptions.find((r) => r.id === line.rawMaterialId)?.name ?? line.rawMaterialId}</td>
                  <td className="py-2 pe-4">{line.receivedQuantity}</td>
                  <td className="py-2 pe-4">
                    <Input
                      value={quantities[line.id] ?? ""}
                      onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: e.target.value }))}
                      className="w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Vendor reference
              <Input value={vendorReference} onChange={(e) => setVendorReference(e.target.value)} className="w-48" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Due date
              <Input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
            </label>
            <Button type="submit" disabled={create.isPending}>
              Create Bill
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-orange-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function VendorBillsPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<Status | "">("");
  const [purchaseOrderFilterId] = React.useState(() => searchParams.get("purchaseOrderId") ?? "");
  const permissions = useModulePermissions("vendorBills");

  const list = useListVendorBills({ page, pageSize: 20, ...(status && { status }) });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const filteredItems = purchaseOrderFilterId ? (body?.items ?? []).filter((b) => b.purchaseOrderId === purchaseOrderFilterId) : (body?.items ?? []);
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  const receivedPOs = useListPurchaseOrders({ page: 1, pageSize: 100, status: "received" });
  const receivedPOOptions = receivedPOs.data?.status === 200 ? receivedPOs.data.data.items : [];
  const [pickedPOId, setPickedPOId] = React.useState("");
  const activePOId = purchaseOrderFilterId || pickedPOId;

  const approve = useApproveVendorBill(refetchOnSuccess(list));

  return (
    <div className="space-y-4">
      {permissions.create && !purchaseOrderFilterId && (
        <Card>
          <CardHeader>
            <CardTitle>Bill a Received Purchase Order</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={pickedPOId}
              onChange={(e) => setPickedPOId(e.target.value)}
            >
              <option value="">Select a received purchase order…</option>
              {receivedPOOptions.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.totalJod} JOD
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {permissions.create && activePOId && <BillAgainstPurchaseOrder purchaseOrderId={activePOId} onBilled={() => list.refetch()} />}

      {purchaseOrderFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one purchase order.{" "}
          <Link href="/vendor-bills" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Vendor Bills</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Bill #</th>
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Total (JOD)</th>
                <th className="py-2 pe-4 font-medium">Allocated (JOD)</th>
                <th className="py-2 pe-4 font-medium">Due</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {!list.isLoading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    No records yet.
                  </td>
                </tr>
              )}
              {filteredItems.map((row) => (
                <tr key={row.id} className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4">{row.billNumber}</td>
                  <td className="py-2 pe-4">
                    <StatusBadge label={row.status.replace(/_/g, " ")} tone={STATUS_TONE[row.status]} />
                  </td>
                  <td className="py-2 pe-4">{row.totalJod}</td>
                  <td className="py-2 pe-4">{row.allocatedJod}</td>
                  <td className="py-2 pe-4">{new Date(row.dueDate).toLocaleDateString()}</td>
                  <td className="py-2 text-end">
                    {row.status === "draft" && permissions.approve && (
                      <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: row.id })}>
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!purchaseOrderFilterId && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
