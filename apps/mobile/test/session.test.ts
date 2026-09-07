import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiBaseUrl: "http://test.local/api" } } },
}));

const { clearSession, getAccessToken, getRefreshToken, loadSessionFromStorage, setSession } = await import(
  "../src/lib/session.js"
);

describe("mobile session storage (SecureStore-backed)", () => {
  beforeEach(() => {
    store.clear();
  });

  it("caches null when nothing is stored yet", async () => {
    await loadSessionFromStorage();
    expect(getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it("round-trips a session and keeps the in-memory access token in sync", async () => {
    await setSession("access-123", "refresh-456");
    expect(getAccessToken()).toBe("access-123");
    expect(await getRefreshToken()).toBe("refresh-456");
  });

  it("clears both tokens", async () => {
    await setSession("access-123", "refresh-456");
    await clearSession();
    expect(getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it("rehydrates the in-memory access token from storage on load", async () => {
    await setSession("access-123", "refresh-456");
    // Simulate a fresh app start: nothing cached in memory until loaded.
    await loadSessionFromStorage();
    expect(getAccessToken()).toBe("access-123");
  });
});
