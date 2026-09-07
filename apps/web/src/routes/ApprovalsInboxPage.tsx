import { Link } from "wouter";
import { useListApprovals } from "@rmixerp/contract";
import { Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";

const DOCUMENT_HREF: Record<string, (id: string) => string> = {
  purchase_request: (id) => `/purchase-requests?id=${id}`,
  purchase_order: (id) => `/purchase-orders?id=${id}`,
  vendor_bill: (id) => `/vendor-bills?id=${id}`,
};

const DOCUMENT_LABEL: Record<string, string> = {
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
  vendor_bill: "Vendor Bill",
};

/** Cross-module approvals inbox (PLAN.md Phase 10): every submitted purchase request/order and draft vendor bill the signed-in user has permission to approve, in one list. Server-scoped to the caller's own :approve permissions -- an empty list here just means nothing is currently waiting on this user. */
export function ApprovalsInboxPage() {
  const list = useListApprovals();
  const items = list.data?.status === 200 ? list.data.data.items : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approvals Inbox</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2 pe-4 font-medium">Number</th>
              <th className="py-2 pe-4 font-medium">Amount (JOD)</th>
              <th className="py-2 pe-4 font-medium">Submitted</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {!list.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  Nothing waiting on your approval.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={`${item.documentType}-${item.id}`} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{DOCUMENT_LABEL[item.documentType] ?? item.documentType}</td>
                <td className="py-2 pe-4">{item.number}</td>
                <td className="py-2 pe-4">{item.amountJod ?? "—"}</td>
                <td className="py-2 pe-4">{new Date(item.createdAt).toLocaleDateString()}</td>
                <td className="py-2 text-end">
                  <Link href={DOCUMENT_HREF[item.documentType]?.(item.id) ?? "#"} className="text-orange-600 hover:underline dark:text-orange-400">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
