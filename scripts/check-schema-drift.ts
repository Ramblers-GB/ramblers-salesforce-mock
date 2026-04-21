/**
 * Schema drift check.
 *
 * Fetches the body of nbarrett/ngx-ramblers#209, extracts each of the five
 * JSON Schema blocks (SalesforceMember, MemberListResponse,
 * ConsentUpdateRequest, ConsentUpdateResponse, ApiErrorResponse) from their
 * "#### {Name}\n\n```json\n...\n```" sections, normalises `$ref` forms, and
 * diffs each against the corresponding `$defs[{Name}]` entry in
 * `schema/salesforce-api.schema.json`.
 *
 * Exits non-zero on any drift. CI gates deploy on this.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

const ISSUE_REPO = "nbarrett/ngx-ramblers";
const ISSUE_NUMBER = 209;
const DEF_NAMES = [
  "SalesforceMember",
  "MemberListResponse",
  "ConsentUpdateRequest",
  "ConsentUpdateResponse",
  "ApiErrorResponse",
] as const;

type DefName = (typeof DEF_NAMES)[number];

interface GithubIssue {
  body: string;
}

async function fetchIssueBody(): Promise<string> {
  const url = `https://api.github.com/repos/${ISSUE_REPO}/issues/${ISSUE_NUMBER}`;
  const token = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ramblers-salesforce-mock-drift-check",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as GithubIssue;
  return body.body;
}

function extractSchemaBlock(markdown: string, defName: DefName): JsonValue {
  const headingPattern = new RegExp(
    `####\\s+${defName}\\s*\\n[\\s\\S]*?\\n\`\`\`json\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    "m",
  );
  const match = headingPattern.exec(markdown);
  if (!match || !match[1]) {
    throw new Error(`Could not locate #### ${defName} JSON block in issue body`);
  }
  try {
    return JSON.parse(match[1]) as JsonValue;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse #### ${defName} JSON block: ${message}`);
  }
}

/** Rewrite `$ref: "#Name"` → `$ref: "#/$defs/Name"` recursively. */
function normaliseRefs(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(normaliseRefs);
  if (value !== null && typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "$ref" && typeof v === "string" && v.startsWith("#") && !v.startsWith("#/")) {
        out[k] = `#/$defs/${v.slice(1)}`;
      } else {
        out[k] = normaliseRefs(v);
      }
    }
    return out;
  }
  return value;
}

function loadLocalSchema(): { $defs: Record<DefName, JsonValue> } {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const schemaPath = resolve(__dirname, "..", "schema", "salesforce-api.schema.json");
  const raw = readFileSync(schemaPath, "utf-8");
  const parsed = JSON.parse(raw) as { $defs?: Record<string, JsonValue> };
  if (!parsed.$defs) {
    throw new Error(`Local schema at ${schemaPath} has no $defs`);
  }
  return { $defs: parsed.$defs as Record<DefName, JsonValue> };
}

function canonicalise(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const sortedKeys = Object.keys(value).sort();
  const parts = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalise(value[k]!)}`);
  return `{${parts.join(",")}}`;
}

interface DriftReport {
  defName: DefName;
  drifted: boolean;
  expected?: string;
  actual?: string;
}

function compare(defName: DefName, expected: JsonValue, actual: JsonValue): DriftReport {
  const a = canonicalise(expected);
  const b = canonicalise(actual);
  if (a === b) return { defName, drifted: false };
  return { defName, drifted: true, expected: a, actual: b };
}

async function main(): Promise<void> {
  const issueBody = await fetchIssueBody();
  const local = loadLocalSchema();

  const reports: DriftReport[] = [];
  for (const defName of DEF_NAMES) {
    const issueBlock = normaliseRefs(extractSchemaBlock(issueBody, defName));
    const localBlock = local.$defs[defName];
    if (!localBlock) {
      reports.push({
        defName,
        drifted: true,
        expected: canonicalise(issueBlock),
        actual: "<missing from local schema>",
      });
      continue;
    }
    reports.push(compare(defName, issueBlock, localBlock));
  }

  const drifted = reports.filter((r) => r.drifted);
  if (drifted.length === 0) {
    console.log(`Schema drift check: OK (${DEF_NAMES.length} defs in sync with #${ISSUE_NUMBER})`);
    return;
  }

  console.error(`Schema drift detected in ${drifted.length} def(s):`);
  for (const r of drifted) {
    console.error(`\n---- ${r.defName} ----`);
    console.error(`issue:  ${r.expected}`);
    console.error(`local:  ${r.actual}`);
  }
  console.error(
    `\nThe #209 issue body has diverged from schema/salesforce-api.schema.json.`,
  );
  console.error(
    `Either update the local schema file to match, or (if the issue change was accidental) fix the issue body.`,
  );
  process.exit(1);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Drift check failed: ${message}`);
  process.exit(2);
});
