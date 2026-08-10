import ExcelJS from "exceljs";
import type { ParsedMember } from "./xlsx-parser.js";

export interface SupporterSheetResult {
  rowCount: number;
  members: ParsedMember[];
  unmatchedHeaders: string[];
  warnings: string[];
}

const SUPPORTER_SHEET_COLUMNS: Record<string, string> = {
  "member ref": "memberRef",
  "salesforce id": "salesforceId",
  "contact id": "contactId",
  "membership number": "membershipNumber",
  "title": "title",
  "first name": "firstName",
  "last name": "lastName",
  "display name": "displayName",
  "email": "email",
  "mobile": "mobileNumber",
  "landline": "landlineTelephone",
  "postcode": "postcode",
  "group code": "groupCode",
  "group name": "groupName",
  "team status": "teamStatus",
  "volunteer roles": "volunteerRoles",
};

const TEAM_STATUSES = ["Member", "Affiliated", "Volunteer", "Wellbeing Walker"];

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  } else if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  } else if (typeof value === "object" && "result" in value) {
    return String((value as { result: unknown }).result ?? "").trim();
  } else {
    return String(value).trim();
  }
}

export async function parseSupporterSheetKeyedOnMemberRef(buffer: Buffer): Promise<SupporterSheetResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rowCount: 0, members: [], unmatchedHeaders: [], warnings: ["workbook has no worksheets"] };
  }

  const columnMap = new Map<number, string>();
  const unmatchedHeaders: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell.value);
    const apiKey = SUPPORTER_SHEET_COLUMNS[headerKey(text)];
    if (apiKey) {
      columnMap.set(colNumber, apiKey);
    } else if (text.length > 0) {
      unmatchedHeaders.push(text);
    }
  });

  const warnings: string[] = [];
  const members: ParsedMember[] = [];
  let rowCount = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    rowCount += 1;
    const values: Record<string, string> = {};
    columnMap.forEach((apiKey, colNumber) => {
      const text = cellText(row.getCell(colNumber).value);
      if (text.length > 0) {
        values[apiKey] = text;
      }
    });
    const memberRef = values["memberRef"];
    if (!memberRef) {
      warnings.push(`row ${rowNumber} skipped: no Member Ref`);
      return;
    }
    const salesforceId = values["salesforceId"] ?? `003SUPPLIED_${memberRef}`;
    const teamStatus = TEAM_STATUSES.includes(values["teamStatus"] ?? "") ? values["teamStatus"] : undefined;
    const roleNames = (values["volunteerRoles"] ?? "").split(",").map((role) => role.trim()).filter((role) => role.length > 0);
    members.push({
      ...values,
      salesforceId,
      contactId: values["contactId"] ?? salesforceId,
      lastName: values["lastName"] ?? memberRef,
      ...(teamStatus ? { teamStatus, volunteer: teamStatus === "Volunteer" } : {}),
      ...(roleNames.length > 0 ? { volunteerRoles: roleNames.map((roleName) => ({ roleName })) } : {}),
    } as unknown as ParsedMember);
  });

  return { rowCount, members, unmatchedHeaders, warnings };
}
