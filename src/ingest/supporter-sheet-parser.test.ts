import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseSupporterSheetKeyedOnMemberRef } from "./supporter-sheet-parser.js";

async function sheetBuffer(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Supporters");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseSupporterSheetKeyedOnMemberRef", () => {
  it("puts a Display Name column value onto the parsed member as a plain string", async () => {
    const buffer = await sheetBuffer(
      ["Member Ref", "Last Name", "Display Name"],
      [["KRV-143", "Barlow", "Amanda Barlow (Shoreham)"]],
    );

    const result = await parseSupporterSheetKeyedOnMemberRef(buffer);

    expect(result.rowCount).toEqual(1);
    expect(result.unmatchedHeaders).toEqual([]);
    expect(result.members).toHaveLength(1);
    const member = result.members[0]!;
    expect(member.displayName).toEqual("Amanda Barlow (Shoreham)");
    expect(typeof member.displayName).toEqual("string");
  });

  it("parses sheets that omit the Display Name column, leaving displayName unset", async () => {
    const buffer = await sheetBuffer(
      ["Member Ref", "Last Name"],
      [["KRV-136", "Turing"]],
    );

    const result = await parseSupporterSheetKeyedOnMemberRef(buffer);

    expect(result.rowCount).toEqual(1);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]!.displayName).toBeUndefined();
  });
});
