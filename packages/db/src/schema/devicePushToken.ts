import { pgEnum, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { appUser } from "./user";

export const devicePushPlatform = pgEnum("device_push_platform", ["ios", "android"]);

/**
 * One row per device a user has signed in on mobile with push permission
 * granted (Phase 10d) — registered by `POST /device-push-tokens` on login,
 * re-registered/refreshed (upsert on the unique `token`, not appended) on
 * every subsequent login since Expo can rotate a device's token. No
 * unregister-on-logout route: an Expo push token is an opaque per-install
 * identifier, not personally identifying on its own, and every send is
 * still gated by the target user's current permissions at send time
 * (`apps/api/src/lib/pushNotifications.ts`), so a stale row after logout
 * costs nothing beyond one wasted Expo API call.
 */
export const devicePushToken = pgTable(
  "device_push_token",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    token: varchar("token", { length: 255 }).notNull(),
    platform: devicePushPlatform("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("device_push_token_token_unique").on(t.token), tenantIsolationPolicy()],
).enableRLS();

export type DevicePushToken = typeof devicePushToken.$inferSelect;
export type NewDevicePushToken = typeof devicePushToken.$inferInsert;
