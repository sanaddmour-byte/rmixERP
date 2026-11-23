import * as React from "react";

/**
 * A `<tr>` that opens a record on click, Enter, or Space — a plain
 * `onClick` on a `<tr>` is invisible to keyboard and screen-reader users,
 * who get no indication the row does anything or any way to activate it.
 */
export function ClickableRow({
  onActivate,
  "aria-label": ariaLabel,
  className,
  children,
}: {
  onActivate: () => void;
  "aria-label": string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={className}
    >
      {children}
    </tr>
  );
}
