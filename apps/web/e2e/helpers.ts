import type { Page, APIRequestContext } from "@playwright/test";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@rmixerp.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

/** Signs in through the real UI (not an API shortcut) — every spec's first real browser interaction. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Fast API-only setup for fixtures a spec needs to exist but isn't itself
 * testing (a branch, a priced product, a customer) — the spec's own
 * assertions still only ever come from driving the real browser UI.
 */
export async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const body = await res.json();
  return body.accessToken as string;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
