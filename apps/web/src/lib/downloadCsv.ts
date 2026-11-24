import { apiFetch } from "@rmixerp/contract";

/**
 * Every CSV export used a plain `<a href={csvUrl} download>` — the
 * browser navigates there directly, with no Authorization header
 * (anchors can't attach custom headers), so `requireAuth` 401s and the
 * "download" is a tiny JSON error body instead of the report (the
 * review's "CSV export through the authenticated client" finding).
 * Routes the request through the same `apiFetch` every generated hook
 * uses instead, so the Bearer token is attached, then builds the file
 * client-side from the response body.
 */
export async function downloadCsv(url: string, fallbackFilename: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Callers write the URL as "/api/..." (this codebase's convention for
  // every hand-written API path), but `apiFetch` itself prepends the
  // configured API base URL (also "/api" — see src/lib/session.ts) — strip
  // it here rather than at each of the ~10 call sites, or every one would
  // silently 404 against "/api/api/...".
  const relativeUrl = url.startsWith("/api/") ? url.slice(4) : url;
  const result = await apiFetch<{ data: string; status: number; headers: Headers }>(relativeUrl);
  if (result.status !== 200) {
    const message =
      typeof result.data === "string" && result.data.length > 0
        ? result.data
        : `Export failed (HTTP ${result.status}).`;
    return { ok: false, error: message };
  }

  const disposition = result.headers.get("content-disposition") ?? "";
  const filenameMatch = /filename="([^"]+)"/.exec(disposition);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const blob = new Blob([result.data], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return { ok: true };
}
