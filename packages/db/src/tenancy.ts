import { sql } from "drizzle-orm";
import type { Db } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * THE tenancy guard (CLAUDE.md Hard Rules: "enforced in one query guard in
 * the data layer, not in each route"). Opens a transaction, sets the
 * Postgres session variable that every RLS policy in schema/columns.ts
 * checks, and runs `fn` with the scoped transaction handle.
 *
 * Every read/write against a company-scoped table MUST go through a
 * transaction that has called this — there is no other way to see rows,
 * by construction: without `app.current_company_id` set, the RLS policies
 * default-deny (NULL = company_id is never true). A route that "forgets"
 * to scope a query does not leak data; it gets zero rows.
 *
 * `companyId` is validated as a UUID before being interpolated into
 * `set_config`, since `SET`/`set_config` targets cannot be bind-parameters
 * for the setting *name* but the value itself IS passed as a bound
 * parameter here — this guards against a malformed/attacker-controlled
 * value being used as anything other than an opaque string compared to a
 * column value.
 */
export async function withTenant<T>(
  db: Db,
  companyId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(companyId)) {
    throw new Error(`withTenant: companyId is not a valid UUID: "${companyId}"`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_company_id', ${companyId}, true)`);
    return fn(tx);
  });
}
