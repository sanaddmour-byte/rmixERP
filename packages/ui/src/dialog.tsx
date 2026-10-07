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
 * Focused confirmation/small-edit modal (brief's §41: "modal dialogs for
 * confirmation, small focused edits, dangerous actions" — never a
 * multi-field workflow; see Drawer for that). Real focus trap, Escape to
 * close, focus returned to the trigger on close, and a labelled dialog
 * role — none of which existed anywhere in this app before this pass
 * (docs/ui-ux-audit.md §2.1).
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
          "relative z-10 flex max-h-[85vh] w-full max-w-md flex-col gap-4 rounded-md border border-border bg-surface p-6 text-text shadow-lg",
          className,
        )}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-text-muted">
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
