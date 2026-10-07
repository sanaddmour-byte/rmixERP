import * as React from "react";
import { cn } from "./cn";

/** Replaces bare "Loading…" text (docs/ui-ux-audit.md §9) with a shape that previews the eventual layout, so the page doesn't visibly jump once data arrives. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-raised", className)} {...props} />;
}

/** A skeleton shaped like a table's loading rows — the common case (ResourceListPage and every bespoke list). */
export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-border">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="py-2 pe-4">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
