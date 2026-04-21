/**
 * OpenAPI 3.0 document derived from schema/salesforce-api.schema.json.
 * The schema file is the source of truth (drift-checked against #209);
 * this module builds the Paths / Security / Servers envelope around it.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";

// esbuild bundles all source into a single dist/server.js so relative paths
// from `__dirname` don't match between dev (src/api/) and prod (dist/).
// Resolve from process.cwd() instead — the server is launched with the
// project root as cwd in both environments.
const schemaPath = path.resolve(process.cwd(), "schema", "salesforce-api.schema.json");

interface SchemaFile {
  title?: string;
  description?: string;
  $defs: Record<string, unknown>;
}

let cached: Record<string, unknown> | undefined;

export async function getOpenApiDocument(): Promise<Record<string, unknown>> {
  if (cached) return cached;
  const raw = await readFile(schemaPath, "utf-8");
  const parsed = JSON.parse(raw) as SchemaFile;

  // OpenAPI 3.0 wants $ref: "#/components/schemas/Xxx"; the source schema uses
  // "#/$defs/Xxx". Rewrite here.
  const rewriteRefs = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewriteRefs);
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "$ref" && typeof v === "string" && v.startsWith("#/$defs/")) {
          out[k] = v.replace("#/$defs/", "#/components/schemas/");
        } else {
          out[k] = rewriteRefs(v);
        }
      }
      return out;
    }
    return value;
  };

  const schemas: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(parsed.$defs)) {
    schemas[name] = rewriteRefs(def);
  }

  const config = loadConfig();
  const document: Record<string, unknown> = {
    openapi: "3.0.3",
    info: {
      title: parsed.title ?? "Ramblers Salesforce API (mock)",
      description:
        parsed.description ??
        "Reference mock server for nbarrett/ngx-ramblers#209. Contract is kept in sync with the issue body via CI drift check.",
      version: "0.1.0",
      contact: {
        name: "NGX Ramblers",
        url: "https://github.com/nbarrett/ramblers-salesforce-mock",
      },
    },
    servers: [{ url: config.PUBLIC_BASE_URL, description: "Deployment" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
      },
      schemas,
    },
    paths: {
      "/api/groups/{groupCode}/members": {
        get: {
          summary: "List members for a group or area",
          description:
            "Returns the complete member list for a group (4-char code) or area (2-char code). Supports incremental sync via `since`.",
          parameters: [
            {
              name: "groupCode",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "4-character group code or 2-character area code.",
            },
            {
              name: "since",
              in: "query",
              required: false,
              schema: { type: "string", format: "date-time" },
              description: "ISO 8601 date for incremental sync.",
            },
            {
              name: "includeExpired",
              in: "query",
              required: false,
              schema: { type: "boolean" },
              description: "Include recently lapsed members for renewal warnings.",
            },
          ],
          responses: {
            "200": {
              description: "Member list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MemberListResponse" },
                },
              },
            },
            "401": errorResponse("Unauthorised"),
            "404": errorResponse("Group not found"),
          },
        },
      },
      "/api/members/{membershipNumber}/consent": {
        post: {
          summary: "Consent writeback",
          description:
            "Record a consent change against a member. Fires only on transitions to fully opted-out of group-level communications, per the #209 trigger rule.",
          parameters: [
            {
              name: "membershipNumber",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConsentUpdateRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Consent update applied",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ConsentUpdateResponse" },
                },
              },
            },
            "400": errorResponse("Bad request"),
            "401": errorResponse("Unauthorised"),
            "404": errorResponse("Member not found"),
          },
        },
      },
    },
  };

  cached = document;
  return document;
}

function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiErrorResponse" },
      },
    },
  };
}
