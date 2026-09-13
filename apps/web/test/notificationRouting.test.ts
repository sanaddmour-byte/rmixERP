import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, resolveNotificationRoute } from "@rmixerp/core";

const appTsxPath = join(process.cwd(), "src/App.tsx");
const appTsxSource = readFileSync(appTsxPath, "utf-8");
const registeredPaths = [...appTsxSource.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

describe("notification deep links resolve to a route actually registered in App.tsx", () => {
  it.each(NOTIFICATION_TYPES)("%s", (type) => {
    const url = resolveNotificationRoute("web", type, "11111111-1111-1111-1111-111111111111");
    const pathOnly = url.split("?")[0];
    expect(registeredPaths).toContain(pathOnly);
  });
});
