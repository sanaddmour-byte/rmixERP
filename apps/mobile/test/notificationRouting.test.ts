import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, resolveNotificationRoute } from "@rmixerp/core";

const appDir = join(process.cwd(), "app");

/** expo-router's file-based routing: `/purchase-requests/abc` must have a screen file at app/purchase-requests/[id].tsx. */
function screenFileFor(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const dirSegments = segments.slice(0, -1);
  return [appDir, ...dirSegments, "[id].tsx"].join("/");
}

describe("notification deep links resolve to a real expo-router screen file", () => {
  it.each(NOTIFICATION_TYPES)("%s", (type) => {
    const path = resolveNotificationRoute("mobile", type, "11111111-1111-1111-1111-111111111111");
    expect(existsSync(screenFileFor(path))).toBe(true);
  });
});
