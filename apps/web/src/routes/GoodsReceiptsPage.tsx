import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useCreateGoodsReceipt,
  useGetPurchaseOrder,
  useListGoodsReceipts,
  useListPurchaseOrders,
  useListRawMaterials,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";

function ReceiveAgainstPurchaseOrder({ purchaseOrderId, onReceived }: { purchaseOrderId: string; onReceived: () => void }) {
  const po = useGetPurchaseOrder(purchaseOrderId);
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const rawMaterialOptions = rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];
  const create = useCreateGoodsReceipt();

  const o = po.data?.status === 200 ? po.data.data : undefined;
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (po.isLoading) return <p className="text-navy-500">Loading purchase order…</p>;
  if (!o) return <p className="text-navy-500">Purchase order not found.</p>;
  if (o.status !== "approved" && o.status !== "received") {
    return <p className="text-sm text-navy-500">This purchase order isn't approved yet — nothing to receive.</p>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const lines = Object.entries(quantities)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([purchaseOrderLineId, quantityReceived]) => ({ purchaseOrderLineId, quantityReceived }));
    if (lines.length === 0) {
      setError("Enter a received quantity for at least one line.");
      return;
    }
    create.mutate(
      { data: { purchaseOrderId, ...(notes && { notes }), lines } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setQuantities({});
            setNotes("");
            void po.refetch();
            onReceived();
          } else {
            setError("Could not record the receipt — check the quantities.");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive Goods — {o.poNumber}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Raw Material</th>
                <th className="py-2 pe-4 font-medium">Ordered</th>
                <th className="py-2 pe-4 font-medium">Received so far</th>
                <th className="py-2 pe-4 font-medium">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((line) => (
                <tr key={line.id} className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4">{rawMaterialOptions.find((r) => r.id === line.rawMaterialId)?.name ?? line.rawMaterialId}</td>
                  <td className="py-2 pe-4">{line.quantity}</td>
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
          <label className="flex flex-col gap-1 text-xs">
            Notes
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-72" />
          </label>
          <Button type="submit" disabled={create.isPending}>
            Record Receipt
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-orange-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function GoodsReceiptsPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [purchaseOrderFilterId] = React.useState(() => searchParams.get("purchaseOrderId") ?? "");
  const permissions = useModulePermissions("goodsReceipts");

  const list = useListGoodsReceipts({ page, pageSize: 20, ...(purchaseOrderFilterId && { purchaseOrderId: purchaseOrderFilterId }) });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  const approvedPOs = useListPurchaseOrders({ page: 1, pageSize: 100, status: "approved" });
  const approvedPOOptions = approvedPOs.data?.status === 200 ? approvedPOs.data.data.items : [];
  const [pickedPOId, setPickedPOId] = React.useState("");

  const activePOId = purchaseOrderFilterId || pickedPOId;

  return (
    <div className="space-y-4">
      {permissions.create && !purchaseOrderFilterId && (
        <Card>
          <CardHeader>
            <CardTitle>Receive Against a Purchase Order</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={pickedPOId}
              onChange={(e) => setPickedPOId(e.target.value)}
            >
              <option value="">Select an approved purchase order…</option>
              {approvedPOOptions.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.totalJod} JOD
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {permissions.create && activePOId && (
        <ReceiveAgainstPurchaseOrder purchaseOrderId={activePOId} onReceived={() => list.refetch()} />
      )}

      {purchaseOrderFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one purchase order.{" "}
          <Link href="/goods-receipts" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Goods Receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Receipt #</th>
                <th className="py-2 pe-4 font-medium">Received</th>
                <th className="py-2 pe-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    No records yet.
                  </td>
                </tr>
              )}
              {body?.items.map((row) => (
                <tr key={row.id} className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4">{row.receiptNumber}</td>
                  <td className="py-2 pe-4">{new Date(row.receivedAt).toLocaleString()}</td>
                  <td className="py-2 pe-4">{row.notes ?? "—"}</td>
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
    </div>
  );
}
