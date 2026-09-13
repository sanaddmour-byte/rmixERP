import * as React from "react";
import { useLocation, useSearchParams } from "wouter";
import {
  useApprovePurchaseRequest,
  useCancelPurchaseRequest,
  useCreatePurchaseRequest,
  useCreatePurchaseRequestLine,
  useGetPurchaseRequest,
  useListBranches,
  useListPurchaseRequests,
  useListRawMaterials,
  useRejectPurchaseRequest,
  useSubmitPurchaseRequest,
  type PurchaseRequest,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

type Status = PurchaseRequest["status"];

const STATUS_TONE: Record<Status, BadgeTone> = {
  draft: "gray",
  submitted: "yellow",
  approved: "green",
  rejected: "red",
  cancelled: "gray",
};

function PurchaseRequestDetailPanel({ id, onConvert }: { id: string; onConvert: (prId: string) => void }) {
  const detail = useGetPurchaseRequest(id);
  const permissions = useModulePermissions("purchaseRequests");
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const rawMaterialOptions = rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];

  const createLine = useCreatePurchaseRequestLine(refetchOnSuccess(detail));
  const submit = useSubmitPurchaseRequest(refetchOnSuccess(detail));
  const approve = useApprovePurchaseRequest(refetchOnSuccess(detail));
  const reject = useRejectPurchaseRequest(refetchOnSuccess(detail));
  const cancel = useCancelPurchaseRequest(refetchOnSuccess(detail));

  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [reason, setReason] = React.useState("");

  const p = detail.data?.status === 200 ? detail.data.data : undefined;
  if (detail.isLoading) return <p className="text-navy-500">Loading…</p>;
  if (!p) return <p className="text-navy-500">Not found.</p>;

  function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    createLine.mutate({ id, data: { rawMaterialId, quantity } });
    setRawMaterialId("");
    setQuantity("");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          {p.requestNumber} — <StatusBadge label={p.status} tone={STATUS_TONE[p.status]} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {p.status === "draft" && (
            <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate({ id })}>
              Submit
            </Button>
          )}
          {p.status === "submitted" && permissions.approve && (
            <>
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id })}>
                Approve
              </Button>
              <Button
                size="sm"
                disabled={reject.isPending}
                onClick={() => reject.mutate({ id, data: { ...(reason && { reason }) } })}
              >
                Reject
              </Button>
              <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-56" />
            </>
          )}
          {(p.status === "draft" || p.status === "submitted") && (
            <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ id })}>
              Cancel
            </Button>
          )}
          {p.status === "approved" && (
            <Button size="sm" variant="accent" onClick={() => onConvert(id)}>
              Convert to Purchase Order →
            </Button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Raw Material</th>
              <th className="py-2 pe-4 font-medium">Quantity</th>
              <th className="py-2 pe-4 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((line) => (
              <tr key={line.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{rawMaterialOptions.find((r) => r.id === line.rawMaterialId)?.name ?? line.rawMaterialId}</td>
                <td className="py-2 pe-4">{line.quantity}</td>
                <td className="py-2 pe-4">{line.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {p.status === "draft" && (
          <form onSubmit={handleAddLine} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Raw Material
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                required
                value={rawMaterialId}
                onChange={(e) => setRawMaterialId(e.target.value)}
              >
                <option value="" disabled>
                  Select…
                </option>
                {rawMaterialOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Quantity
              <Input required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-28" />
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

export function PurchaseRequestsPage() {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<Status | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get("id"));
  const permissions = useModulePermissions("purchaseRequests");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions = branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const [branchId, setBranchId] = React.useState("");

  const list = useListPurchaseRequests({ page, pageSize: 20, ...(status && { status }) });
  const create = useCreatePurchaseRequest(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { data: { branchId } },
      { onSuccess: (result) => result.status === 201 && setSelectedId(result.data.id) },
    );
    setBranchId("");
  }

  return (
    <div className="space-y-4">
      {permissions.create && (
        <Card>
          <CardHeader>
            <CardTitle>New Purchase Request</CardTitle>
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
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Purchase Requests</CardTitle>
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
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Request #</th>
                <th className="py-2 pe-4 font-medium">Status</th>
                <th className="py-2 pe-4 font-medium">Needed By</th>
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
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-2 pe-4">{row.requestNumber}</td>
                  <td className="py-2 pe-4">
                    <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />
                  </td>
                  <td className="py-2 pe-4">{row.neededByDate ? new Date(row.neededByDate).toLocaleDateString() : "—"}</td>
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

      {selectedId && (
        <PurchaseRequestDetailPanel id={selectedId} onConvert={(prId) => navigate(`/purchase-orders?purchaseRequestId=${prId}`)} />
      )}
    </div>
  );
}
