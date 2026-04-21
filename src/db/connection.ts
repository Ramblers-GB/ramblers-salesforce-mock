import mongoose from "mongoose";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

export type MongoState = "disconnected" | "connecting" | "connected" | "error";

let state: MongoState = "disconnected";

export function mongoConnectionState(): MongoState {
  if (mongoose.connection.readyState === 1) return "connected";
  if (mongoose.connection.readyState === 2) return "connecting";
  return state;
}

export async function connectMongo(): Promise<void> {
  if (state === "connected" || state === "connecting") return;
  const config = loadConfig();
  state = "connecting";
  try {
    await mongoose.connect(config.ATLAS_URI, {
      dbName: config.ATLAS_DB_NAME,
      serverSelectionTimeoutMS: 10_000,
    });
    state = "connected";
    logger.info({ db: config.ATLAS_DB_NAME }, "connected to atlas");
  } catch (err: unknown) {
    state = "error";
    logger.error({ err }, "failed to connect to atlas");
    throw err;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (state === "disconnected") return;
  await mongoose.disconnect();
  state = "disconnected";
}
