import { toast } from "@rmixerp/ui";
import { getApiError } from "./apiResult";

/**
 * Wired into main.tsx's QueryClient as MutationCache's `onSuccess`, so
 * every mutation in the app surfaces a toast on failure with zero
 * per-call-site changes — the fix for docs/ui-ux-audit.md §4's "a user
 * who clicks Create/Approve/Reject/Cancel and the request fails
 * currently sees nothing happen." (ResourceListPage's own create/edit
 * flow additionally keeps the form open with the error inline — see
 * apiResult.ts's throwIfApiError — so this toast is this path's backstop,
 * not its only feedback.)
 */
export function reportIfMutationFailed(result: unknown): void {
  const err = getApiError(result);
  if (!err) return;
  // 401 already triggers a redirect-to-login via configureApiClient's
  // onUnauthorized (apps/web/src/lib/session.ts) — a toast on top of that
  // would just be confusing noise during the logout/redirect.
  if (err.status === 401) return;
  toast.danger("Action failed", err.message);
}
