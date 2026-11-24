import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useFocusTrap } from "./useFocusTrap";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * A record's detail/edit view, sliding in from the inline-end edge (the
 * logical property keeps this correct under RTL rather than hardcoding
 * "right"). Full width below the `sm` breakpoint per the brief's "use a
 * full-width panel on narrow screens" — a fixed max-width drawer on a
 * 390px viewport leaves a sliver of the record visible and the rest
 * cropped. Use for a record's own view; for a short standalone form, use
 * Dialog instead.
 */
export function Drawer({ open, onClose, title, children, className }: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-950/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex h-full w-full flex-col gap-4 overflow-y-auto border-s border-gray-200 bg-white p-5 text-navy-900 shadow-lg sm:w-auto sm:min-w-[28rem] sm:max-w-xl dark:border-navy-800 dark:bg-navy-900 dark:text-navy-100",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-navy-400 hover:bg-gray-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 dark:hover:bg-navy-800 dark:hover:text-navy-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
