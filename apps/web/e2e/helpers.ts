import type { APIRequestContext, Page } from "@playwright/test";

export const API_BASE = process.env.E2E_API_URL ?? "http://localhost:3000/api";
export const ADMIN_EMAIL = "admin@rmixerp.local";
export const ADMIN_PASSWORD = "ChangeMe123!";

export async function loginForToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const body = await res.json();
  return body.accessToken as string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
}

export async function apiGet<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const res = await request.get(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()) as T;
}

export async function apiPost<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown,
): Promise<{ status: number; body: T }> {
  const res = await request.post(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return { status: res.status(), body: (await res.json()) as T };
}

export async function loginUi(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");
}
