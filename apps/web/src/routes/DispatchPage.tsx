import * as React from "react";
import { Link, useSearchParams } from "wouter";
import {
  useCreateDeliveryOrder,
  useDispatchDeliveryOrder,
  useGetDeliveryOrder,
  useGetDispatchSchedule,
  useGetSalesOrder,
  useListBranches,
  useListCustomers,
  useListDeliveryOrders,
  useListDrivers,
  useListProducts,
  useListProjects,
  useListSalesOrders,
  useListTrucks,
  type DeliveryOrder,
} from "@rmixerp/contract";
import { ammanDayBoundsUtc, ammanHourOfDay, ammanWallClockToUtcIso, formatAmmanDateTime, formatAmmanTime, shiftAmmanDate, todayInAmman } from "@rmixerp/core";
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, Drawer, Input } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";
import { DELIVERY_ORDER_STATUS_TONE } from "../lib/statusRegistry";
import { StatusBadge } from "../components/StatusBadge";
import { ClickableRow } from "../components/ClickableRow";
import { throwIfApiError } from "../lib/apiResult";

type DeliveryOrderStatus = DeliveryOrder["status"];

// Semantic tones, not raw hex (docs/ui-ux-audit.md §9.3's finding that
// this board previously hardcoded literal colors outside the token
// system entirely) — resolved to the same CSS custom properties every
// other status indicator in the app uses.
const STATUS_VAR: Record<DeliveryOrderStatus, string> = {
  planned: "var(--color-text-subtle)",
  dispatched: "var(--color-warning)",
  delivered: "var(--color-success)",
  invoiced: "var(--color-info)",
};

/** Equal-width hour ticks, same coordinate system as the bars below (pct(h) = h/24*100) — fixes the ticks/lanes misalignment a 13-tick-over-100%-width layout previously had. */
const HOUR_TICKS = Array.from({ length: 12 }, (_, i) => i * 2);

function pct(hour: number) {
  return `${Math.min(100, Math.max(0, (hour / 24) * 100))}%`;
}

