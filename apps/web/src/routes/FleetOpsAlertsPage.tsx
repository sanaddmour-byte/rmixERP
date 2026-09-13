import { Link } from "wouter";
import { useGetDocumentExpiryReport } from "@rmixerp/contract";
import { Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { useModulePermissions } from "../lib/usePermissions";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

const DOCUMENT_LABEL: Record<string, string> = {
  registration: "Registration",
  insurance: "Insurance",
  inspection: "Inspection",
  license: "License",
};

/** Fleet compliance alerts (PLAN.md Phase 10): every truck/driver document that's already expired or within the company's configured warning window. Back-office/dispatcher screen — the actual dispatch-time block lives in the dispatch flow itself (DispatchPage). */
export function FleetOpsAlertsPage() {
  const permissions = useModulePermissions("trucks");
  const report = useGetDocumentExpiryReport({});
  const r = report.data?.status === 200 ? report.data.data : undefined;

  if (!permissions.view) return <p className="text-sm text-navy-400">You do not have access to fleet alerts.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Document-Expiry Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {r && <p className="text-xs text-navy-500 dark:text-navy-400">Warning window: {r.warningDays} days before expiry.</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2 pe-4 font-medium">Truck/Driver</th>
              <th className="py-2 pe-4 font-medium">Document</th>
              <th className="py-2 pe-4 font-medium">Expires</th>
              <th className="py-2 pe-4 font-medium">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(r?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No documents expired or nearing expiry.
                </td>
              </tr>
            )}
            {r?.items.map((item, idx) => {
              const tone: BadgeTone = item.status === "expired" ? "red" : "yellow";
              return (
                <tr key={idx} className="border-b border-navy-100 dark:border-navy-800">
                  <td className="py-2 pe-4 capitalize">{item.entityType}</td>
                  <td className="py-2 pe-4">{item.label}</td>
                  <td className="py-2 pe-4">{DOCUMENT_LABEL[item.document] ?? item.document}</td>
                  <td className="py-2 pe-4">{new Date(item.expiresAt).toLocaleDateString()}</td>
                  <td className="py-2 pe-4">
                    <StatusBadge label={item.status} tone={tone} />
                  </td>
                  <td className="py-2 text-end">
                    <Link
                      href={item.entityType === "truck" ? "/trucks" : "/drivers"}
                      className="text-orange-600 hover:underline dark:text-orange-400"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
