import { useGetHealth, useListAllCubeTestSets, useListClearanceQueue, useListDeliveryOrders } from "@rmixerp/contract";
import { Link } from "wouter";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useModulePermissions } from "../lib/usePermissions";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { Icon, type IconName } from "../components/icons";
import { Skeleton } from "@rmixerp/ui";
import homeBanner from "../assets/home-banner.png";

interface QueueCardProps {
  icon: IconName;
  label: string;
  count: number;
  href: string;
  loading: boolean;
}

/** One actionable count — answers "how many" and opens straight into the matching filtered list, not a dashboard tile that merely describes a number. */
function QueueCard({ icon, label, count, href, loading }: QueueCardProps) {
  if (loading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (count === 0) return null;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-navy-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-navy-800 dark:bg-navy-900"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-semibold tabular-nums text-navy-900 dark:text-navy-100">{count}</span>
        <span className="block truncate text-xs font-medium text-navy-500 dark:text-navy-400">{label}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-navy-300 group-hover:text-orange-500" />
    </Link>
  );
}

/** Permission-gated actionable queue counts — only roles who can act on a queue see its count, and each one opens straight into that queue's own filtered list. */
function QueueCounts() {
  const { t } = useLanguage();
  const dispatchPerms = useModulePermissions("deliveryOrders");
  const qcPerms = useModulePermissions("qc");
  const invoicePerms = useModulePermissions("invoices");
  const clearancePerms = useModulePermissions("clearance");

  const unassigned = useListDeliveryOrders({ page: 1, pageSize: 1, status: "planned" }, { query: { enabled: dispatchPerms.view } });
  const qcHolds = useListAllCubeTestSets({ page: 1, pageSize: 1, result: "fail" }, { query: { enabled: qcPerms.view } });
  const unbilled = useListDeliveryOrders({ page: 1, pageSize: 1, status: "delivered" }, { query: { enabled: invoicePerms.view } });
  const rejectedClearance = useListClearanceQueue({ page: 1, pageSize: 1, status: "rejected" }, { query: { enabled: clearancePerms.view } });
  const retryingClearance = useListClearanceQueue({ page: 1, pageSize: 1, status: "retrying" }, { query: { enabled: clearancePerms.view } });

  const clearanceTotal =
    (rejectedClearance.data?.status === 200 ? rejectedClearance.data.data.total : 0) +
    (retryingClearance.data?.status === 200 ? retryingClearance.data.data.total : 0);

  const cards: (QueueCardProps & { key: string })[] = [
    ...(dispatchPerms.view
      ? [
          {
            key: "unassigned",
            icon: "truck" as IconName,
            label: t.home.queueUnassignedLoads,
            count: unassigned.data?.status === 200 ? unassigned.data.data.total : 0,
            href: "/dispatch?status=planned",
            loading: unassigned.isLoading,
          },
        ]
      : []),
    ...(qcPerms.view
      ? [
          {
            key: "qc",
            icon: "checkCircle" as IconName,
            label: t.home.queueQcHolds,
            count: qcHolds.data?.status === 200 ? qcHolds.data.data.total : 0,
            href: "/qc?result=fail",
            loading: qcHolds.isLoading,
          },
        ]
      : []),
    ...(invoicePerms.view
      ? [
          {
            key: "unbilled",
            icon: "receipt" as IconName,
            label: t.home.queueDeliveredUnbilled,
            count: unbilled.data?.status === 200 ? unbilled.data.data.total : 0,
            href: "/invoices",
            loading: unbilled.isLoading,
          },
        ]
      : []),
    ...(clearancePerms.view
      ? [
          {
            key: "clearance",
            icon: "shield" as IconName,
            label: t.home.queueClearanceExceptions,
            count: clearanceTotal,
            href: "/clearance-queue?status=rejected",
            loading: rejectedClearance.isLoading || retryingClearance.isLoading,
          },
        ]
      : []),
  ];

  const anyVisible = cards.some((c) => c.loading || c.count > 0);
  if (!anyVisible) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ key, ...card }) => (
        <QueueCard key={key} {...card} />
      ))}
    </div>
  );
}

/** Odoo-style app launcher: applications grouped by department, one tile per module. */
export function HomePage() {
  const { t } = useLanguage();
  const { data: currentUser } = useCurrentUser();
  const groups = useVisibleNavGroups();
  const health = useGetHealth();

  const name = currentUser?.status === 200 ? currentUser.data.displayName : "";
  const healthColor = health.isError ? "bg-red-500" : health.isLoading ? "bg-yellow-500" : "bg-green-500";
  const healthLabel = health.isError ? t.health.error : health.isLoading ? t.health.checking : t.health.ok;

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl">
        <img src={homeBanner} alt="" role="presentation" className="h-36 w-full object-cover md:h-44" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/55 to-navy-950/10 rtl:bg-gradient-to-l" />
        <div className="absolute inset-0 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">{name ? t.home.welcome(name) : t.appName}</h1>
            <p className="text-sm text-navy-100">{t.home.subtitle}</p>
          </div>
          <Link
            href="/health"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm hover:border-white/40"
          >
            <span className={`h-2 w-2 rounded-full ${healthColor}`} />
            {healthLabel}
          </Link>
        </div>
      </div>

      <QueueCounts />

      {groups.length === 0 && <p className="text-sm text-navy-400">No applications available for your role yet.</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy-500">{t.home.allModules}</h2>
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                <Icon name={group.icon as IconName} className="h-3.5 w-3.5 text-orange-500" />
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
