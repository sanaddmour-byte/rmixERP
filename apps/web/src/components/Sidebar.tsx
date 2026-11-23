import * as React from "react";
import { Link, useLocation } from "wouter";
import { useListBranches } from "@rmixerp/contract";
import { Button, Drawer } from "@rmixerp/ui";
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

interface NavLinksProps {
  collapsed: boolean;
  signedIn: boolean;
  location: string;
  groups: ReturnType<typeof useVisibleNavGroups>;
  openGroups: Record<string, boolean>;
  toggleGroup: (id: NavGroupId) => void;
  /** Called on an actual navigation click (not a group-toggle button) — the mobile drawer closes itself on this, the desktop rail passes nothing. */
  onNavigate?: () => void;
}

/** The nav tree itself — shared by the desktop rail and the mobile drawer so they can never drift apart. */
function NavLinks({ collapsed, signedIn, location, groups, openGroups, toggleGroup, onNavigate }: NavLinksProps) {
  const { t } = useLanguage();

  if (!signedIn) {
    return (
      <div className="flex-1 px-2">
        <Link
          href="/login"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white"
        >
          <Icon name="user" className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t.nav.login}</span>}
        </Link>
      </div>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-2">
      <Link
        href="/"
        onClick={onNavigate}
        className={`mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
          location === "/" ? "bg-navy-800 text-orange-400" : "text-navy-200 hover:bg-navy-800 hover:text-white"
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
              <Icon name="chevronDown" className={`h-3.5 w-3.5 shrink-0 transition-transform ${openGroups[group.id] ? "rotate-180" : ""}`} />
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
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${
                      active ? "bg-orange-500/15 font-medium text-orange-400" : "text-navy-300 hover:bg-navy-800 hover:text-white"
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
  );
}

interface FooterActionsProps {
  collapsed: boolean;
  signedIn: boolean;
  displayName?: string | undefined;
  onLogout: () => void;
}

/** Theme/locale/logout row — shared by the desktop rail and the mobile drawer. */
function FooterActions({ collapsed, signedIn, displayName, onLogout }: FooterActionsProps) {
  const { t, toggleLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="border-t border-navy-800 px-2 py-3">
      {signedIn && displayName && !collapsed && <p className="truncate px-2 pb-2 text-xs text-navy-400">{t.login.loggedInAs(displayName)}</p>}
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
            onClick={onLogout}
            title={t.login.logout}
          >
            <Icon name="logOut" className="h-4 w-4" />
            {!collapsed && <span>{t.login.logout}</span>}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Which plant the signed-in user is scoped to, if any — shown on the mobile top bar so plant context survives collapsing the nav into a drawer. Most users (incl. admin) have no fixed branchId and see nothing here; a branch-scoped user's own plant name does. */
function PlantIndicator() {
  const { data: currentUser } = useCurrentUser();
  const branchId = currentUser?.status === 200 ? currentUser.data.branchId : null;
  const branches = useListBranches({ page: 1, pageSize: 100 }, { query: { enabled: Boolean(branchId) } });
  if (!branchId) return null;
  const branchName = branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items.find((b) => b.id === branchId)?.name : null;
  return <span className="truncate text-xs text-navy-300">{branchName ?? "…"}</span>;
}

/**
 * Fixed left navigation on desktop: app switcher grouped by department
 * (Sales, Operations, Procurement, Finance, Reports, Administration),
 * collapsible as a whole (icon rail) and per-group (accordion). Below the
 * `md` breakpoint it becomes a top bar + drawer instead — a permanently
 * visible 256px rail leaves almost nothing for the page itself at a
 * 390px viewport. Renders from `navConfig.ts` so the sidebar, the home
 * dashboard, and the reports hub never fall out of sync.
 */
export function Sidebar() {
  const { t } = useLanguage();
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

  const [mobileOpen, setMobileOpen] = React.useState(false);

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
    setMobileOpen(false);
    navigate("/login");
  }

  const displayName = currentUser?.status === 200 ? currentUser.data.displayName : undefined;

  return (
    <>
      {/* Mobile top bar (below md) — replaces the always-visible rail with a drawer trigger. */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-navy-800 bg-navy-900 px-3 py-3 text-navy-100 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded p-1.5 text-navy-200 hover:bg-navy-800"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <Link href="/" className="truncate font-semibold text-white">
          {t.appName}
          <span className="text-orange-400">.</span>
        </Link>
        <PlantIndicator />
      </div>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={t.appName} className="w-72 max-w-full min-w-0 bg-navy-900 p-0 text-navy-100 sm:max-w-xs">
        <div className="flex min-h-0 flex-1 flex-col">
          <NavLinks
            collapsed={false}
            signedIn={signedIn}
            location={location}
            groups={groups}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
            onNavigate={() => setMobileOpen(false)}
          />
          <FooterActions collapsed={false} signedIn={signedIn} displayName={displayName} onLogout={handleLogout} />
        </div>
      </Drawer>

      {/* Desktop rail (md and up). */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-navy-900 text-navy-100 transition-[width] duration-200 md:flex ${
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

        <NavLinks collapsed={collapsed} signedIn={signedIn} location={location} groups={groups} openGroups={openGroups} toggleGroup={toggleGroup} />
        <FooterActions collapsed={collapsed} signedIn={signedIn} displayName={displayName} onLogout={handleLogout} />
      </aside>
    </>
  );
}
