import { runMigrations } from "@rmixerp/db";
import { config } from "./config";
import { logger } from "./logger";
import { createApp } from "./app";
import { startClearanceRetryCron } from "./clearance/cron";

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

  startClearanceRetryCron();
}

main().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during startup");
  process.exitCode = 1;
});
