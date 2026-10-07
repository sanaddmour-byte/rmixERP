import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useFocusTrap } from "./useFocusTrap";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Side panel for "quick detail / contextual editing" that should keep the
 * page it was opened from in view (brief's §41) — e.g. a dispatch board's
 * pour detail, opened without losing the board underneath it. Opens from
 * the reading-end edge (`inset-inline-end`, a logical property) so it
 * opens from the correct physical side in both LTR and RTL automatically.
 */
export function Drawer({ open, onClose, title, children, footer, className }: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-navy-950/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ insetInlineEnd: 0 }}
        className={cn(
          "absolute inset-y-0 z-10 flex h-full w-full max-w-lg flex-col border-s border-border bg-surface text-text shadow-lg",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
