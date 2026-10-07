import * as React from "react";

/**
 * Wraps an alphanumeric code (invoice/document number, id) so it keeps
 * reading left-to-right and never gets visually reordered when it sits
 * inside Arabic RTL text — docs/ui-ux-audit.md §7.4. Native `<bdi>` is the
 * standard HTML primitive for exactly this; no custom logic needed.
 */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
