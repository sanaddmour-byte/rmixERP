import * as React from "react";
import { cn } from "@rmixerp/ui";

/**
 * A table row that opens a record on click — keyboard accessible (Tab to
 * focus, Enter/Space to activate), unlike a plain `<tr onClick>` which a
 * keyboard or screen-reader user can't reach at all.
 */
export function ClickableRow({
  onClick,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
        className,
      )}
    >
      {children}
    </tr>
  );
}
