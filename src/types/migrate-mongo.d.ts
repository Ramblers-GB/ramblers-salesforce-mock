declare module "migrate-mongo" {
  import type { Db, MongoClient, MongoClientOptions } from "mongodb";

  export interface MigrateMongoConfig {
    mongodb: {
      url: string;
      databaseName?: string;
      options?: MongoClientOptions;
    };
    migrationsDir: string;
    changelogCollectionName: string;
    migrationFileExtension?: string;
    useFileHash?: boolean;
    moduleSystem?: "commonjs" | "esm";
  }

  export const config: {
    set(config: MigrateMongoConfig): void;
    read(): Promise<MigrateMongoConfig>;
  };

  export const database: {
    connect(): Promise<{ db: Db; client: MongoClient }>;
  };

  export function up(db: Db, client?: MongoClient): Promise<string[]>;
  export function down(db: Db, client?: MongoClient): Promise<string[]>;
  export function status(
    db: Db,
  ): Promise<Array<{ fileName: string; appliedAt: string }>>;
}
