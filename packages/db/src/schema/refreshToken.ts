import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, tenantIsolationPolicy } from "./columns";
import { company } from "./company";
import { appUser } from "./user";

/** One row per issued refresh token. Rotated on use; revoked on logout. */
export const refreshToken = pgTable(
  "refresh_token",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolationPolicy()],
).enableRLS();

export type RefreshToken = typeof refreshToken.$inferSelect;
export type NewRefreshToken = typeof refreshToken.$inferInsert;
