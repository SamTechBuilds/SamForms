// Reads text from an uploaded document in the browser. Nothing is uploaded to a server at this stage.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];
export const ACCEPTED_DOCUMENTS = ".docx,.pdf,.xlsx,.csv,.txt,.md";

export function normaliseText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractDocumentText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is larger than 10 MB.");
  const name = file.name.toLowerCase();
  if (TEXT_EXTENSIONS.some(ext => name.endsWith(ext))) return normaliseText(await file.text());
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return normaliseText(result.value);
  }
  if (name.endsWith(".xlsx")) return normaliseText(await xlsxText(await file.arrayBuffer()));
  if (name.endsWith(".pdf")) return normaliseText(await pdfText(await file.arrayBuffer()));
  throw new Error("Use a DOCX, PDF, XLSX, CSV, TXT or Markdown file.");
}

export async function xlsxText(buffer: ArrayBuffer): Promise<string> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const parts: string[] = [];
  wb.eachSheet(ws => {
    parts.push(`Sheet: ${ws.name}`);
    ws.eachRow(row => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, cell => cells.push(String(cell.text ?? "")));
      if (cells.length) parts.push(cells.join(" | "));
    });
  });
  return parts.join("\n");
}

export async function pdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map(item => ("str" in item ? item.str : "")).join(" ") + "\n\n";
  }
  await doc.destroy();
  return out;
}
