import * as React from "react";
import {
  useBouncePostDatedCheque,
  useCancelPostDatedCheque,
  useClearPostDatedCheque,
  useDepositPostDatedCheque,
  useListPostDatedCheques,
  type PostDatedCheque,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

type Status = PostDatedCheque["status"];

const PDC_STATUS_TONE: Record<Status, BadgeTone> = {
  pending: "yellow",
  deposited: "yellow",
  cleared: "green",
  bounced: "red",
  cancelled: "gray",
};

export function PostDatedChequesPage() {
  const permissions = useModulePermissions("postDatedCheques");
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<Status | "">("pending");
  const [bounceReasonById, setBounceReasonById] = React.useState<Record<string, string>>({});

  const list = useListPostDatedCheques({ page, pageSize: 20, ...(status && { status }) });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  const deposit = useDepositPostDatedCheque(refetchOnSuccess(list));
  const clear = useClearPostDatedCheque(refetchOnSuccess(list));
  const bounce = useBouncePostDatedCheque(refetchOnSuccess(list));
  const cancel = useCancelPostDatedCheque(refetchOnSuccess(list));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Post-Dated Cheques</CardTitle>
        <select
          className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Status | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="deposited">Deposited</option>
          <option value="cleared">Cleared</option>
          <option value="bounced">Bounced</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Bank</th>
              <th className="py-2 pe-4 font-medium">Cheque #</th>
              <th className="py-2 pe-4 font-medium">Due</th>
              <th className="py-2 pe-4 font-medium">Status</th>
              <th className="py-2 pe-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {!list.isLoading && (body?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No records.
                </td>
              </tr>
            )}
            {body?.items.map((cheque) => (
              <tr key={cheque.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{cheque.bankName}</td>
                <td className="py-2 pe-4">{cheque.chequeNumber}</td>
                <td className="py-2 pe-4">{new Date(cheque.dueDate).toLocaleDateString()}</td>
                <td className="py-2 pe-4">
                  <StatusBadge label={cheque.status} tone={PDC_STATUS_TONE[cheque.status]} />
                  {cheque.bounceReason && <span className="ms-2 text-xs text-orange-700">({cheque.bounceReason})</span>}
                </td>
                <td className="py-2 pe-4">
                  {permissions.edit && cheque.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={deposit.isPending} onClick={() => deposit.mutate({ id: cheque.id })}>
                        Deposit
                      </Button>
                      <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: cheque.id })}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {cheque.status === "deposited" && (
                    <div className="flex flex-wrap items-center gap-1">
                      {permissions.edit && (
                        <Button size="sm" variant="outline" disabled={clear.isPending} onClick={() => clear.mutate({ id: cheque.id })}>
                          Clear
                        </Button>
                      )}
                      {permissions.edit && (
                        // Bouncing requires postDatedCheques:approve, a privileged
                        // action the server enforces — the input is shown to
                        // anyone who can otherwise manage cheques, matching the
                        // existing override-field precedent (e.g. SalesOrdersPage).
                        <>
                          <Input
                            placeholder="Bounce reason (requires postDatedCheques:approve)"
                            className="h-8 w-56 text-xs"
                            value={bounceReasonById[cheque.id] ?? ""}
                            onChange={(e) => setBounceReasonById((prev) => ({ ...prev, [cheque.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bounce.isPending || !bounceReasonById[cheque.id]}
                            onClick={() => bounce.mutate({ id: cheque.id, data: { reason: bounceReasonById[cheque.id]! } })}
                          >
                            Bounce
                          </Button>
                        </>
                      )}
                    </div>
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
  );
}
