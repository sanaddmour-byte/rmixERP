/**
 * The one fetch implementation every generated hook calls through
 * (`orval.config.ts`'s `override.mutator`). Web and mobile each call
 * `configureApiClient` once at startup with their base URL and a way to
 * read the current access token; neither ever calls `fetch` directly.
 *
 * Matches orval's `httpClient: 'fetch'` contract: for every operation
 * with more than one documented response, the generated return type is a
 * discriminated union keyed on `status` (e.g. `{status: 200; data: X} |
 * {status: 401; data: ErrorResponse}`), so this does NOT throw for
 * documented non-2xx responses — callers narrow on `result.status`. It
 * throws only for genuine transport failures (network error, a body that
 * isn't valid JSON when JSON was expected).
 */
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  onUnauthorized?: () => void;
}

let config: ApiClientConfig = { baseUrl: "" };

export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

export interface ApiFetchResult<TData> {
  data: TData;
  status: number;
  headers: Headers;
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = config.getAccessToken?.();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${config.baseUrl}${url}`, { ...options, headers });

  if (response.status === 401) {
    config.onUnauthorized?.();
  }

  const rawBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const data: unknown =
    rawBody.length > 0 && contentType.includes("application/json") ? JSON.parse(rawBody) : rawBody;

  return { data, status: response.status, headers: response.headers } as T;
}
