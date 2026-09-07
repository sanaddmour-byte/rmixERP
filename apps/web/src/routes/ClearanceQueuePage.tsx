import * as React from "react";
import {
  useListClearanceQueue,
  useSubmitCreditNoteForClearance,
  useSubmitDebitNoteForClearance,
  useSubmitInvoiceForClearance,
  type ClearanceQueueItem,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type ClearanceStatus = ClearanceQueueItem["clearanceStatus"];
type DocumentType = ClearanceQueueItem["documentType"];

const PAGE_SIZE = 20;

/**
 * Back-office admin queue across invoices, credit notes, and debit notes
 * awaiting or failing clearance — web-only, no mobile equivalent
 * (CLAUDE.md's back-office-screen exception, same reasoning as the GL/
 * financial-statement screens).
 */
export function ClearanceQueuePage() {
  const permissions = useModulePermissions("clearance");
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<ClearanceStatus | "">("");
  const [documentType, setDocumentType] = React.useState<DocumentType | "">("");

  const list = useListClearanceQueue({
    page,
    pageSize: PAGE_SIZE,
    ...(status && { status }),
    ...(documentType && { documentType }),
  });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / PAGE_SIZE));

  const submitInvoice = useSubmitInvoiceForClearance(refetchOnSuccess(list));
  const submitCreditNote = useSubmitCreditNoteForClearance(refetchOnSuccess(list));
  const submitDebitNote = useSubmitDebitNoteForClearance(refetchOnSuccess(list));

  function retry(item: ClearanceQueueItem) {
    if (item.documentType === "invoice") submitInvoice.mutate({ id: item.id });
    else if (item.documentType === "credit_note") submitCreditNote.mutate({ id: item.id });
    else submitDebitNote.mutate({ id: item.id });
  }

  if (!permissions.view) return <p className="text-sm text-navy-400">You do not have access to the clearance queue.</p>;

  const retrying = submitInvoice.isPending || submitCreditNote.isPending || submitDebitNote.isPending;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Clearance Queue</CardTitle>
        <div className="flex gap-2">
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
            value={documentType}
            onChange={(e) => {
              setDocumentType(e.target.value as DocumentType | "");
              setPage(1);
            }}
          >
            <option value="">All document types</option>
            <option value="invoice">Invoice</option>
            <option value="credit_note">Credit Note</option>
            <option value="debit_note">Debit Note</option>
          </select>
          <select
            className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ClearanceStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="retrying">Retrying</option>
            <option value="cleared">Cleared</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500">
              <th className="py-2 pe-4 font-medium">Document</th>
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2 pe-4 font-medium">Status</th>
              <th className="py-2 pe-4 font-medium">Attempts</th>
              <th className="py-2 pe-4 font-medium">ICV</th>
              <th className="py-2 pe-4 font-medium">Next Retry</th>
              <th className="py-2 pe-4 font-medium">Error</th>
              <th className="py-2 pe-4 font-medium">Total (JOD)</th>
              <th className="py-2 pe-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-navy-400">
                  Loading…
                </td>
              </tr>
            )}
            {!list.isLoading && (body?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-navy-400">
                  Nothing in the clearance queue.
                </td>
              </tr>
            )}
            {body?.items.map((item) => (
              <tr key={item.id} className="border-b border-navy-100">
                <td className="py-2 pe-4">{item.documentNumber}</td>
                <td className="py-2 pe-4 capitalize">{item.documentType.replace(/_/g, " ")}</td>
                <td className="py-2 pe-4 capitalize">{item.clearanceStatus}</td>
                <td className="py-2 pe-4">{item.clearanceAttempts}</td>
                <td className="py-2 pe-4">{item.clearanceIcv ?? "—"}</td>
                <td className="py-2 pe-4">{item.clearanceNextRetryAt ? new Date(item.clearanceNextRetryAt).toLocaleString() : "—"}</td>
                <td className="max-w-xs truncate py-2 pe-4 text-orange-700" title={item.clearanceError ?? undefined}>
                  {item.clearanceError ?? "—"}
                </td>
                <td className="py-2 pe-4">{item.totalJod}</td>
                <td className="py-2 pe-4">
                  {permissions.create && (item.clearanceStatus === "pending" || item.clearanceStatus === "retrying") && (
                    <Button size="sm" variant="outline" disabled={retrying} onClick={() => retry(item)}>
                      {item.clearanceStatus === "retrying" ? "Retry now" : "Submit"}
                    </Button>
                  )}
                </td>
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
  );
}
