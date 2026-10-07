import * as React from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useFocusTrap } from "@rmixerp/ui";
import { useVisibleNavGroups } from "../lib/useVisibleNavGroups";
import { useLanguage } from "../i18n/LanguageContext";
import { Icon, type IconName } from "./icons";

interface Entry {
  href: string;
  label: string;
  group: string;
  icon: IconName;
}

/**
 * Keyboard-first navigation (brief's §7) — Ctrl/Cmd+K opens a fuzzy-
 * filterable list of every module the signed-in user can actually see
 * (reuses useVisibleNavGroups, so it never offers a destination the
 * sidebar itself would hide). Entity search ("Invoice INV-10224") is out
 * of scope for this pass — it needs a backend global-search endpoint that
 * doesn't exist yet (see docs/ui-ux-audit.md §12) — so v1 covers
 * navigation only, still the highest-value 80% for an experienced user.
 */
export function CommandPalette() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const groups = useVisibleNavGroups();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const entries = React.useMemo<Entry[]>(() => {
    const items: Entry[] = [{ href: "/", label: t.nav.home, group: "", icon: "home" }];
    for (const group of groups) {
      for (const item of group.items) {
        items.push({ href: item.href, label: t.nav[item.labelKey], group: t.navGroups[group.labelKey], icon: item.icon as IconName });
      }
    }
    return items;
  }, [groups, t]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.label.toLowerCase().includes(q) || e.group.toLowerCase().includes(q));
  }, [entries, query]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  React.useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useFocusTrap(open, panelRef, close);

  function go(entry: Entry) {
    navigate(entry.href);
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[activeIndex];
      if (entry) go(entry);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]">
      <div className="absolute inset-0 bg-navy-950/50" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.commandPalette.title}
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface text-text shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Icon name="search" className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.commandPalette.placeholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-text-subtle"
            aria-label={t.commandPalette.placeholder}
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-text-subtle">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">{t.commandPalette.noResults}</li>}
          {filtered.map((entry, i) => (
            <li key={entry.href} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => go(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm ${
                  i === activeIndex ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" : "text-text hover:bg-surface-raised"
                }`}
              >
                <Icon name={entry.icon} className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.group && <span className="shrink-0 text-xs text-text-subtle">{entry.group}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
