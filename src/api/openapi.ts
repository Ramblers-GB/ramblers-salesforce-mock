import { buildOpenApiDocument } from "@ramblers/sf-contract";
import { loadConfig } from "../config.js";

let cached: Record<string, unknown> | undefined;

export function getOpenApiDocument(): Record<string, unknown> {
  if (cached) return cached;
  const config = loadConfig();
  cached = buildOpenApiDocument({ publicBaseUrl: config.PUBLIC_BASE_URL });
  return cached;
}