function GanttBoard({ branchId, date, onSelect }: { branchId: string; date: string; onSelect: (id: string) => void }) {
  const { startUtcIso, endUtcIso } = ammanDayBoundsUtc(date);
  const schedule = useGetDispatchSchedule({ branchId, from: startUtcIso, to: endUtcIso }, { query: { enabled: Boolean(branchId) } });
  const items = schedule.data?.status === 200 ? schedule.data.data.items : [];

  // Resolved client-side against the lists the "today's deliveries" board
  // already needs anyway — no new endpoint, per docs/ui-ux-audit.md §10's
  // scoping (a full fleet-utilization panel is backlog; this is just
  // "show which truck/driver" on a block that already links to one).
  const trucks = useListTrucks({ page: 1, pageSize: 100 });
  const truckById = new Map((trucks.data?.status === 200 ? trucks.data.data.items : []).map((t) => [t.id, t.plateNumber]));
  const drivers = useListDrivers({ page: 1, pageSize: 100 });
  const driverById = new Map((drivers.data?.status === 200 ? drivers.data.data.items : []).map((d) => [d.id, d.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plant Schedule — {date} (Asia/Amman)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative h-4 text-xs text-navy-400">
          {HOUR_TICKS.map((h, i) => (
            // Every other label hides below sm — 12 fixed-width "00:00"
            // labels packed into a ~340px-wide phone screen overlap
            // (each needs ~35px, 390px / 12 ≈ 29px); six 4-hour ticks fit.
            <span key={h} className={`absolute top-0 ${i % 2 === 1 ? "hidden sm:inline" : ""}`} style={{ left: pct(h) }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {items.length === 0 && <p className="text-sm text-navy-400">No deliveries scheduled for this day.</p>}
        <div className="space-y-2">
          {items.map((item) => {
            const plannedHour = ammanHourOfDay(item.scheduledAt);
            const actualStart = item.dispatchedAt ? ammanHourOfDay(item.dispatchedAt) : null;
            const actualEnd = item.deliveredAt ? ammanHourOfDay(item.deliveredAt) : null;
            const truckLabel = item.truckId ? truckById.get(item.truckId) : null;
            const driverLabel = item.driverId ? driverById.get(item.driverId) : null;
            const customerOrProject = item.projectName ? `${item.customerName} — ${item.projectName}` : item.customerName;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex w-full items-center gap-2 rounded text-xs hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <div className="w-52 shrink-0 truncate text-start text-navy-700 dark:text-navy-300">
                  <span className="font-medium">{customerOrProject}</span> — {item.productName ?? "—"} · {item.quantityM3} m³
                  {item.qcFlagged && <span className="ms-1 text-danger">(QC failed)</span>}
                  {(truckLabel || driverLabel) && (
                    <span className="block text-text-subtle">
                      {[truckLabel, driverLabel].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="relative h-6 flex-1 rounded bg-navy-50 dark:bg-navy-800">
                  <div
                    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-navy-500 bg-white"
                    style={{ left: pct(plannedHour) }}
                    title={`Planned ${formatAmmanTime(item.scheduledAt)}`}
                  />
                  {actualStart !== null && (
                    <div
                      className="absolute top-1/2 h-3 -translate-y-1/2 rounded"
                      style={{
                        left: pct(actualStart),
                        width: pct(Math.max(0.3, (actualEnd ?? actualStart + 0.5) - actualStart)),
                        backgroundColor: STATUS_VAR[item.status],
                      }}
                      title={`${item.status} — ${formatAmmanTime(item.dispatchedAt ?? item.scheduledAt)}`}
                    />
                  )}
                </div>
                <span className="w-20 shrink-0 text-start capitalize" style={{ color: STATUS_VAR[item.status] }}>
                  {item.status}
                </span>
              </button>
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
        <div className="flex flex-wrap gap-4 text-navy-600 dark:text-navy-300">
          <span>Quantity: {o.quantityM3} m³</span>
          <span>Scheduled: {formatAmmanDateTime(o.scheduledAt)}</span>
          {!o.salesOrderLineId && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800" title="Created without a sales-order line — it cannot be invoiced until one is linked.">
              No billing line
            </span>
          )}
          {o.qcFlagged && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800" title={o.qcFlagReason ?? undefined}>
              QC failed — {o.qcFlagReason}
            </span>
          )}
        </div>

        {o.status === "planned" && permissions.edit && (
          <div className="space-y-2">
            <p className="font-semibold text-navy-700 dark:text-navy-300">Dispatch</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Truck
                <select
                  className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
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
                  className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
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
            <p className="font-semibold text-navy-700 dark:text-navy-300">Proof of Delivery</p>
            <p>Received: {o.proofOfDelivery.receivedQuantityM3} m³</p>
            <p>Signed by: {o.proofOfDelivery.signedByName}</p>
            {o.proofOfDelivery.notes && <p>Notes: {o.proofOfDelivery.notes}</p>}
            <img src={o.proofOfDelivery.signatureData} alt="Customer signature" className="h-24 border border-navy-200 bg-white" />
          </div>
        )}

        {o.status === "delivered" && (
          <p className="text-navy-500">
            Delivered.{" "}
            {o.salesOrderLineId ? (
              <>
                Ready for invoicing — see{" "}
                <Link href={`/invoices?deliveryOrderId=${o.id}`} className="text-orange-600 hover:underline dark:text-orange-400">
                  Invoices
                </Link>
                .
              </>
            ) : (
              "It has no billing line, so it cannot be invoiced as-is."
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface NewDeliveryDialogProps {
  open: boolean;
  onClose: () => void;
  branchId: string;
  defaultDate: string;
  onCreated: (id: string) => void;
}

function NewDeliveryDialog({ open, onClose, branchId, defaultDate, onCreated }: NewDeliveryDialogProps) {
  const [salesOrderId, setSalesOrderId] = React.useState("");
  // Only meaningful when several lines are eligible — the user's explicit
  // pick. When exactly one line is eligible, `effectiveLineId` below uses
  // that line directly instead, so there's nothing to set-and-sync here.
  const [chosenLineId, setChosenLineId] = React.useState("");
  const [quantityM3, setQuantityM3] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState(`${defaultDate}T08:00`);
  const [error, setError] = React.useState<string | null>(null);

  const salesOrders = useListSalesOrders({ page: 1, pageSize: 100, status: "confirmed", branchId }, { query: { enabled: open && Boolean(branchId) } });
  const salesOrderOptions = salesOrders.data?.status === 200 ? salesOrders.data.data.items : [];

  const customers = useListCustomers({ page: 1, pageSize: 200 }, { query: { enabled: open } });
  const customerNameById = new Map((customers.data?.status === 200 && typeof customers.data.data !== "string" ? customers.data.data.items : []).map((c) => [c.id, c.name]));
  const projects = useListProjects({ page: 1, pageSize: 200 }, { query: { enabled: open } });
  const projectNameById = new Map((projects.data?.status === 200 && typeof projects.data.data !== "string" ? projects.data.data.items : []).map((p) => [p.id, p.name]));

  const orderDetail = useGetSalesOrder(salesOrderId, { query: { enabled: Boolean(salesOrderId) } });
  const lines = orderDetail.data?.status === 200 ? orderDetail.data.data.lines : [];
  const eligibleLines = lines.filter((l) => Number(l.remainingQuantityM3) > 0);

  const products = useListProducts({ page: 1, pageSize: 200 }, { query: { enabled: open } });
  const productNameById = new Map((products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : []).map((p) => [p.id, p.name]));

  // Exactly one eligible line → the choice isn't really a choice; use it
  // directly rather than forcing the user through a one-item menu. Several
  // → the user's own explicit pick from `chosenLineId`, nothing preselected.
  const salesOrderLineId = eligibleLines.length === 1 ? (eligibleLines[0]?.id ?? "") : chosenLineId;
  const selectedLine = eligibleLines.find((l) => l.id === salesOrderLineId);
  const create = useCreateDeliveryOrder();

  function reset() {
    setSalesOrderId("");
    setChosenLineId("");
    setQuantityM3("");
    setScheduledAt(`${defaultDate}T08:00`);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await create.mutateAsync({
        data: { branchId, salesOrderId, salesOrderLineId, quantityM3, scheduledAt: ammanWallClockToUtcIso(scheduledAt) },
      });
      throwIfApiError(result);
      if (result.status === 201) {
        reset();
        onClose();
        onCreated(result.data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this delivery — please check the fields and try again.");
    }
  }

  const overRemaining = selectedLine && quantityM3 && Number(quantityM3) > Number(selectedLine.remainingQuantityM3);

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
      }}
      title="New Delivery Order"
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-delivery-form"
            disabled={create.isPending || !salesOrderId || !salesOrderLineId || !quantityM3 || !scheduledAt}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <form id="new-delivery-form" onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Sales Order
          <select
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text"
            required
            value={salesOrderId}
            onChange={(e) => {
              setSalesOrderId(e.target.value);
              setChosenLineId("");
            }}
          >
            <option value="" disabled>
              Select…
            </option>
            {salesOrderOptions.map((so) => (
              <option key={so.id} value={so.id}>
                {customerNameById.get(so.customerId) ?? so.customerId}
                {so.projectId && ` — ${projectNameById.get(so.projectId) ?? so.projectId}`}
              </option>
            ))}
          </select>
          {salesOrderOptions.length === 0 && (
            <span className="text-xs text-text-muted">No confirmed sales orders at this plant.</span>
          )}
        </label>

        {salesOrderId && orderDetail.isLoading && <p className="text-xs text-text-muted">Loading order lines…</p>}

        {salesOrderId && !orderDetail.isLoading && eligibleLines.length === 0 && (
          <p className="text-xs text-danger">
            This order has no line with remaining undelivered quantity — every line is already fully covered by existing
            deliveries. Pick a different order.
          </p>
        )}

        {eligibleLines.length === 1 && selectedLine && (
          <p className="text-xs text-text-muted">
            Billing line: <span className="font-medium text-text">{productNameById.get(selectedLine.productId) ?? selectedLine.productId}</span> —
            remaining {selectedLine.remainingQuantityM3} m³
          </p>
        )}

        {eligibleLines.length > 1 && (
          <label className="flex flex-col gap-1">
            Sales Order Line
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text"
              required
              value={chosenLineId}
              onChange={(e) => setChosenLineId(e.target.value)}
            >
              <option value="" disabled>
                Select… ({eligibleLines.length} lines have remaining quantity)
              </option>
              {eligibleLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {productNameById.get(l.productId) ?? l.productId} — remaining {l.remainingQuantityM3} m³
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          Quantity (m³)
          <Input required value={quantityM3} onChange={(e) => setQuantityM3(e.target.value)} />
          {overRemaining && (
            <span className="text-xs text-yellow-700">
              Exceeds the {selectedLine!.remainingQuantityM3} m³ remaining on this line — double-check before creating.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          Scheduled at
          <Input type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function DispatchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const permissions = useModulePermissions("deliveryOrders");
  const [page, setPage] = React.useState(1);
  const [branchId, setBranchId] = React.useState("");
  const [date, setDate] = React.useState(todayInAmman());
  const [status, setStatus] = React.useState<DeliveryOrderStatus | "">(
    () => (searchParams.get("status") as DeliveryOrderStatus | null) ?? "",
  );
  const [truckFilter, setTruckFilter] = React.useState("");
  const [driverFilter, setDriverFilter] = React.useState("");
  const [selectedId, setSelectedIdState] = React.useState<string | null>(() => searchParams.get("id"));
  const [showNewDelivery, setShowNewDelivery] = React.useState(false);
  const [salesOrderFilterId] = React.useState(() => searchParams.get("salesOrderId") ?? "");
  // GanttBoard owns its own schedule query, keyed separately from the queue
  // list below — remounting it (via this as its `key`) is the simplest way
  // to force a fresh fetch after a create/dispatch/deliver change, since
  // there's no shared query-client cache key to invalidate from here.
  const [scheduleRefreshToken, setScheduleRefreshToken] = React.useState(0);

  // Keeps the open record in the URL (bookmarkable, survives a refresh,
  // and the browser back button closes it) without touching any other
  // filter already on the page — see docs/ui-ux-audit.md's "preserve
  // filters when opening/closing a record" finding.
  function setSelectedId(id: string | null) {
    setSelectedIdState(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("id", id);
        else next.delete("id");
        return next;
      },
      { replace: true },
    );
  }

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  // Default to the first branch once loaded, without a setState-in-effect
  // cascade — the select is controlled by this derived value, and picking
  // a different branch still writes through to `branchId` state normally.
  // A sales-order deep link skips the branch default so a matching delivery
  // in any branch is found, rather than being silently filtered out.
  const effectiveBranchId = salesOrderFilterId ? "" : branchId || (branchOptions[0]?.id ?? "");

  const trucks = useListTrucks({ page: 1, pageSize: 100 });
  const truckOptions = trucks.data?.status === 200 ? trucks.data.data.items : [];
  const drivers = useListDrivers({ page: 1, pageSize: 100 });
  const driverOptions = drivers.data?.status === 200 ? drivers.data.data.items : [];

  const list = useListDeliveryOrders({
    page,
    pageSize: 20,
    ...(effectiveBranchId && { branchId: effectiveBranchId }),
    ...(status && { status }),
    ...(truckFilter && { truckId: truckFilter }),
    ...(driverFilter && { driverId: driverFilter }),
    ...(salesOrderFilterId && { salesOrderId: salesOrderFilterId }),
  });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  return (
    <div className="space-y-4">
      {salesOrderFilterId && (
        <p className="text-xs text-navy-500 dark:text-navy-400">
          Filtered to one sales order.{" "}
          <Link href="/dispatch" className="text-orange-600 hover:underline dark:text-orange-400">
            Clear
          </Link>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Plant
              <select
                className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                value={effectiveBranchId}
                onChange={(e) => setBranchId(e.target.value)}
                aria-label="Plant"
              >
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-xs">
              Date
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" aria-label="Previous day" onClick={() => setDate((d) => shiftAmmanDate(d, -1))}>
                  ‹
                </Button>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
                <Button type="button" variant="outline" size="sm" aria-label="Next day" onClick={() => setDate((d) => shiftAmmanDate(d, 1))}>
                  ›
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDate(todayInAmman())}>
                  Today
                </Button>
              </div>
            </div>
          </div>
          {permissions.create && (
            <Button type="button" variant="accent" disabled={!effectiveBranchId} onClick={() => setShowNewDelivery(true)}>
              New Delivery
            </Button>
          )}
        </CardContent>
      </Card>

      {effectiveBranchId && (
        <GanttBoard key={scheduleRefreshToken} branchId={effectiveBranchId} date={date} onSelect={setSelectedId} />
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Delivery Queue</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as DeliveryOrderStatus | "");
                setPage(1);
              }}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              <option value="planned">Planned</option>
              <option value="dispatched">Dispatched</option>
              <option value="delivered">Delivered</option>
              <option value="invoiced">Invoiced</option>
            </select>
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={truckFilter}
              onChange={(e) => {
                setTruckFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Truck"
            >
              <option value="">All trucks</option>
              {truckOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.plateNumber}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={driverFilter}
              onChange={(e) => {
                setDriverFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Driver"
            >
              <option value="">All drivers</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Time</th>
                <th className="py-2 pe-4 font-medium">Customer / Project</th>
                <th className="py-2 pe-4 font-medium">Mix</th>
                <th className="py-2 pe-4 font-medium">Volume m³</th>
                <th className="py-2 pe-4 font-medium">Truck</th>
                <th className="py-2 pe-4 font-medium">Driver</th>
                <th className="py-2 pe-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    No deliveries match these filters.
                  </td>
                </tr>
              )}
              {body?.items.map((row) => {
                const truckLabel = row.truckId ? truckOptions.find((t) => t.id === row.truckId)?.plateNumber : null;
                const driverLabel = row.driverId ? driverOptions.find((d) => d.id === row.driverId)?.name : null;
                const customerOrProject = row.projectName ? `${row.customerName} — ${row.projectName}` : (row.customerName ?? "—");
                return (
                  <ClickableRow
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className="border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800"
                    aria-label={`Delivery for ${customerOrProject}, ${row.quantityM3} m³, ${row.status}`}
                  >
                    <td className="py-2 pe-4">{formatAmmanTime(row.scheduledAt)}</td>
                    <td className="py-2 pe-4">{customerOrProject}</td>
                    <td className="py-2 pe-4">{row.productName ?? "—"}</td>
                    <td className="py-2 pe-4">
                      {row.quantityM3}
                      {row.qcFlagged && <span className="ms-1 text-danger">(QC)</span>}
                    </td>
                    <td className="py-2 pe-4">{truckLabel ?? "—"}</td>
                    <td className="py-2 pe-4">{driverLabel ?? "—"}</td>
                    <td className="py-2 pe-4">
                      <StatusBadge label={row.status} tone={DELIVERY_ORDER_STATUS_TONE[row.status] ?? "gray"} />
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="flex items-center justify-between text-sm text-navy-500 dark:text-navy-400">
            <span>
              Page {page} of {totalPages} ({body?.total ?? 0} total)
            </span>
            <div className="flex gap-2 rtl:flex-row-reverse">
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

      <NewDeliveryDialog
        open={showNewDelivery}
        onClose={() => setShowNewDelivery(false)}
        branchId={effectiveBranchId}
        defaultDate={date}
        onCreated={(id) => {
          void list.refetch();
          setScheduleRefreshToken((n) => n + 1);
          setSelectedId(id);
        }}
      />

      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)} title="Delivery detail">
        {selectedId && (
          <DeliveryOrderDetailPanel
            id={selectedId}
            onChanged={() => {
              void list.refetch();
              setScheduleRefreshToken((n) => n + 1);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
