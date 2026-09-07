import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { configureApiClient } from "@rmixerp/contract";

const ACCESS_TOKEN_KEY = "rmixerp-access-token";
const REFRESH_TOKEN_KEY = "rmixerp-refresh-token";

/**
 * `configureApiClient`'s `getAccessToken` must be synchronous, but
 * expo-secure-store is async — so we keep an in-memory mirror, hydrated
 * once at startup by `loadSessionFromStorage` (called from app/_layout.tsx
 * before anything renders) and kept in sync by `setSession`/`clearSession`.
 */
let cachedAccessToken: string | null = null;

export async function loadSessionFromStorage(): Promise<void> {
  cachedAccessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setSession(accessToken: string, refreshToken: string): Promise<void> {
  cachedAccessToken = accessToken;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function clearSession(): Promise<void> {
  cachedAccessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl ?? "http://localhost:3000/api";
}

configureApiClient({
  baseUrl: resolveApiBaseUrl(),
  getAccessToken,
  onUnauthorized: () => {
    void clearSession();
  },
});
