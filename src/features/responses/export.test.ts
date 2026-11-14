import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportColumns, responseCells, toCsv, toXlsx } from "./export";
import type { ResponseRow, VersionSchema } from "./api";

const base = (over: Record<string, unknown>) => ({ sectionId: "s1", required: false, config: {}, validation: {}, rules: [], ...over });
const v1: VersionSchema = { id: "v1", version: 1, schema: { schemaVersion: 1, title: "T", layout: "classic", sections: [{ id: "s1", title: "Main", pageBreakAfter: false }], questions: [
  base({ id: "name", type: "short_text", label: "Name" }),
  base({ id: "old", type: "short_text", label: "Old question" }),
] } };
const v2: VersionSchema = { id: "v2", version: 2, schema: { schemaVersion: 1, title: "T", layout: "classic", sections: [{ id: "s1", title: "Main", pageBreakAfter: false }], questions: [
  base({ id: "name", type: "short_text", label: "Full name" }),
  base({ id: "cv", type: "file_upload", label: "CV", validation: { maxFiles: 1 } }),
] } };

describe("exportColumns", () => {
  it("uses newest labels first and keeps questions that only existed in older versions", () => {
    const cols = exportColumns([v1, v2]);
    expect(cols.map(c => [c.key, c.label])).toEqual([["name", "Full name"], ["cv", "CV"], ["old", "Old question"]]);
  });
});

describe("responseCells", () => {
  it("lists file names for file questions and formats other answers", () => {
    const cols = exportColumns([v2]);
    const row: ResponseRow = {
      id: "r1", submitted_at: "2026-11-14T10:00:00Z", user_agent: null, form_version_id: "v2",
      answers: { name: "Ana" },
      submission_files: [{ id: "f1", question_id: "cv", original_name: "CV.pdf", mime_type: "application/pdf", size_bytes: 10, storage_path: "p" }],
    };
    expect(responseCells(row, cols, new Map([["v2", 2]]))).toEqual(["2026-11-14T10:00:00Z", "r1", "2", "Ana", "CV.pdf"]);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x, y", 'say "hi"\nthere']])).toBe('a,b\r\n"x, y","say ""hi""\nthere"\r\n');
  });
  it("neutralises spreadsheet formulas but keeps plain negative numbers", () => {
    const out = toCsv(["v"], [["=HYPERLINK(\"http://x\")"], ["+1+1"], ["@SUM(A1)"], ["-5"], ["-1+cmd"], ["\tTAB"]]);
    const lines = out.split("\r\n");
    expect(lines[1]).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(lines[2]).toBe("'+1+1");
    expect(lines[3]).toBe("'@SUM(A1)");
    expect(lines[4]).toBe("-5");
    expect(lines[5]).toBe("'-1+cmd");
  });
});

describe("toXlsx", () => {
  it("writes a workbook that reads back with the same values", async () => {
    const blob = await toXlsx(["Name", "Note"], [["Ana", "=not a formula"], ["Bo", "line\nbreak"]]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet("Responses")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Name");
    expect(ws.getRow(2).getCell(2).value).toBe("=not a formula");
    expect(ws.getRow(3).getCell(2).value).toBe("line\nbreak");
  });
});
