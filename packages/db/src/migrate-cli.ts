import { runMigrations } from "./migrate";

async function main() {
  const connectionString = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const appRolePassword = process.env.APP_DB_ROLE_PASSWORD;
  if (!connectionString) {
    throw new Error("MIGRATE_DATABASE_URL (or DATABASE_URL) is required to run migrations");
  }
  if (!appRolePassword) {
    throw new Error("APP_DB_ROLE_PASSWORD is required to run migrations");
  }
  await runMigrations({ connectionString, appRolePassword });
  console.log("Migrations applied; rmixerp_app role ensured and granted.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
