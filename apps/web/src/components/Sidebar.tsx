import * as React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@rmixerp/ui";
import { NAV_GROUPS, type NavGroupId } from "../lib/navConfig";
import { useLanguage } from "../i18n/LanguageContext";
import { useTheme } from "../theme/ThemeContext";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { clearSession, getAccessToken } from "../lib/session";
import { Icon, type IconName } from "./icons";

const COLLAPSE_KEY = "rmixerp-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Fixed left navigation: app switcher grouped by department (Sales,
 * Operations, Procurement, Finance, Reports, Administration), collapsible
 * as a whole (icon rail) and per-group (accordion). Renders from
 * `navConfig.ts` so the sidebar, the home dashboard, and the reports hub
 * never fall out of sync.
 */
export function Sidebar() {
  const { t, toggleLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [location, navigate] = useLocation();
  const { data: currentUser } = useCurrentUser();
  const signedIn = Boolean(getAccessToken()) && currentUser?.status === 200;
  const groups = useVisibleNavGroups();

  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  React.useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // private browsing / storage disabled — collapse state just won't persist
    }
  }, [collapsed]);

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of NAV_GROUPS) {
      initial[group.id] = group.items.some((item) => item.href === location);
    }
    return initial;
  });

  function toggleGroup(id: NavGroupId) {
    setCollapsed(false);
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-navy-900 text-navy-100 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        {!collapsed && (
          <Link href="/" className="truncate font-semibold text-white">
            {t.appName}
            <span className="text-orange-400">.</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ms-auto shrink-0 rounded p-1.5 text-navy-300 hover:bg-navy-800 hover:text-orange-400"
          aria-label="Toggle sidebar"
        >
          <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} className="h-4 w-4" />
        </button>
      </div>

      {signedIn ? (
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          <Link
            href="/"
            className={`mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              location === "/"
                ? "bg-navy-800 text-orange-400"
                : "text-navy-200 hover:bg-navy-800 hover:text-white"
            }`}
          >
            <Icon name="home" className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t.nav.home}</span>}
          </Link>

          {groups.map((group) => (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white ${
                  collapsed ? "justify-center" : "justify-between"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon name={group.icon as IconName} className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{t.navGroups[group.labelKey]}</span>}
                </span>
                {!collapsed && (
                  <Icon
                    name="chevronDown"
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${openGroups[group.id] ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              {!collapsed && openGroups[group.id] && (
                <div className="ms-4 mt-0.5 flex flex-col gap-0.5 border-s border-navy-700 ps-3">
                  {group.items.map((item) => {
                    const active = location === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${
                          active
                            ? "bg-orange-500/15 font-medium text-orange-400"
                            : "text-navy-300 hover:bg-navy-800 hover:text-white"
                        }`}
                      >
                        <Icon name={item.icon as IconName} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t.nav[item.labelKey]}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      ) : (
        <div className="flex-1 px-2">
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
          >
            <Icon name="user" className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t.nav.login}</span>}
          </Link>
        </div>
      )}

      <div className="border-t border-navy-800 px-2 py-3">
        {signedIn && currentUser?.status === 200 && !collapsed && (
          <p className="truncate px-2 pb-2 text-xs text-navy-400">{t.login.loggedInAs(currentUser.data.displayName)}</p>
        )}
        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-navy-200 hover:bg-navy-800 hover:text-orange-400"
            onClick={toggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />
            {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-navy-200 hover:bg-navy-800 hover:text-orange-400"
            onClick={toggleLocale}
            title={t.languageToggle}
          >
            <Icon name="globe" className="h-4 w-4" />
            {!collapsed && <span>{t.languageToggle}</span>}
          </Button>
          {signedIn && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-navy-200 hover:bg-navy-800 hover:text-orange-400"
              onClick={handleLogout}
              title={t.login.logout}
            >
              <Icon name="logOut" className="h-4 w-4" />
              {!collapsed && <span>{t.login.logout}</span>}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
