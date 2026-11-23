import * as React from "react";
import { Link, useLocation } from "wouter";
import { Button, Drawer } from "@rmixerp/ui";
import { NAV_GROUPS, type NavGroupId } from "../lib/navConfig";
import { useLanguage } from "../i18n/LanguageContext";
import { useTheme } from "../theme/ThemeContext";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { useActiveBranch } from "../lib/activeBranch";
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

/** The plant indicator shown in the shell after sign-in — a fixed label for most roles, a switcher for the few assigned to none. */
function PlantIndicator({ compact }: { compact?: boolean }) {
  const { activeBranch, branchOptions, canSwitch, setActiveBranchId } = useActiveBranch();
  if (!activeBranch) return null;
  if (!canSwitch) {
    return (
      <span className={`flex items-center gap-1.5 text-xs text-navy-400 ${compact ? "" : "px-2"}`}>
        <Icon name="mapPin" className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span className="truncate">{activeBranch.name}</span>}
      </span>
    );
  }
  return (
    <label className={`flex items-center gap-1.5 text-xs text-navy-400 ${compact ? "" : "px-2"}`}>
      <Icon name="mapPin" className="h-3.5 w-3.5 shrink-0" />
      {!compact && (
        <select
          className="rounded border border-navy-700 bg-navy-900 px-1.5 py-0.5 text-xs text-navy-100"
          value={activeBranch.id}
          onChange={(e) => setActiveBranchId(e.target.value)}
          aria-label="Plant"
        >
          {branchOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

function NavLinks({
  collapsed,
  groups,
  location,
  onNavigate,
}: {
  collapsed: boolean;
  groups: ReturnType<typeof useVisibleNavGroups>;
  location: string;
  /** Called when an actual nav link (not a group accordion toggle) is clicked — closes the mobile drawer. */
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of NAV_GROUPS) {
      initial[group.id] = group.items.some((item) => item.href === location);
    }
    return initial;
  });

  function toggleGroup(id: NavGroupId) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-2">
      <Link
        href="/"
        onClick={onNavigate}
        title={collapsed ? t.nav.home : undefined}
        aria-label={collapsed ? t.nav.home : undefined}
        className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
          location === "/" ? "bg-navy-800 text-orange-400" : "text-navy-200 hover:bg-navy-800 hover:text-white"
        }`}
      >
        <Icon name="home" className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t.nav.home}</span>}
      </Link>
      <Link
        href="/action-center"
        onClick={onNavigate}
        title={collapsed ? t.nav.actionCenter : undefined}
        aria-label={collapsed ? t.nav.actionCenter : undefined}
        className={`mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
          location === "/action-center" ? "bg-navy-800 text-orange-400" : "text-navy-200 hover:bg-navy-800 hover:text-white"
        }`}
      >
        <Icon name="alertTriangle" className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t.nav.actionCenter}</span>}
      </Link>

      {groups.map((group) => (
        <div key={group.id} className="mb-1">
          <button
            type="button"
            onClick={() => toggleGroup(group.id)}
            title={collapsed ? t.navGroups[group.labelKey] : undefined}
            aria-label={collapsed ? t.navGroups[group.labelKey] : undefined}
            aria-expanded={!collapsed && Boolean(openGroups[group.id])}
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

function FooterActions({ collapsed, signedIn, onLogout }: { collapsed: boolean; signedIn: boolean; onLogout: () => void }) {
  const { t, toggleLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-navy-200 hover:bg-navy-800 hover:text-orange-400"
        onClick={toggleTheme}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
        aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
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
        aria-label={t.languageToggle}
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
          aria-label={t.login.logout}
        >
          <Icon name="logOut" className="h-4 w-4" />
          {!collapsed && <span>{t.login.logout}</span>}
        </Button>
      )}
    </div>
  );
}

/**
 * Navigation shell: a fixed, collapsible left rail on tablet/desktop
 * (md and up), and — since a `w-64` rail has nowhere to go on a 390px
 * phone — a hamburger-triggered Drawer carrying the same nav content on
 * small screens, per the brief's §2 ask. The plant the signed-in user is
 * working in stays visible in both forms (`PlantIndicator`), not only on
 * Dispatch's own selector.
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

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <>
      {/* Mobile top bar (below md) — the desktop rail is hidden here entirely. */}
      <div className="flex items-center justify-between gap-2 border-b border-navy-800 bg-navy-900 px-3 py-2.5 text-navy-100 md:hidden">
        {signedIn && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded p-1.5 text-navy-300 hover:bg-navy-800 hover:text-white"
            aria-label="Open navigation"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
        )}
        <Link href="/" className="truncate font-semibold text-white">
          {t.appName}
          <span className="text-orange-400">.</span>
        </Link>
        {signedIn ? <PlantIndicator compact /> : <span />}
      </div>

      {signedIn && (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={t.appName}>
          <div className="-mx-5 -my-4 flex h-[calc(100%+2rem)] flex-col bg-navy-900 text-navy-100">
            <div className="px-4 py-3">
              <PlantIndicator />
            </div>
            <NavLinks collapsed={false} groups={groups} location={location} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-navy-800 px-4 py-3">
              <FooterActions collapsed={false} signedIn={signedIn} onLogout={handleLogout} />
            </div>
          </div>
        </Drawer>
      )}

      {/* Desktop/tablet rail (md and up). */}
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

        {signedIn && (
          <div className={`px-2 pb-2 ${collapsed ? "flex justify-center" : ""}`}>
            <PlantIndicator compact={collapsed} />
          </div>
        )}

        {signedIn ? (
          <NavLinks collapsed={collapsed} groups={groups} location={location} />
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
          <FooterActions collapsed={collapsed} signedIn={signedIn} onLogout={handleLogout} />
        </div>
      </aside>
    </>
  );
}
