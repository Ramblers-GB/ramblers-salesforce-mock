import type { ParseKind } from "@ramblers/sf-contract";

/**
 * Coerce a raw cell value (exceljs gives us string | number | Date | boolean
 * | null | undefined | CellRichTextValue) into a typed scalar for storage.
 * Empty / whitespace-only cells become undefined so Mongo doesn't persist
 * them — matching #209 "only fields with values are shown" semantics.
 */
export type RawCell =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | { richText?: unknown[]; text?: string };

const TRUTHY = new Set(["true", "t", "yes", "y", "1"]);
const FALSY = new Set(["false", "f", "no", "n", "0", ""]);

function toText(value: RawCell): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim() || undefined;
  }
  return undefined;
}

export function parseCell(
  value: RawCell,
  kind: ParseKind,
): string | Date | boolean | undefined {
  const raw = toText(value);
  if (raw === undefined) return undefined;

  switch (kind) {
    case "string":
      return raw;

    case "date": {
      if (value instanceof Date) return value;
      // Accept ISO and "dd/mm/yyyy" which Insight Hub sometimes renders as.
      const iso = new Date(raw);
      if (!Number.isNaN(iso.getTime())) return iso;
      const uk = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(raw);
      if (uk && uk[1] && uk[2] && uk[3]) {
        const year = uk[3].length === 2 ? 2000 + Number(uk[3]) : Number(uk[3]);
        const parsed = new Date(Date.UTC(year, Number(uk[2]) - 1, Number(uk[1])));
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
      return undefined;
    }

    case "boolean": {
      const lower = raw.toLowerCase();
      if (TRUTHY.has(lower)) return true;
      if (FALSY.has(lower)) return false;
      return undefined;
    }

    case "memberTerm": {
      const lower = raw.toLowerCase();
      if (lower === "life" || lower === "annual") return lower;
      return undefined;
    }

    case "membershipType":
      return raw;
  }
}
