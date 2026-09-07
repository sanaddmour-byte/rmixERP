import { configureApiClient } from "@rmixerp/contract";

const ACCESS_TOKEN_KEY = "rmixerp-access-token";
const REFRESH_TOKEN_KEY = "rmixerp-refresh-token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // localStorage unavailable — the session just won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

configureApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
  getAccessToken,
  onUnauthorized: clearSession,
});
