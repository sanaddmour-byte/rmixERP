import * as React from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  /** Name of the specific record being acted on, shown so the user can verify it's the right one. */
  itemLabel?: string | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions (void/cancel/reject/delete) render the confirm button in the `destructive` tone; non-destructive confirmations (e.g. "approve this?") can opt out. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirmation pattern every void/cancel/reject/delete action in
 * the app should use — before this pass, none of them asked at all
 * (docs/ui-ux-audit.md §3: "Repo-wide search for confirm()... returns
 * zero matches").
 */
export function ConfirmDialog({
  open,
  title,
  description,
  itemLabel,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "accent"} onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {itemLabel && <p className="text-sm font-medium text-text">{itemLabel}</p>}
    </Dialog>
  );
}
