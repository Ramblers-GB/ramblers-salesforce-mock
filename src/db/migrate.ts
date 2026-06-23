import path from "node:path";
import { config as migrateConfig, database, up } from "migrate-mongo";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

export async function runMigrations(): Promise<void> {
  const appConfig = loadConfig();
  migrateConfig.set({
    mongodb: {
      url: appConfig.ATLAS_URI,
      databaseName: appConfig.ATLAS_DB_NAME,
      options: { serverSelectionTimeoutMS: 10_000 },
    },
    migrationsDir: path.resolve(process.cwd(), "migrations"),
    changelogCollectionName: "schema_migrations",
    migrationFileExtension: ".js",
    useFileHash: false,
    moduleSystem: "esm",
  });

  const { db, client } = await database.connect();
  try {
    const applied = await up(db, client);
    if (applied.length > 0) {
      logger.info({ applied }, "applied database migrations");
    } else {
      logger.info("database migrations already up to date");
    }
  } finally {
    await client.close();
  }
}
