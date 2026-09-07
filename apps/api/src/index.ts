import { runMigrations } from "@rmixerp/db";
import { config } from "./config";
import { logger } from "./logger";
import { createApp } from "./app";

async function main() {
  if (config.runMigrationsOnBoot) {
    logger.info("Running migrations...");
    await runMigrations({
      connectionString: config.migrateDatabaseUrl,
      appRolePassword: config.appDbRolePassword,
    });
    logger.info("Migrations applied.");
  }

  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port}`);
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during startup");
  process.exitCode = 1;
});
