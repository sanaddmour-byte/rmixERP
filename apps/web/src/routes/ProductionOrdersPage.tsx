import * as React from "react";
import {
  useCancelProductionOrder,
  useCompleteProductionOrder,
  useCreateProductionOrder,
  useGetProductionOrder,
  useGetYieldVariance,
  useListBranches,
  useListCubeTestSets,
  useListFreshTests,
  useListMixDesigns,
  useListProducts,
  useListProductionOrders,
  useListRawMaterials,
  useRecordBatch,
  useRecordCubeTestSet,
  useRecordFreshTest,
  useRecordReturnedConcrete,
  type ProductionOrder,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type ProductionOrderStatus = ProductionOrder["status"];

function BatchQCPanel({ batchId, onCubeTestRecorded }: { batchId: string; onCubeTestRecorded: () => void }) {
  const permissions = useModulePermissions("qc");
  const freshTests = useListFreshTests(batchId);
  const cubeTestSets = useListCubeTestSets(batchId);
  const recordFreshTest = useRecordFreshTest(refetchOnSuccess(freshTests));
  const recordCubeTestSet = useRecordCubeTestSet({
    mutation: {
      onSuccess: () => {
        void cubeTestSets.refetch();
        // A failing design-age result flags the batch (qcFlagged) on the parent
        // production order — refetch it too so the badge shows without a manual reload.
        onCubeTestRecorded();
      },
    },
  });

  const [slumpMm, setSlumpMm] = React.useState("");
  const [concreteTemperatureC, setConcreteTemperatureC] = React.useState("");
  const [airContentPercent, setAirContentPercent] = React.useState("");

  const [ageDays, setAgeDays] = React.useState("28");
  const [specimenStrengthsMpa, setSpecimenStrengthsMpa] = React.useState("");

  const freshList = freshTests.data?.status === 200 ? freshTests.data.data : [];
  const cubeList = cubeTestSets.data?.status === 200 ? cubeTestSets.data.data : [];

  function submitFreshTest(e: React.FormEvent) {
    e.preventDefault();
    recordFreshTest.mutate({
      batchId,
      data: {
        slumpMm,
        ...(concreteTemperatureC && { concreteTemperatureC }),
        ...(airContentPercent && { airContentPercent }),
      },
    });
    setSlumpMm("");
    setConcreteTemperatureC("");
    setAirContentPercent("");
  }

  function submitCubeTestSet(e: React.FormEvent) {
    e.preventDefault();
    const strengths = specimenStrengthsMpa
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (strengths.length === 0) return;
    recordCubeTestSet.mutate({ batchId, data: { ageDays: Number(ageDays), specimenStrengthsMpa: strengths } });
    setSpecimenStrengthsMpa("");
  }

  return (
    <div className="space-y-4 rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-3">
      <div>
        <p className="text-xs font-semibold text-navy-700 dark:text-navy-300">Fresh Tests</p>
        {freshList.length === 0 && <p className="text-xs text-navy-400">None recorded.</p>}
        {freshList.map((f) => (
          <div key={f.id} className="text-xs text-navy-600 dark:text-navy-300">
            Slump {f.slumpMm} mm
            {f.concreteTemperatureC && ` · ${f.concreteTemperatureC}°C`}
            {f.airContentPercent && ` · ${f.airContentPercent}% air`} ({new Date(f.testedAt).toLocaleString()})
          </div>
        ))}
        {permissions.create && (
          <form onSubmit={submitFreshTest} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Slump (mm)
              <Input required value={slumpMm} onChange={(e) => setSlumpMm(e.target.value)} className="w-24" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Temp (°C)
              <Input value={concreteTemperatureC} onChange={(e) => setConcreteTemperatureC(e.target.value)} className="w-20" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Air (%)
              <Input value={airContentPercent} onChange={(e) => setAirContentPercent(e.target.value)} className="w-20" />
            </label>
            <Button type="submit" size="sm" disabled={recordFreshTest.isPending}>
              Record
            </Button>
          </form>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-navy-700 dark:text-navy-300">Cube Tests</p>
        {cubeList.length === 0 && <p className="text-xs text-navy-400">None recorded.</p>}
        {cubeList.map((c) => (
          <div
            key={c.id}
            className={
              c.pass === false ? "text-xs font-medium text-orange-700" : c.pass === true ? "text-xs text-green-700" : "text-xs text-navy-600 dark:text-navy-300"
            }
          >
            Set #{c.setNumber} — {c.ageDays}d — avg {c.averageStrengthMpa} MPa —{" "}
            {c.pass === null ? "pending (not at design age)" : c.pass ? "PASS" : "FAIL"}
          </div>
        ))}
        {permissions.create && (
          <form onSubmit={submitCubeTestSet} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Age (days)
              <Input required value={ageDays} onChange={(e) => setAgeDays(e.target.value)} className="w-16" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Specimen strengths (MPa, comma-separated)
              <Input
                required
                value={specimenStrengthsMpa}
                onChange={(e) => setSpecimenStrengthsMpa(e.target.value)}
                placeholder="31.0, 32.0, 33.0"
                className="w-56"
              />
            </label>
            <Button type="submit" size="sm" disabled={recordCubeTestSet.isPending}>
              Record
            </Button>
          </form>
        )}
        {recordCubeTestSet.data?.status === 400 && (
          <p className="mt-1 text-xs text-orange-700">
            {recordCubeTestSet.data.data.error.message} — configure the product's characteristic strength first.
          </p>
        )}
      </div>
    </div>
  );
}

function ProductionOrderDetail({ orderId }: { orderId: string }) {
  const detail = useGetProductionOrder(orderId);
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const materialOptions =
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];

  const recordBatch = useRecordBatch();
  const recordReturn = useRecordReturnedConcrete(refetchOnSuccess(detail));
  const complete = useCompleteProductionOrder(refetchOnSuccess(detail));
  const cancel = useCancelProductionOrder(refetchOnSuccess(detail));
  const yieldVariance = useGetYieldVariance(orderId);

  const [targetQuantityM3, setTargetQuantityM3] = React.useState("");
  const [actualQuantityM3, setActualQuantityM3] = React.useState("");
  const [moistureAdjustmentBasisPoints, setMoistureAdjustmentBasisPoints] = React.useState("");
  const [blocked, setBlocked] = React.useState<{ rawMaterialIds: string[] } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [returnQuantityM3, setReturnQuantityM3] = React.useState("");
  const [returnReason, setReturnReason] = React.useState("");
  const [expandedBatchId, setExpandedBatchId] = React.useState<string | null>(null);

  const o = detail.data?.status === 200 ? detail.data.data : undefined;
  const yv = yieldVariance.data?.status === 200 ? yieldVariance.data.data : undefined;

  function submitBatch(override?: { reason: string }) {
    recordBatch.mutate(
      {
        id: orderId,
        data: {
          targetQuantityM3,
          actualQuantityM3,
          ...(moistureAdjustmentBasisPoints && { moistureAdjustmentBasisPoints: Number(moistureAdjustmentBasisPoints) }),
          ...(override && { override }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setBlocked(null);
            setTargetQuantityM3("");
            setActualQuantityM3("");
            setMoistureAdjustmentBasisPoints("");
            setOverrideReason("");
            void detail.refetch();
            void yieldVariance.refetch();
          } else if (result.status === 409) {
            const details = result.data.error.details as { rawMaterialIds: string[] };
            setBlocked(details);
          }
        },
      },
    );
  }

  function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBlocked(null);
    submitBatch();
  }

  function handleReturnSubmit(e: React.FormEvent) {
    e.preventDefault();
    recordReturn.mutate({ id: orderId, data: { quantityM3: returnQuantityM3, ...(returnReason && { reason: returnReason }) } });
    setReturnQuantityM3("");
    setReturnReason("");
  }

  if (detail.isLoading) return <p className="text-navy-500">Loading…</p>;
  if (!o) return <p className="text-navy-500">Not found.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Production Order — <span className="capitalize">{o.status.replace("_", " ")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-navy-600 dark:text-navy-300">
          <span>Planned: {o.plannedQuantityM3} m³</span>
          {yv && (
            <>
              <span>Net produced: {yv.netProducedM3} m³</span>
              {yv.deliveryVarianceM3 !== null && <span>Delivery variance: {yv.deliveryVarianceM3} m³</span>}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {o.status === "in_progress" && (
            <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate({ id: orderId })}>
              Complete
            </Button>
          )}
          {(o.status === "planned" || o.status === "in_progress") && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: orderId, data: {} })}
            >
              Cancel
            </Button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Batch #</th>
              <th className="py-2 pe-4 font-medium">Target m³</th>
              <th className="py-2 pe-4 font-medium">Actual m³</th>
              <th className="py-2 pe-4 font-medium">Moisture bp</th>
              <th className="py-2 pe-4 font-medium">Consumptions</th>
              <th className="py-2 pe-4 font-medium">QC</th>
            </tr>
          </thead>
          <tbody>
            {o.batches.map((batch) => (
              <React.Fragment key={batch.id}>
                <tr className="border-b border-navy-100 dark:border-navy-800 align-top">
                  <td className="py-2 pe-4">{batch.batchNumber}</td>
                  <td className="py-2 pe-4">{batch.targetQuantityM3}</td>
                  <td className="py-2 pe-4">{batch.actualQuantityM3}</td>
                  <td className="py-2 pe-4">{batch.moistureAdjustmentBasisPoints}</td>
                  <td className="py-2 pe-4">
                    {batch.consumptions.map((c) => (
                      <div key={c.id} className={c.wentNegative ? "text-orange-600" : undefined}>
                        {materialOptions.find((m) => m.id === c.rawMaterialId)?.name ?? c.rawMaterialId}: {c.quantityConsumed} @{" "}
                        {c.unitCostJod} = {c.totalCostJod} JOD
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pe-4">
                    {batch.qcFlagged && (
                      <span
                        className="mb-1 block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
                        title={batch.qcFlagReason ?? undefined}
                      >
                        QC failed
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedBatchId(expandedBatchId === batch.id ? null : batch.id)}
                    >
                      {expandedBatchId === batch.id ? "Hide QC" : "QC"}
                    </Button>
                  </td>
                </tr>
                {expandedBatchId === batch.id && (
                  <tr>
                    <td colSpan={6} className="pb-3">
                      <BatchQCPanel batchId={batch.id} onCubeTestRecorded={() => void detail.refetch()} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {(o.status === "planned" || o.status === "in_progress") && (
          <>
            {blocked && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm">
                <p className="text-orange-800">
                  Blocked: this batch would take{" "}
                  {blocked.rawMaterialIds.map((id) => materialOptions.find((m) => m.id === id)?.name ?? id).join(", ")} negative.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitBatch({ reason: overrideReason });
                  }}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <label className="flex flex-col gap-1 text-xs">
                    Override reason (requires productionOrders:approve)
                    <Input required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="w-72" />
                  </label>
                  <Button type="submit" variant="accent" size="sm" disabled={recordBatch.isPending}>
                    Override &amp; Record
                  </Button>
                </form>
              </div>
            )}

            <form onSubmit={handleBatchSubmit} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Target m³
                <Input required value={targetQuantityM3} onChange={(e) => setTargetQuantityM3(e.target.value)} className="w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Actual m³
                <Input required value={actualQuantityM3} onChange={(e) => setActualQuantityM3(e.target.value)} className="w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Moisture adj. (basis points)
                <Input value={moistureAdjustmentBasisPoints} onChange={(e) => setMoistureAdjustmentBasisPoints(e.target.value)} className="w-32" />
              </label>
              <Button type="submit" size="sm" disabled={recordBatch.isPending}>
                Record Batch
              </Button>
            </form>
          </>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy-700 dark:text-navy-300">Returned Concrete</p>
          {o.returns.map((r) => (
            <div key={r.id} className="text-sm text-navy-600 dark:text-navy-300">
              {r.quantityM3} m³ — {r.reason ?? "no reason given"} ({new Date(r.returnedAt).toLocaleString()})
            </div>
          ))}
          <form onSubmit={handleReturnSubmit} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Quantity (m³)
              <Input required value={returnQuantityM3} onChange={(e) => setReturnQuantityM3(e.target.value)} className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Reason
              <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-48" />
            </label>
            <Button type="submit" size="sm" disabled={recordReturn.isPending}>
              Record Return
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductionOrdersPage() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<ProductionOrderStatus | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const permissions = useModulePermissions("productionOrders");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  const products = useListProducts({ page: 1, pageSize: 100 });
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : [];
  const mixDesigns = useListMixDesigns({ page: 1, pageSize: 100 });
  const mixDesignOptions =
    mixDesigns.data?.status === 200 && typeof mixDesigns.data.data !== "string" ? mixDesigns.data.data.items : [];

  const [branchId, setBranchId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [mixDesignId, setMixDesignId] = React.useState("");
  const [plannedQuantityM3, setPlannedQuantityM3] = React.useState("");

  const list = useListProductionOrders({ page, pageSize: 20, ...(status && { status }) });
  const create = useCreateProductionOrder(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { data: { branchId, productId, mixDesignId, plannedQuantityM3 } },
      { onSuccess: (result) => result.status === 201 && setSelectedId(result.data.id) },
    );
    setBranchId("");
    setProductId("");
    setMixDesignId("");
    setPlannedQuantityM3("");
  }

  return (
    <div className="space-y-4">
      {permissions.create && (
        <Card>
          <CardHeader>
            <CardTitle>New Production Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
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
                Product
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Mix Design
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                  required
                  value={mixDesignId}
                  onChange={(e) => setMixDesignId(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {mixDesignOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Planned Quantity (m³)
                <Input required value={plannedQuantityM3} onChange={(e) => setPlannedQuantityM3(e.target.value)} className="w-32" />
              </label>
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Production Orders</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProductionOrderStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Product</th>
                <th className="py-2 pe-4 font-medium">Planned m³</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-navy-400 dark:text-navy-500">
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
                  <td className="py-2 pe-4 capitalize">{row.status.replace("_", " ")}</td>
                  <td className="py-2 pe-4">{productOptions.find((p) => p.id === row.productId)?.name ?? row.productId}</td>
                  <td className="py-2 pe-4">{row.plannedQuantityM3}</td>
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

      {selectedId && <ProductionOrderDetail orderId={selectedId} />}
    </div>
  );
}
