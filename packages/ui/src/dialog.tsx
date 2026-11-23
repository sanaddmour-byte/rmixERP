import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useFocusTrap } from "./useFocusTrap";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * A focused confirmation/small-edit modal — a labelled dialog role, a real
 * focus trap, Escape to close, and focus returned to the trigger on
 * close. Use for a short, single-purpose form (e.g. "New Delivery"); for
 * a record's full detail/edit view, use Drawer instead.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full max-w-md flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 text-navy-900 shadow-lg dark:border-navy-800 dark:bg-navy-900 dark:text-navy-100",
          className,
        )}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-navy-500 dark:text-navy-400">
              {description}
            </p>
          )}
        </div>
        {children && <div className="min-h-0 overflow-y-auto">{children}</div>}
        {footer && <div className="flex justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
