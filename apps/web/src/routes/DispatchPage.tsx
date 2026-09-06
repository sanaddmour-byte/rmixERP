import * as React from "react";
import {
  useCreateDeliveryOrder,
  useDispatchDeliveryOrder,
  useGetDeliveryOrder,
  useGetDispatchSchedule,
  useListBranches,
  useListCustomers,
  useListDeliveryOrders,
  useListDrivers,
  useListSalesOrders,
  useListTrucks,
  type DeliveryOrder,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type DeliveryOrderStatus = DeliveryOrder["status"];

const STATUS_COLOR: Record<DeliveryOrderStatus, string> = {
  planned: "#94a3b8",
  dispatched: "#f2660f",
  delivered: "#15803d",
  invoiced: "#0f2440",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function GanttBoard({ branchId, date }: { branchId: string; date: string }) {
  const from = `${date}T00:00:00.000Z`;
  const to = `${date}T23:59:59.000Z`;
  const schedule = useGetDispatchSchedule({ branchId, from, to }, { query: { enabled: Boolean(branchId) } });
  const items = schedule.data?.status === 200 ? schedule.data.data.items : [];

  function hourOf(iso: string) {
    const d = new Date(iso);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  }
  function pct(hour: number) {
    return `${Math.min(100, Math.max(0, (hour / 24) * 100))}%`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plant Schedule — {date}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex text-xs text-navy-400">
          {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
            <div key={h} style={{ width: `${(2 / 24) * 100}%` }}>
              {h}:00
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="text-sm text-navy-400">No deliveries scheduled for this day.</p>}
        <div className="space-y-2">
          {items.map((item) => {
            const plannedHour = hourOf(item.scheduledAt);
            const actualStart = item.dispatchedAt ? hourOf(item.dispatchedAt) : null;
            const actualEnd = item.deliveredAt ? hourOf(item.deliveredAt) : null;
            return (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <div className="w-40 shrink-0 truncate text-navy-700">
                  {item.customerName} {item.qcFlagged && <span className="text-orange-600">(QC failed)</span>}
                </div>
                <div className="relative h-6 flex-1 rounded bg-navy-50">
                  <div
                    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-navy-500 bg-white"
                    style={{ left: pct(plannedHour) }}
                    title={`Planned ${new Date(item.scheduledAt).toLocaleTimeString()}`}
                  />
                  {actualStart !== null && (
                    <div
                      className="absolute top-1/2 h-3 -translate-y-1/2 rounded"
                      style={{
                        left: pct(actualStart),
                        width: pct(Math.max(0.3, (actualEnd ?? actualStart + 0.5) - actualStart)),
                        backgroundColor: STATUS_COLOR[item.status],
                      }}
                      title={`${item.status} — ${new Date(item.dispatchedAt ?? item.scheduledAt).toLocaleTimeString()}`}
                    />
                  )}
                </div>
                <span className="w-20 shrink-0 capitalize" style={{ color: STATUS_COLOR[item.status] }}>
                  {item.status}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DeliveryOrderDetailPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const permissions = useModulePermissions("deliveryOrders");
  const detail = useGetDeliveryOrder(id);
  const trucks = useListTrucks({ page: 1, pageSize: 100 });
  const drivers = useListDrivers({ page: 1, pageSize: 100 });
  const truckOptions = trucks.data?.status === 200 ? trucks.data.data.items : [];
  const driverOptions = drivers.data?.status === 200 ? drivers.data.data.items : [];

  const dispatch = useDispatchDeliveryOrder();

  const [truckId, setTruckId] = React.useState("");
  const [driverId, setDriverId] = React.useState("");
  const [blocked, setBlocked] = React.useState<{ outstandingJod: string; exceedsByJod: string } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function submitDispatch(override?: { reason: string }) {
    if (!truckId || !driverId) return;
    dispatch.mutate(
      { id, data: { truckId, driverId, ...(override && { override }) } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            setBlocked(null);
            setOverrideReason("");
            void detail.refetch();
            onChanged();
          } else if (result.status === 409) {
            setBlocked(result.data.error.details as { outstandingJod: string; exceedsByJod: string });
          }
        },
      },
    );
  }

  if (detail.isLoading) return <p className="text-sm text-navy-400">Loading…</p>;
  if (!o) return <p className="text-sm text-navy-400">Not found.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Delivery — <span className="capitalize">{o.status}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-4 text-navy-600">
          <span>Quantity: {o.quantityM3} m³</span>
          <span>Scheduled: {new Date(o.scheduledAt).toLocaleString()}</span>
          {o.qcFlagged && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800" title={o.qcFlagReason ?? undefined}>
              QC failed — {o.qcFlagReason}
            </span>
          )}
        </div>

        {o.status === "planned" && permissions.edit && (
          <div className="space-y-2">
            <p className="font-semibold text-navy-700">Dispatch</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Truck
                <select
                  className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
                  value={truckId}
                  onChange={(e) => setTruckId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {truckOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plateNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Driver
                <select
                  className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {driverOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" disabled={dispatch.isPending || !truckId || !driverId} onClick={() => submitDispatch()}>
                Dispatch
              </Button>
            </div>

            {blocked && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3">
                <p className="text-orange-800">
                  Blocked: customer's outstanding {blocked.outstandingJod} JOD exceeds their limit by {blocked.exceedsByJod} JOD.
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    Override reason (requires deliveryOrders:approve)
                    <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="w-72" />
                  </label>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={dispatch.isPending || !overrideReason}
                    onClick={() => submitDispatch({ reason: overrideReason })}
                  >
                    Override &amp; Dispatch
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {o.status === "dispatched" && (
          <p className="text-navy-500">Awaiting delivery — proof of delivery is captured by the driver on mobile.</p>
        )}

        {o.proofOfDelivery && (
          <div className="space-y-2 rounded-md border border-navy-200 p-3">
            <p className="font-semibold text-navy-700">Proof of Delivery</p>
            <p>Received: {o.proofOfDelivery.receivedQuantityM3} m³</p>
            <p>Signed by: {o.proofOfDelivery.signedByName}</p>
            {o.proofOfDelivery.notes && <p>Notes: {o.proofOfDelivery.notes}</p>}
            <img src={o.proofOfDelivery.signatureData} alt="Customer signature" className="h-24 border border-navy-200 bg-white" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DispatchPage() {
  const permissions = useModulePermissions("deliveryOrders");
  const [page, setPage] = React.useState(1);
  const [branchId, setBranchId] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [status, setStatus] = React.useState<DeliveryOrderStatus | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  // Default to the first branch once loaded, without a setState-in-effect
  // cascade — the select is controlled by this derived value, and picking
  // a different branch still writes through to `branchId` state normally.
  const effectiveBranchId = branchId || (branchOptions[0]?.id ?? "");

  const salesOrders = useListSalesOrders({ page: 1, pageSize: 100, status: "confirmed" });
  const salesOrderOptions = salesOrders.data?.status === 200 ? salesOrders.data.data.items : [];
  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : [];
  const customerById = new Map(customerOptions.map((c) => [c.id, c.name]));

  const [salesOrderId, setSalesOrderId] = React.useState("");
  const [quantityM3, setQuantityM3] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");

  const list = useListDeliveryOrders({
    page,
    pageSize: 20,
    ...(effectiveBranchId && { branchId: effectiveBranchId }),
    ...(status && { status }),
  });
  const create = useCreateDeliveryOrder(refetchOnSuccess(list));
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { data: { branchId: effectiveBranchId, salesOrderId, quantityM3, scheduledAt: new Date(scheduledAt).toISOString() } },
      { onSuccess: (result) => result.status === 201 && setSelectedId(result.data.id) },
    );
    setSalesOrderId("");
    setQuantityM3("");
    setScheduledAt("");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Branch
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
              value={effectiveBranchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Date
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </label>
        </CardContent>
      </Card>

      {effectiveBranchId && <GanttBoard branchId={effectiveBranchId} date={date} />}

      {permissions.create && (
        <Card>
          <CardHeader>
            <CardTitle>New Delivery Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Sales Order
                <select
                  className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
                  required
                  value={salesOrderId}
                  onChange={(e) => setSalesOrderId(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {salesOrderOptions.map((so) => (
                    <option key={so.id} value={so.id}>
                      {customerById.get(so.customerId) ?? so.customerId} — {so.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Quantity (m³)
                <Input required value={quantityM3} onChange={(e) => setQuantityM3(e.target.value)} className="w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Scheduled at
                <Input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-48"
                />
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
          <CardTitle>Delivery Orders</CardTitle>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as DeliveryOrderStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500">
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Quantity m³</th>
                <th className="py-2 pe-4 font-medium">Scheduled</th>
                <th className="py-2 pe-4 font-medium">QC</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-navy-400">
                    No records yet.
                  </td>
                </tr>
              )}
              {body?.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-navy-100 hover:bg-navy-50"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-2 pe-4 capitalize">{row.status}</td>
                  <td className="py-2 pe-4">{row.quantityM3}</td>
                  <td className="py-2 pe-4">{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td className="py-2 pe-4">{row.qcFlagged && <span className="text-orange-600">Flagged</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-sm text-navy-500">
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

      {selectedId && <DeliveryOrderDetailPanel id={selectedId} onChanged={() => void list.refetch()} />}
    </div>
  );
}
