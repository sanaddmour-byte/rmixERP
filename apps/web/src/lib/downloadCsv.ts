import { toast } from "@rmixerp/ui";
import { getAccessToken } from "./session";

/**
 * Downloads a CSV export via an authenticated fetch instead of a plain
 * `<a href download>` — a bare anchor tag can't carry the app's Bearer
 * token (this app keeps it in localStorage, not a cookie, per
 * `http-client.ts`), so every CSV "download" link in the app was
 * silently hitting the API unauthenticated and failing.
 */
export async function downloadAuthenticatedCsv(url: string, filename: string): Promise<void> {
  const token = getAccessToken();
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.danger("Export failed", `The server returned an error (${res.status}).`);
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.danger("Export failed", "Could not reach the server — check your connection and try again.");
  }
}
