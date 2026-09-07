import { useGetHealth } from "@rmixerp/contract";
import { Link } from "wouter";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { Icon, type IconName } from "../components/icons";

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

      {groups.length === 0 && <p className="text-sm text-navy-400">No applications available for your role yet.</p>}

      {groups.map((group) => (
        <section key={group.id}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-navy-500">
            <Icon name={group.icon as IconName} className="h-4 w-4 text-orange-500" />
            {t.navGroups[group.labelKey]}
          </h2>
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
  );
}
