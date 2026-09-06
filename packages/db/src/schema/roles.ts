import { pgRole } from "drizzle-orm/pg-core";

/**
 * The role the running API connects as. It is created and granted table
 * privileges out-of-band (docker init script / ops runbook), never by a
 * migration — migrations run as the table-owning role. `.existing()` tells
 * drizzle-kit to reference it in policies without emitting CREATE ROLE.
 *
 * This role intentionally has NO BYPASSRLS and does not own any table, so
 * every row-level security policy below actually applies to it. Migrations
 * and seeding run as the owning role instead, which is expected to bypass
 * RLS (see docs in tenancy.ts).
 */
export const appRole = pgRole("rmixerp_app", { inherit: true }).existing();
