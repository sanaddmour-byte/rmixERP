import * as React from "react";
import {
  useCreateStockAdjustment,
  useListBranches,
  useListRawMaterials,
  useListStockAdjustments,
  useListStockBalances,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

export function InventoryPage() {
  const permissions = useModulePermissions("inventory");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const materialOptions =
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];

  const [branchId, setBranchId] = React.useState("");
  const balances = useListStockBalances({ page: 1, pageSize: 100, ...(branchId && { branchId }) });
  const balanceBody = balances.data?.status === 200 ? balances.data.data : undefined;

  const adjustments = useListStockAdjustments({ page: 1, pageSize: 20 });
  const adjustmentBody = adjustments.data?.status === 200 ? adjustments.data.data : undefined;

  const [adjBranchId, setAdjBranchId] = React.useState("");
  const [adjRawMaterialId, setAdjRawMaterialId] = React.useState("");
  const [quantityDelta, setQuantityDelta] = React.useState("");
  const [unitCostJod, setUnitCostJod] = React.useState("");
  const [reason, setReason] = React.useState("");
  const create = useCreateStockAdjustment(refetchOnSuccess(balances));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        data: {
          branchId: adjBranchId,
          rawMaterialId: adjRawMaterialId,
          quantityDelta,
          ...(unitCostJod && { unitCostJod }),
          ...(reason && { reason }),
        },
      },
      { onSuccess: () => void adjustments.refetch() },
    );
    setQuantityDelta("");
    setUnitCostJod("");
    setReason("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Stock Balances</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">All branches</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500">
                <th className="py-2 pe-4 font-medium">Branch</th>
                <th className="py-2 pe-4 font-medium">Raw Material</th>
                <th className="py-2 pe-4 font-medium">Qty on Hand</th>
                <th className="py-2 pe-4 font-medium">Avg. Cost (JOD)</th>
              </tr>
            </thead>
            <tbody>
              {balances.isLoading && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!balances.isLoading && (balanceBody?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400">
                    No records yet.
                  </td>
                </tr>
              )}
              {balanceBody?.items.map((row) => (
                <tr key={row.id} className="border-b border-navy-100">
                  <td className="py-2 pe-4">{branchOptions.find((b) => b.id === row.branchId)?.name ?? row.branchId}</td>
                  <td className="py-2 pe-4">{materialOptions.find((m) => m.id === row.rawMaterialId)?.name ?? row.rawMaterialId}</td>
                  <td className="py-2 pe-4">{row.quantityOnHand}</td>
                  <td className="py-2 pe-4">{row.averageCostJod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {permissions.create && (
        <Card>
          <CardHeader>
            <CardTitle>Record Stock Adjustment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Branch
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
                  required
                  value={adjBranchId}
                  onChange={(e) => setAdjBranchId(e.target.value)}
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
                Raw material
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
                  required
                  value={adjRawMaterialId}
                  onChange={(e) => setAdjRawMaterialId(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {materialOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Quantity delta (+receipt / -correction)
                <Input required value={quantityDelta} onChange={(e) => setQuantityDelta(e.target.value)} className="w-40" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Unit cost (JOD, required if +)
                <Input value={unitCostJod} onChange={(e) => setUnitCostJod(e.target.value)} className="w-32" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Reason
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="w-48" />
              </label>
              <Button type="submit" disabled={create.isPending}>
                Record
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500">
                <th className="py-2 pe-4 font-medium">Raw Material</th>
                <th className="py-2 pe-4 font-medium">Delta</th>
                <th className="py-2 pe-4 font-medium">Unit Cost</th>
                <th className="py-2 pe-4 font-medium">Resulting Qty</th>
                <th className="py-2 pe-4 font-medium">Resulting Avg. Cost</th>
                <th className="py-2 pe-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {adjustmentBody?.items.map((row) => (
                <tr key={row.id} className="border-b border-navy-100">
                  <td className="py-2 pe-4">{materialOptions.find((m) => m.id === row.rawMaterialId)?.name ?? row.rawMaterialId}</td>
                  <td className="py-2 pe-4">{row.quantityDelta}</td>
                  <td className="py-2 pe-4">{row.unitCostJod ?? "—"}</td>
                  <td className="py-2 pe-4">{row.resultingQuantityOnHand}</td>
                  <td className="py-2 pe-4">{row.resultingAverageCostJod}</td>
                  <td className="py-2 pe-4">{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
