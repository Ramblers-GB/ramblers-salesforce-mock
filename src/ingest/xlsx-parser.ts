import ExcelJS from "exceljs";
import type { CellValue } from "exceljs";
import { findColumn, INSIGHT_HUB_COLUMNS } from "@ramblers/sf-contract";
import type { ColumnDef } from "@ramblers/sf-contract";
import { parseCell } from "./parse.js";
import type { RawCell } from "./parse.js";
import type { MemberAttrs } from "../db/models/index.js";

export interface ParsedMember extends Omit<MemberAttrs, "tenantCode" | "ingestedAt" | "updatedAt"> {
  /** For tombstone builds — not written on ingest; included only for type completeness. */
}

export interface ParseResult {
  rowCount: number;
  members: ParsedMember[];
  unmatchedHeaders: string[];
  missingHeaders: string[];
  warnings: string[];
}

/**
 * Parse an Insight Hub ExportAll xlsx buffer into typed member records.
 *
 * - The first worksheet is used.
 * - The first row is the header. Header cells are matched tolerantly
 *   (case-insensitive, whitespace-collapsed) against the 36-column table.
 * - Unknown headers are reported in `unmatchedHeaders` (not a hard error).
 * - Missing headers are reported in `missingHeaders` (also not a hard
 *   error — the resulting member records simply lack those fields).
 * - Rows without a Mem No. are skipped and counted in `warnings`.
 * - `salesforceId` is synthesised as `003MOCK_<membershipNumber>` because
 *   Insight Hub has no such identifier.
 */
export async function parseExportAll(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's Buffer type is stricter than Node's Buffer<ArrayBufferLike>;
  // widen to Uint8Array, which it also accepts, to placate strict TS.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rowCount: 0, members: [], unmatchedHeaders: [], missingHeaders: [], warnings: ["workbook has no worksheets"] };
  }

  const headerRow = sheet.getRow(1);
  const columnMap = new Map<number, ColumnDef>();
  const unmatchedHeaders: string[] = [];
  const seenApiKeys = new Set<string>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = typeof cell.value === "string" ? cell.value : String(cell.value ?? "");
    const col = findColumn(text);
    if (col) {
      columnMap.set(colNumber, col);
      seenApiKeys.add(col.apiKey);
    } else if (text.trim().length > 0) {
      unmatchedHeaders.push(text);
    }
  });

  const missingHeaders = INSIGHT_HUB_COLUMNS.filter((c) => !seenApiKeys.has(c.apiKey)).map(
    (c) => c.header,
  );

  const members: ParsedMember[] = [];
  const warnings: string[] = [];
  let rowCount = 0;

  // eachRow starts at row 1 but we skip the header via options.
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    rowCount += 1;

    const parsed: Record<string, unknown> = {
      emailMarketingConsent: false,
      groupMemberships: [],
      areaMemberships: [],
    };

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const col = columnMap.get(colNumber);
      if (!col) return;
      const value = parseCell(cell.value as RawCell, col.parse);
      if (value !== undefined) parsed[col.apiKey] = value;
    });

    const membershipNumber = typeof parsed["membershipNumber"] === "string"
      ? (parsed["membershipNumber"] as string).trim()
      : undefined;
    const lastName = typeof parsed["lastName"] === "string"
      ? (parsed["lastName"] as string).trim()
      : undefined;

    if (!membershipNumber) {
      warnings.push(`row ${rowNumber}: skipped (no Mem No.)`);
      return;
    }
    if (!lastName) {
      warnings.push(`row ${rowNumber}: skipped (no Last Name)`);
      return;
    }

    parsed["salesforceId"] = `003MOCK_${membershipNumber}`;

    // Default emailMarketingConsent to false if absent (required by schema).
    if (parsed["emailMarketingConsent"] === undefined) {
      parsed["emailMarketingConsent"] = false;
    }

    // Derive groupMemberships[].primary=true for the declared groupCode.
    const groupCode = typeof parsed["groupCode"] === "string" ? (parsed["groupCode"] as string).trim() : undefined;
    const affiliate = typeof parsed["affiliateMemberPrimaryGroup"] === "string"
      ? (parsed["affiliateMemberPrimaryGroup"] as string).trim()
      : undefined;
    const groupMemberships: Array<{ groupCode: string; primary: boolean }> = [];
    if (groupCode && groupCode.length === 4) {
      groupMemberships.push({ groupCode, primary: true });
    }
    if (affiliate && affiliate.length === 4 && affiliate !== groupCode) {
      groupMemberships.push({ groupCode: affiliate, primary: false });
    }
    parsed["groupMemberships"] = groupMemberships;

    members.push(parsed as unknown as ParsedMember);
  });

  return { rowCount, members, unmatchedHeaders, missingHeaders, warnings };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const TWO_DIGIT_YEAR_API_KEYS = new Set<string>([
  "membershipExpiryDate",
  "areaJoinedDate",
]);

function formatInsightHubDate(d: Date, apiKey: string): string {
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  const yyyy = String(d.getUTCFullYear());
  if (TWO_DIGIT_YEAR_API_KEYS.has(apiKey)) {
    return `${dd}/${mm}/${yyyy.slice(-2)}`;
  }
  return `${dd}/${mm}/${yyyy}`;
}

/** Build a Buffer containing a valid ExportAll workbook from in-memory rows. */
export async function writeExportAll(
  members: ReadonlyArray<Record<string, unknown>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ramblers-salesforce-mock (synthetic)";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Full List");

  sheet.columns = INSIGHT_HUB_COLUMNS.map((c) => ({
    header: c.header,
    key: c.apiKey,
    width: Math.max(12, Math.min(40, c.header.length + 4)),
  }));

  for (const m of members) {
    const rowValues: Record<string, CellValue> = {};
    for (const col of INSIGHT_HUB_COLUMNS) {
      const v = m[col.apiKey];
      if (v === undefined || v === null) continue;
      if (v instanceof Date) {
        rowValues[col.apiKey] = formatInsightHubDate(v, col.apiKey);
      } else if (typeof v === "boolean") {
        rowValues[col.apiKey] = v ? "Yes" : "No";
      } else {
        rowValues[col.apiKey] = v as CellValue;
      }
    }
    sheet.addRow(rowValues);
  }

  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
