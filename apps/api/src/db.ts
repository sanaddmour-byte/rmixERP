import { createDb } from "@rmixerp/db";
import { config } from "./config";

/** The API's only DB connection: `rmixerp_app` credentials, so RLS applies. */
export const db = createDb(config.databaseUrl);
