import { formatAnswer } from "@/fields/answers";
import { isInputQuestion } from "@/fields/registry";
import { FormSchema, type Question } from "@/schema/form";
import type { ResponseRow, VersionSchema } from "./api";

const FILE_TYPES = new Set(["file_upload", "image_upload"]);
const NUMERIC = /^-?\d+(\.\d+)?$/;

export interface ExportColumn { key: string; label: string; question: Question }

/**
 * Columns are the input questions of every version. Newest labels win; questions that only existed
 * in older versions are appended, so no answer is dropped from an export.
 */
export function exportColumns(versions: VersionSchema[]): ExportColumn[] {
  const seen = new Map<string, ExportColumn>();
  for (const v of [...versions].sort((a, b) => b.version - a.version)) {
    const parsed = FormSchema.safeParse(v.schema);
    if (!parsed.success) continue;
    for (const q of parsed.data.questions) {
      if (!isInputQuestion(q) || seen.has(q.id)) continue;
      seen.set(q.id, { key: q.id, label: q.label || q.id, question: q });
    }
  }
  return [...seen.values()];
}

export const EXPORT_FIXED_HEADERS = ["Submitted at", "Response ID", "Form version"];

/** One export row. Values are plain text; file questions list the original file names. */
export function responseCells(r: ResponseRow, cols: ExportColumn[], versionNumbers: Map<string, number>): string[] {
  const cells = [r.submitted_at, r.id, String(versionNumbers.get(r.form_version_id) ?? "")];
  for (const c of cols) {
    if (FILE_TYPES.has(c.question.type)) {
      cells.push(r.submission_files.filter(f => f.question_id === c.key).map(f => f.original_name).join("; "));
    } else {
      cells.push(formatAnswer(c.question, r.answers[c.key]));
    }
  }
  return cells;
}

/**
 * RFC 4180 CSV. Cells that a spreadsheet could read as a formula (leading = + - @ tab or CR) are
 * prefixed with an apostrophe, except plain numbers such as -5 which must stay numeric.
 */
export function toCsv(header: string[], rows: string[][]): string {
  const cell = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) && !NUMERIC.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function toXlsx(header: string[], rows: string[][]): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Responses");
  ws.addRow(header).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  header.forEach((h, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(12, h.length + 2)); });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function buildExport(formTitle: string, rows: ResponseRow[], versions: VersionSchema[]) {
  const cols = exportColumns(versions);
  const numbers = new Map(versions.map(v => [v.id, v.version]));
  const header = [...EXPORT_FIXED_HEADERS, ...cols.map(c => c.label)];
  const body = rows.map(r => responseCells(r, cols, numbers));
  return { header, body, cols, slug: formTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form" };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
