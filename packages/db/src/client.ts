import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export type Db = ReturnType<typeof createDb>;

/**
 * Creates a pooled connection + Drizzle instance. Application code (the
 * API) must connect using the `rmixerp_app` role (see schema/roles.ts) —
 * never the migration/owner role — so that row-level security in
 * tenancy.ts actually applies.
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
