import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPE_REQUIRED_PERMISSION, NOTIFICATION_TYPES, resolveNotificationRoute } from "../src/notificationRouting";

describe("resolveNotificationRoute", () => {
  it("resolves every notification type to a non-empty, absolute path on both platforms", () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const platform of ["web", "mobile"] as const) {
        const path = resolveNotificationRoute(platform, type, "11111111-1111-1111-1111-111111111111");
        expect(path.startsWith("/")).toBe(true);
        expect(path).toContain("11111111-1111-1111-1111-111111111111");
      }
    }
  });

  it("every type with a required permission uses a real module:action shape", () => {
    for (const type of NOTIFICATION_TYPES) {
      const permission = NOTIFICATION_TYPE_REQUIRED_PERMISSION[type];
      if (permission) expect(permission).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
    }
  });
});
