import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RunMigrationsOptions {
  /** Owner/table-creating role's connection string. Never `rmixerp_app`. */
  connectionString: string;
  /** Password to (idempotently) set on the `rmixerp_app` role. */
  appRolePassword: string;
}

/**
 * Runs pending migrations, safe to call repeatedly against a database
 * holding live data (drizzle-orm tracks applied migrations in
 * `__drizzle_migrations`; every migration file is additive/idempotent per
 * CLAUDE.md's Hard Rules). Also idempotently ensures the restricted
 * `rmixerp_app` role (the one RLS policies apply to — see
 * schema/roles.ts) exists, has a current password, and can read/write
 * every table.
 *
 * Called both by the `migrate` CLI script and by the API on boot (per the
 * Phase 0 Definition of Done: "idempotent migrations run on boot").
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<void> {
  const pool = new Pool({ connectionString: options.connectionString });
  try {
    const db = drizzle(pool);

    await migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });

    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rmixerp_app') THEN
          CREATE ROLE rmixerp_app LOGIN;
        END IF;
      END
      $$;
    `);
    await db.execute(
      sql.raw(
        `ALTER ROLE rmixerp_app WITH PASSWORD '${options.appRolePassword.replaceAll("'", "''")}'`,
      ),
    );
    await db.execute(sql`
      DO $$
      BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO rmixerp_app', current_database());
      END
      $$;
    `);
    await db.execute(sql`GRANT USAGE ON SCHEMA public TO rmixerp_app`);
    await db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rmixerp_app`);
    await db.execute(
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rmixerp_app`,
    );
  } finally {
    await pool.end();
  }
}
