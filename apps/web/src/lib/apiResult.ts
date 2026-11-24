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

/**
 * `error.message` is always the generic wrapper text ("Invalid request
 * body") — the actionable part, when there is one, is in `error.details`:
 * either a plain string (`apps/api/src/lib/errors.ts`'s `validationError`
 * called with an `InputParseError`'s message) or a Zod `.flatten()` shape
 * (`{formErrors, fieldErrors}`, the more common path). Prefer whichever of
 * those is present over the generic wrapper.
 */
function extractDetailMessage(details: unknown): string | null {
  if (typeof details === "string" && details.length > 0) return details;
  if (!details || typeof details !== "object") return null;

  const parts: string[] = [];
  if ("formErrors" in details && Array.isArray(details.formErrors)) {
    parts.push(...details.formErrors.filter((m): m is string => typeof m === "string"));
  }
  if ("fieldErrors" in details && details.fieldErrors && typeof details.fieldErrors === "object") {
    for (const [field, messages] of Object.entries(details.fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(messages)) {
        for (const m of messages) {
          if (typeof m === "string") parts.push(`${field}: ${m}`);
        }
      }
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

/** Returns error info if `result` is a resolved API response carrying a non-2xx status, else null. */
export function getApiError(result: unknown): ApiErrorInfo | null {
  if (!result || typeof result !== "object" || !("status" in result)) return null;
  const status = (result as { status: unknown }).status;
  if (typeof status !== "number" || status < 400) return null;

  const data = (result as { data?: unknown }).data;
  const errorObj = data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object" ? data.error : null;
  const detailMessage = errorObj && "details" in errorObj ? extractDetailMessage((errorObj as { details: unknown }).details) : null;
  const message =
    detailMessage ?? (errorObj && "message" in errorObj ? String((errorObj as { message: unknown }).message) : `Request failed (${status}).`);
  return { status, message };
}

/** Used by a form's awaited submit handler so a validation/permission/conflict error rejects the same way a thrown network error would, instead of being silently treated as success. */
export function throwIfApiError(result: unknown): void {
  const err = getApiError(result);
  if (err) throw new Error(err.message);
}
