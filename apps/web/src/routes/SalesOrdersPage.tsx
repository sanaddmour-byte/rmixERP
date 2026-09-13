import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useCreateSalesOrder,
  useCreateSalesOrderLine,
  useCreateSalesOrderLineCharge,
  useFulfillSalesOrder,
  useGetSalesOrder,
  useListBranches,
  useListChargeTypes,
  useListCustomers,
  useListProducts,
  useListProjects,
  useListSalesOrders,
  useVoidSalesOrderLine,
  useVoidSalesOrderLineCharge,
  type SalesOrder,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type SalesOrderStatus = SalesOrder["status"];

function SalesOrderDetail({ salesOrderId }: { salesOrderId: string }) {
  const detail = useGetSalesOrder(salesOrderId);
  const products = useListProducts({ page: 1, pageSize: 100 });
  const chargeTypes = useListChargeTypes({ page: 1, pageSize: 100 });

  const createLine = useCreateSalesOrderLine(refetchOnSuccess(detail));
  const voidLine = useVoidSalesOrderLine(refetchOnSuccess(detail));
  const createCharge = useCreateSalesOrderLineCharge(refetchOnSuccess(detail));
  const voidCharge = useVoidSalesOrderLineCharge(refetchOnSuccess(detail));
  const confirm = useConfirmSalesOrder(refetchOnSuccess(detail));
  const cancel = useCancelSalesOrder(refetchOnSuccess(detail));
  const fulfill = useFulfillSalesOrder(refetchOnSuccess(detail));

  const [productId, setProductId] = React.useState("");
  const [quantityM3, setQuantityM3] = React.useState("");
  const [chargeLineId, setChargeLineId] = React.useState<string | null>(null);
  const [chargeTypeId, setChargeTypeId] = React.useState("");
  const [chargeQuantity, setChargeQuantity] = React.useState("");
  const [creditBlock, setCreditBlock] = React.useState<{ exceedsByJod: string; projectedOutstandingJod: string } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const o = detail.data?.status === 200 ? detail.data.data : undefined;
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : [];
  const chargeTypeOptions =
    chargeTypes.data?.status === 200 && typeof chargeTypes.data.data !== "string" ? chargeTypes.data.data.items : [];

  if (detail.isLoading) return <p className="text-navy-500">Loading…</p>;
  if (!o) return <p className="text-navy-500">Not found.</p>;

  function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    createLine.mutate({ salesOrderId, data: { productId, quantityM3 } });
    setProductId("");
    setQuantityM3("");
  }

  function handleAddCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!chargeLineId) return;
    createCharge.mutate({
      salesOrderId,
      lineId: chargeLineId,
      data: { chargeTypeId, ...(chargeQuantity && { quantity: chargeQuantity }) },
    });
    setChargeLineId(null);
    setChargeTypeId("");
    setChargeQuantity("");
  }

  function handleConfirm() {
    setCreditBlock(null);
    confirm.mutate(
      { id: salesOrderId },
      {
        onSuccess: (result) => {
          if (result.status === 409) {
            const details = result.data.error.details as { exceedsByJod: string; projectedOutstandingJod: string };
            setCreditBlock(details);
          }
        },
      },
    );
  }

  function handleOverrideConfirm(e: React.FormEvent) {
    e.preventDefault();
    confirm.mutate(
      { id: salesOrderId, data: { override: { reason: overrideReason } } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            setCreditBlock(null);
            setOverrideReason("");
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          Sales Order — <span className="capitalize">{o.status}</span>
        </CardTitle>
        <Link href={`/dispatch?salesOrderId=${salesOrderId}`} className="text-sm text-orange-600 hover:underline dark:text-orange-400">
          See deliveries →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-navy-600 dark:text-navy-300">
          <span>Subtotal: {o.subtotalJod} JOD</span>
          <span>Tax: {o.taxJod} JOD</span>
          <span className="font-semibold">Total: {o.totalJod} JOD</span>
        </div>

        {o.creditCheckPolicy && (
          <div className="rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-3 text-xs text-navy-700 dark:text-navy-300">
            Credit check: policy <span className="font-medium">{o.creditCheckPolicy}</span>, projected outstanding{" "}
            {o.creditCheckOutstandingJod} JOD
            {Number(o.creditCheckExceedsByJod) > 0 && (
              <span className="text-orange-600"> (exceeds limit by {o.creditCheckExceedsByJod} JOD)</span>
            )}
            {o.creditOverride && <span className="block">Overridden: {o.creditOverrideReason}</span>}
          </div>
        )}

        {creditBlock && (
          <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm">
            <p className="text-orange-800">
              Blocked: exceeds the customer's credit limit by {creditBlock.exceedsByJod} JOD (projected outstanding{" "}
              {creditBlock.projectedOutstandingJod} JOD).
            </p>
            <form onSubmit={handleOverrideConfirm} className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Override reason (requires salesOrders:approve)
                <Input required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="w-72" />
              </label>
              <Button type="submit" variant="accent" size="sm" disabled={confirm.isPending}>
                Override &amp; Confirm
              </Button>
            </form>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {o.status === "draft" && (
            <Button size="sm" disabled={confirm.isPending} onClick={handleConfirm}>
              Confirm
            </Button>
          )}
          {(o.status === "draft" || o.status === "confirmed") && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: salesOrderId, data: {} })}
            >
              Cancel
            </Button>
          )}
          {o.status === "confirmed" && (
            <Button size="sm" disabled={fulfill.isPending} onClick={() => fulfill.mutate({ id: salesOrderId })}>
              Mark Fulfilled
            </Button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Product</th>
              <th className="py-2 pe-4 font-medium">Qty (m³)</th>
              <th className="py-2 pe-4 font-medium">Concrete</th>
              <th className="py-2 pe-4 font-medium">Delivery</th>
              <th className="py-2 pe-4 font-medium">Net</th>
              <th className="py-2 pe-4 font-medium">Tax</th>
              <th className="py-2 pe-4 font-medium">Total</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {o.lines.map((line) => (
              <React.Fragment key={line.id}>
                <tr className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4">{productOptions.find((p) => p.id === line.productId)?.name ?? line.productId}</td>
                  <td className="py-2 pe-4">{line.quantityM3}</td>
                  <td className="py-2 pe-4">{line.concreteUnitPriceJod}</td>
                  <td className="py-2 pe-4">{line.deliveryUnitPriceJod}</td>
                  <td className="py-2 pe-4">{line.netJod}</td>
                  <td className="py-2 pe-4">{line.taxJod}</td>
                  <td className="py-2 pe-4">{line.totalJod}</td>
                  <td className="py-2 text-end">
                    {o.status === "draft" && (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setChargeLineId(line.id)}>
                          + Charge
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={voidLine.isPending}
                          onClick={() => voidLine.mutate({ salesOrderId, id: line.id, data: {} })}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {line.charges.map((charge) => (
                  <tr key={charge.id} className="border-b border-navy-100 dark:border-navy-800 text-xs text-navy-500">
                    <td className="py-1 ps-4" colSpan={4}>
                      {chargeTypeOptions.find((c) => c.id === charge.chargeTypeId)?.name ?? charge.chargeTypeId}
                    </td>
                    <td className="py-1">{charge.amountJod}</td>
                    <td className="py-1">{charge.taxJod}</td>
                    <td className="py-1" />
                    <td className="py-1 text-end">
                      {o.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={voidCharge.isPending}
                          onClick={() => voidCharge.mutate({ salesOrderId, lineId: line.id, id: charge.id, data: {} })}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {chargeLineId === line.id && (
                  <tr className="border-b border-navy-100 dark:border-navy-800">
                    <td colSpan={8} className="py-2">
                      <form onSubmit={handleAddCharge} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs">
                          Charge type
                          <select
                            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                            required
                            value={chargeTypeId}
                            onChange={(e) => setChargeTypeId(e.target.value)}
                          >
                            <option value="" disabled>
                              Select…
                            </option>
                            {chargeTypeOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.calculationMethod})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          Quantity (per_unit only)
                          <Input value={chargeQuantity} onChange={(e) => setChargeQuantity(e.target.value)} className="w-28" />
                        </label>
                        <Button type="submit" size="sm" disabled={createCharge.isPending}>
                          Add
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setChargeLineId(null)}>
                          Cancel
                        </Button>
                      </form>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {o.status === "draft" && (
          <form onSubmit={handleAddLine} className="flex flex-wrap items-end gap-2">
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
              Quantity (m³)
              <Input required value={quantityM3} onChange={(e) => setQuantityM3(e.target.value)} className="w-28" />
            </label>
            <Button type="submit" size="sm" disabled={createLine.isPending}>
              Add line
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function SalesOrdersPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<SalesOrderStatus | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get("id"));
  const [customerFilterId] = React.useState(() => searchParams.get("customerId") ?? "");
  const permissions = useModulePermissions("salesOrders");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];
  const projects = useListProjects({ page: 1, pageSize: 100 });
  const projectOptions =
    projects.data?.status === 200 && typeof projects.data.data !== "string" ? projects.data.data.items : [];

  const [customerId, setCustomerId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const list = useListSalesOrders({
    page,
    pageSize: 20,
    ...(status && { status }),
    ...(customerFilterId && { customerId: customerFilterId }),
  });
  const create = useCreateSalesOrder(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        data: {
          customerId,
          branchId,
          ...(projectId && { projectId }),
          ...(notes && { notes }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) setSelectedId(result.data.id);
        },
      },
    );
    setCustomerId("");
    setBranchId("");
    setProjectId("");
    setNotes("");
  }

  return (
    <div className="space-y-4">
      {permissions.create && (
        <Card>
          <CardHeader>
            <CardTitle>New Sales Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
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
                Project (optional)
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">None</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Notes
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-48" />
              </label>
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {customerFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one customer.{" "}
          <Link href="/sales-orders" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Sales Orders (Order Book)</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SalesOrderStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Customer</th>
                <th className="py-2 pe-4 font-medium">Total (JOD)</th>
                <th className="py-2 pe-4 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400 dark:text-navy-500">
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
                  <td className="py-2 pe-4 capitalize">{row.status}</td>
                  <td className="py-2 pe-4">
                    <Link
                      href={`/receivables-reports?customerId=${row.customerId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customerOptions.find((c) => c.id === row.customerId)?.name ?? row.customerId}
                    </Link>
                  </td>
                  <td className="py-2 pe-4">{row.totalJod}</td>
                  <td className="py-2 pe-4">
                    {row.creditOverride ? (
                      <span className="text-orange-600">Overridden</span>
                    ) : Number(row.creditCheckExceedsByJod ?? "0") > 0 ? (
                      <span className="text-orange-600">Warning</span>
                    ) : (
                      "—"
                    )}
                  </td>
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

      {selectedId && <SalesOrderDetail salesOrderId={selectedId} />}
    </div>
  );
}
