import pino from "pino";
import { loadConfig } from "./config.js";

const config = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: "ramblers-salesforce-mock" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
