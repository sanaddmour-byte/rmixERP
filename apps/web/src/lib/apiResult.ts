/**
 * The generated client resolves successfully even for a documented
 * non-2xx response (packages/contract/generated/client.ts's own
 * doc comment: it does not throw for a documented non-2xx) — so "did this
 * actually work" has to be read from `.status`, not a try/catch or
 * React Query's `isError`.
 */
export interface ApiErrorInfo {
  status: number;
  message: string;
}

/** Returns error info if `result` is a resolved API response carrying a non-2xx status, else null. */
export function getApiError(result: unknown): ApiErrorInfo | null {
  if (!result || typeof result !== "object" || !("status" in result)) return null;
  const status = (result as { status: unknown }).status;
  if (typeof status !== "number" || status < 400) return null;

  const data = (result as { data?: unknown }).data;
  const message =
    data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object" && "message" in data.error
      ? String((data.error as { message: unknown }).message)
      : `Request failed (${status}).`;
  return { status, message };
}

/** Used by a form's awaited submit handler so a validation/permission/conflict error rejects the same way a thrown network error would, instead of being silently treated as success. */
export function throwIfApiError(result: unknown): void {
  const err = getApiError(result);
  if (err) throw new Error(err.message);
}
