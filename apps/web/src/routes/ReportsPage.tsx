import { Link } from "wouter";
import { Card, CardContent } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
import { useModulePermissions } from "../lib/usePermissions";
import { Icon, type IconName } from "../components/icons";

interface ReportLink {
  href: string;
  icon: IconName;
  title: string;
  description: string;
}

function ReportTile({ href, icon, title, description, openLabel }: ReportLink & { openLabel: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
        <CardContent className="flex items-start gap-4 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-800 text-navy-700 dark:text-navy-300">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-navy-900 dark:text-navy-100">{title}</p>
            <p className="text-sm text-navy-500 dark:text-navy-400">{description}</p>
            <span className="inline-block pt-1 text-xs font-medium text-orange-600">{openLabel} →</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Cross-module reporting hub. Finance/receivables reports are their own
 * stacked page (ReceivablesReportsPage); QC traceability and production
 * yield-variance live embedded inside their operational screens
 * (QCPage/ProductionOrdersPage) — this page is the discoverable front door
 * to all of them, and the natural home for future per-module reports.
 */
export function ReportsPage() {
  const { t } = useLanguage();
  const receivablesReports = useModulePermissions("receivablesReports");
  const qc = useModulePermissions("qc");
  const productionOrders = useModulePermissions("productionOrders");

  const hasAny = receivablesReports.view || qc.view || productionOrders.view;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900 dark:text-navy-100">{t.reportsHub.title}</h1>
        <p className="text-sm text-navy-500 dark:text-navy-400">{t.reportsHub.subtitle}</p>
      </div>

      {!hasAny && <p className="text-sm text-navy-400">No reports available for your role yet.</p>}

      {receivablesReports.view && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-500">
            {t.reportsHub.financeSection}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportTile
              href="/receivables-reports"
              icon="fileText"
              title={t.nav.customerStatement}
              description={t.reportsHub.customerStatementDesc}
              openLabel={t.reportsHub.openReport}
            />
            <ReportTile
              href="/receivables-reports"
              icon="barChart"
              title={t.reportsHub.agingTitle}
              description={t.reportsHub.agingDesc}
              openLabel={t.reportsHub.openReport}
            />
            <ReportTile
              href="/receivables-reports"
              icon="creditCard"
              title={t.reportsHub.creditControlTitle}
              description={t.reportsHub.creditControlDesc}
              openLabel={t.reportsHub.openReport}
            />
            <ReportTile
              href="/receivables-reports"
              icon="shield"
              title={t.reportsHub.creditOverridesTitle}
              description={t.reportsHub.creditOverridesDesc}
              openLabel={t.reportsHub.openReport}
            />
          </div>
        </section>
      )}

      {(qc.view || productionOrders.view) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-500">
            {t.reportsHub.operationsSection}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {qc.view && (
              <ReportTile
                href="/qc"
                icon="checkCircle"
                title={t.nav.qc}
                description={t.reportsHub.qcTraceabilityDesc}
                openLabel={t.reportsHub.openReport}
              />
            )}
            {productionOrders.view && (
              <ReportTile
                href="/production-orders"
                icon="clipboard"
                title={t.nav.productionOrders}
                description={t.reportsHub.productionYieldDesc}
                openLabel={t.reportsHub.openReport}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
