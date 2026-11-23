import { useGetHealth, useListAllCubeTestSets, useListDeliveryOrders } from "@rmixerp/contract";
import { Link } from "wouter";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { useModulePermissions } from "../lib/usePermissions";
import { Icon, type IconName } from "../components/icons";

/**
 * One permission-aware work-queue card: a live count against a specific
 * filter, opening straight into that filtered list (not the bare module)
 * when clicked — the Dispatch/QC/Invoices pages each read the matching
 * query param on mount to pre-apply the same filter this count used, so
 * the number shown is exactly what the user lands on.
 */
function WorkQueueCard({ href, icon, label, description, count }: { href: string; icon: IconName; label: string; description: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-navy-800 dark:bg-navy-900"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-navy-800 dark:text-orange-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-navy-900 dark:text-navy-100">{count}</p>
        <p className="truncate text-sm font-medium text-navy-700 dark:text-navy-300">{label}</p>
        <p className="truncate text-xs text-navy-500 dark:text-navy-400">{description}</p>
      </div>
    </Link>
  );
}

/** Odoo-style app launcher: applications grouped by department, one tile per module. */
export function HomePage() {
  const { t } = useLanguage();
  const { data: currentUser } = useCurrentUser();
  const groups = useVisibleNavGroups();
  const health = useGetHealth();

  const dispatchPermissions = useModulePermissions("deliveryOrders");
  const qcPermissions = useModulePermissions("qc");

  // pageSize: 1 — only `total` is read, never `items`; same list endpoints
  // the Dispatch/QC/Invoices pages themselves use, so a count shown here
  // can never drift from what that filtered list actually returns.
  const unassignedLoads = useListDeliveryOrders({ page: 1, pageSize: 1, unassigned: true }, { query: { enabled: dispatchPermissions.view } });
  const qcHolds = useListAllCubeTestSets({ page: 1, pageSize: 1, result: "fail" }, { query: { enabled: qcPermissions.view } });
  const deliveredUnbilled = useListDeliveryOrders({ page: 1, pageSize: 1, status: "delivered" }, { query: { enabled: dispatchPermissions.view } });

  const unassignedCount = unassignedLoads.data?.status === 200 ? unassignedLoads.data.data.total : 0;
  const qcHoldCount = qcHolds.data?.status === 200 ? qcHolds.data.data.total : 0;
  const deliveredUnbilledCount = deliveredUnbilled.data?.status === 200 ? deliveredUnbilled.data.data.total : 0;

  const workQueueCards = [
    dispatchPermissions.view && { href: "/dispatch?unassigned=true", icon: "truck" as const, label: t.home.unassignedLoads, description: t.home.unassignedLoadsDesc, count: unassignedCount },
    qcPermissions.view && { href: "/qc?result=fail", icon: "flask" as const, label: t.home.qcHolds, description: t.home.qcHoldsDesc, count: qcHoldCount },
    dispatchPermissions.view && { href: "/invoices", icon: "receipt" as const, label: t.home.deliveredUnbilled, description: t.home.deliveredUnbilledDesc, count: deliveredUnbilledCount },
  ].filter((c): c is Exclude<typeof c, false> => c !== false);
  const workQueuesWithWork = workQueueCards.filter((c) => c.count > 0);

  const name = currentUser?.status === 200 ? currentUser.data.displayName : "";
  const healthColor = health.isError ? "bg-red-500" : health.isLoading ? "bg-yellow-500" : "bg-green-500";
  const healthLabel = health.isError ? t.health.error : health.isLoading ? t.health.checking : t.health.ok;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900 dark:text-navy-100">{name ? t.home.welcome(name) : t.appName}</h1>
          <p className="text-sm text-navy-500 dark:text-navy-400">{t.home.subtitle}</p>
        </div>
        <Link
          href="/health"
          className="flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-600 dark:text-navy-300 shadow-sm hover:border-navy-300 dark:border-navy-700 dark:bg-navy-900 dark:hover:border-navy-600"
        >
          <span className={`h-2 w-2 rounded-full ${healthColor}`} />
          {healthLabel}
        </Link>
      </div>

      {workQueueCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-500">{t.home.workQueuesTitle}</h2>
          {workQueuesWithWork.length === 0 ? (
            <p className="text-sm text-navy-400">{t.home.noWorkQueues}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workQueuesWithWork.map((card) => (
                <WorkQueueCard key={card.href} {...card} />
              ))}
            </div>
          )}
        </section>
      )}

      {groups.length === 0 && <p className="text-sm text-navy-400">No applications available for your role yet.</p>}

      {groups.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-500">{t.home.allModules}</h2>
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.id}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-500">
                  <Icon name={group.icon as IconName} className="h-4 w-4 text-orange-500" />
                  {t.navGroups[group.labelKey]}
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-2 rounded-xl border border-navy-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-navy-800 dark:bg-navy-900"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 dark:bg-navy-800 text-navy-700 dark:text-navy-300 transition group-hover:bg-orange-50 group-hover:text-orange-600">
                        <Icon name={item.icon as IconName} className="h-6 w-6" />
                      </span>
                      <span className="text-xs font-medium text-navy-700 dark:text-navy-300">{t.nav[item.labelKey]}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
