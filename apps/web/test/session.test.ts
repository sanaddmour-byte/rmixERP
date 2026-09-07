import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, getAccessToken, getRefreshToken, setSession } from "../src/lib/session";

describe("session storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("round-trips a session", () => {
    setSession("access-123", "refresh-456");
    expect(getAccessToken()).toBe("access-123");
    expect(getRefreshToken()).toBe("refresh-456");
  });

  it("clears both tokens", () => {
    setSession("access-123", "refresh-456");
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
