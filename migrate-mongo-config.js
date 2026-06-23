const databaseName = process.env.ATLAS_DB_NAME || "ramblers-salesforce-mock";

export default {
  mongodb: {
    url: process.env.ATLAS_URI,
    databaseName,
    options: {
      serverSelectionTimeoutMS: 10_000,
    },
  },
  migrationsDir: "migrations",
  changelogCollectionName: "schema_migrations",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "esm",
};
