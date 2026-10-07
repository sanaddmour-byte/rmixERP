import * as React from "react";
import { Link } from "wouter";
import {
  useGetCreditControlDashboard,
  useListAllCubeTestSets,
  useListApprovals,
  useListClearanceQueue,
  useListPostDatedCheques,
} from "@rmixerp/contract";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
import { useModulePermissions } from "../lib/usePermissions";
import { Icon } from "../components/icons";

type Severity = "high" | "medium";

interface ActionItem {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  href: string;
}

/**
 * Cross-module exception work queue — not a notification feed (brief's
 * §9/§34 explicitly distinguish the two). This is a frontend-only
 * aggregator: it fans out to endpoints that already exist (credit
 * control, clearance queue, post-dated cheques, QC cube tests,
 * approvals) and merges them into one severity-sorted list, per
 * docs/ui-ux-audit.md §11 — no backend change.
 */
export function ActionCenterPage() {
  const { t } = useLanguage();
  const creditPerms = useModulePermissions("receivablesReports");
  const clearancePerms = useModulePermissions("clearance");
  const pdcPerms = useModulePermissions("postDatedCheques");
  const qcPerms = useModulePermissions("qc");
  const approvalPerms = useModulePermissions("purchaseOrders");

  const credit = useGetCreditControlDashboard({ query: { enabled: creditPerms.view } });
  const clearance = useListClearanceQueue({ page: 1, pageSize: 50, status: "rejected" }, { query: { enabled: clearancePerms.view } });
  const clearanceRetrying = useListClearanceQueue({ page: 1, pageSize: 50, status: "retrying" }, { query: { enabled: clearancePerms.view } });
  const bouncedCheques = useListPostDatedCheques({ page: 1, pageSize: 50, status: "bounced" }, { query: { enabled: pdcPerms.view } });
  const failedQc = useListAllCubeTestSets({ page: 1, pageSize: 50, result: "fail" }, { query: { enabled: qcPerms.view } });
  const approvals = useListApprovals({ query: { enabled: approvalPerms.view } });

  const isLoading =
    (creditPerms.view && credit.isLoading) ||
    (clearancePerms.view && (clearance.isLoading || clearanceRetrying.isLoading)) ||
    (pdcPerms.view && bouncedCheques.isLoading) ||
    (qcPerms.view && failedQc.isLoading) ||
    (approvalPerms.view && approvals.isLoading);

  const items = React.useMemo<ActionItem[]>(() => {
    const out: ActionItem[] = [];

    const creditBody = credit.data?.status === 200 ? credit.data.data : undefined;
    for (const row of creditBody?.items ?? []) {
      if (row.utilizationBasisPoints <= 10_000) continue;
      out.push({
        id: `credit-${row.customerId}`,
        severity: "high",
        title: `${t.actionCenterPage.creditBlockedTitle} — ${row.customerName}`,
        description: t.actionCenterPage.creditBlockedDesc(row.outstandingJod, row.creditLimitJod),
        href: `/receivables-reports?customerId=${row.customerId}`,
      });
    }

    const rejectedBody = clearance.data?.status === 200 ? clearance.data.data : undefined;
    const retryingBody = clearanceRetrying.data?.status === 200 ? clearanceRetrying.data.data : undefined;
    for (const doc of [...(rejectedBody?.items ?? []), ...(retryingBody?.items ?? [])]) {
      out.push({
        id: `clearance-${doc.id}`,
        severity: "high",
        title: t.actionCenterPage.failedClearanceTitle,
        description: t.actionCenterPage.failedClearanceDesc(doc.documentNumber),
        href: "/clearance-queue",
      });
    }

    const pdcBody = bouncedCheques.data?.status === 200 ? bouncedCheques.data.data : undefined;
    for (const cheque of pdcBody?.items ?? []) {
      out.push({
        id: `pdc-${cheque.id}`,
        severity: "high",
        title: t.actionCenterPage.bouncedChequeTitle,
        description: t.actionCenterPage.bouncedChequeDesc(cheque.chequeNumber, cheque.bankName),
        href: "/post-dated-cheques?status=bounced",
      });
    }

    const qcBody = failedQc.data?.status === 200 ? failedQc.data.data : undefined;
    for (const sample of qcBody?.items ?? []) {
      out.push({
        id: `qc-${sample.id}`,
        severity: "medium",
        title: t.actionCenterPage.failedQcTitle,
        description: t.actionCenterPage.failedQcDesc(String(sample.batchNumber)),
        href: "/qc",
      });
    }

    const approvalsBody = approvals.data?.status === 200 ? approvals.data.data : undefined;
    for (const item of approvalsBody?.items ?? []) {
      out.push({
        id: `approval-${item.id}`,
        severity: "medium",
        title: t.actionCenterPage.pendingApprovalTitle,
        description: t.actionCenterPage.pendingApprovalDesc(item.number),
        href: item.documentType === "purchase_request" ? "/purchase-requests" : item.documentType === "purchase_order" ? "/purchase-orders" : "/vendor-bills",
      });
    }

    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  }, [credit.data, clearance.data, clearanceRetrying.data, bouncedCheques.data, failedQc.data, approvals.data, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.actionCenterPage.title}</CardTitle>
        <p className="text-sm text-text-muted">{t.actionCenterPage.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
        {!isLoading && items.length === 0 && <p className="py-8 text-center text-text-muted">{t.actionCenterPage.empty}</p>}
        {!isLoading &&
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 hover:bg-surface-raised"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.severity === "high" ? "bg-danger-surface text-danger-text" : "bg-warning-surface text-warning-text"
                }`}
              >
                {item.severity === "high" ? t.actionCenterPage.severityHigh : t.actionCenterPage.severityMedium}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-text">{item.title}</span>
                <span className="block text-sm text-text-muted">{item.description}</span>
              </span>
              <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 text-text-subtle" />
            </Link>
          ))}
      </CardContent>
    </Card>
  );
}
