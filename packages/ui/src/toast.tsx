import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export type ToastTone = "success" | "danger" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string | undefined;
}

type Listener = (toasts: Toast[]) => void;

/**
 * Module-level store, not a React context — deliberately callable from
 * outside the component tree (main.tsx's QueryClient MutationCache
 * handler, which is constructed before any Provider renders) so that
 * EVERY failed mutation in the app can surface a toast with zero
 * per-call-site wiring. This is the fix for docs/ui-ux-audit.md §4/§5:
 * "A user who clicks Create/Approve/Reject/Cancel and the request fails
 * currently sees nothing happen."
 */
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function pushToast(tone: ToastTone, title: string, description?: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toasts = [...toasts, { id, tone, title, description }];
  emit();
  const timeout = tone === "danger" ? 8000 : 4000;
  setTimeout(() => dismissToast(id), timeout);
  return id;
}

export const toast = {
  success: (title: string, description?: string) => pushToast("success", title, description),
  danger: (title: string, description?: string) => pushToast("danger", title, description),
  info: (title: string, description?: string) => pushToast("info", title, description),
  dismiss: dismissToast,
};

export function useToasts(): Toast[] {
  const [state, setState] = React.useState<Toast[]>(toasts);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-success bg-success-surface text-success-text",
  danger: "border-danger bg-danger-surface text-danger-text",
  info: "border-info bg-info-surface text-info-text",
};

/** Mount once near the root (App.tsx). Renders into a portal so it's never clipped by a panel's own overflow. */
export function Toaster() {
  const items = useToasts();
  if (items.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-4 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "danger" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg sm:w-96",
            TONE_CLASSES[t.tone],
          )}
        >
          <div className="flex-1">
            <p className="font-medium">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs opacity-90">{t.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
