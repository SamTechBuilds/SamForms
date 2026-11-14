import { describe, it, expect, vi } from "vitest";

// The app ships mammoth's browser build (arrayBuffer input). Vitest's Node environment resolves the
// Node build (buffer input), so this test keeps the real parser and only converts the input shape.
vi.mock("mammoth", async () => {
  const real = await vi.importActual<typeof import("mammoth")>("mammoth");
  return {
    ...real,
    extractRawText: (options: { arrayBuffer: ArrayBuffer }) =>
      real.extractRawText({ buffer: Buffer.from(options.arrayBuffer) }),
  };
});
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { normalizeGeneratedForm } from "./normalize";
import { extractDocumentText, normaliseText, MAX_FILE_BYTES } from "./extract";
import { MAX_DOCUMENT_CHARS_UI, MAX_PROMPT_CHARS_UI } from "./limits";
import { MAX_DOCUMENT_CHARS, MAX_PROMPT_CHARS } from "../../../supabase/functions/_shared/ai";

describe("limits stay in step with the Edge Function", () => {
  it("matches the server-side limits", () => {
    expect(MAX_PROMPT_CHARS_UI).toBe(MAX_PROMPT_CHARS);
    expect(MAX_DOCUMENT_CHARS_UI).toBe(MAX_DOCUMENT_CHARS);
  });
});

describe("normalizeGeneratedForm", () => {
  it("keeps valid questions and rebuilds ids, sections and options", () => {
    const { schema, warnings } = normalizeGeneratedForm({
      title: "  Job application ",
      layout: "classic",
      sections: [{ id: "s", title: "About you" }],
      questions: [
        { id: "name", type: "name", label: "Full name", required: true, sectionId: "s" },
        { id: "name", type: "email", label: "Email", sectionId: "missing" },
        { type: "single_choice", label: "Availability", options: [{ label: "Weekdays" }, "Weekdays", "Weekends"] },
      ],
    }, "Fallback");
    expect(schema.title).toBe("Job application");
    expect(schema.layout).toBe("classic");
    expect(schema.questions.map(q => q.id)).toEqual(["name", "name-2", "q3"]);
    expect(schema.questions[1]!.sectionId).toBe("s");
    expect(schema.questions[2]!.options!.map(o => o.value)).toEqual(["Weekdays", "Weekdays (2)", "Weekends"]);
    expect(warnings).toEqual([]);
  });

  it("drops rules and config the model supplied, and falls back on unknown types", () => {
    const { schema, warnings } = normalizeGeneratedForm({
      questions: [
        { type: "hologram", label: "Pick", rules: [{ action: "hide" }], config: { evil: true }, validation: { min: -1 } },
        { type: "single_choice", label: "One option", options: ["Only"] },
      ],
    }, "Fallback");
    expect(schema.questions[0]).toMatchObject({ type: "short_text", rules: [], config: {}, validation: {} });
    expect(schema.questions[1]!.options).toHaveLength(2);
    expect(warnings.some(w => w.includes("unknown type"))).toBe(true);
    expect(warnings.some(w => w.includes("placeholder options"))).toBe(true);
    expect(schema.title).toBe("Fallback");
  });

  it("refuses drafts that are not forms or have no questions", () => {
    expect(() => normalizeGeneratedForm("text", "x")).toThrow(/not a form/);
    expect(() => normalizeGeneratedForm({ questions: [] }, "x")).toThrow(/no questions/);
  });
});

describe("text extraction", () => {
  it("reads plain text and CSV and normalises line endings", async () => {
    const txt = new File(["Name\r\n\r\n\r\n\r\nEmail  \n"], "brief.txt");
    expect(await extractDocumentText(txt)).toBe("Name\n\nEmail");
    expect(await extractDocumentText(new File(["a,b\n1,2"], "data.CSV"))).toBe("a,b\n1,2");
    expect(normaliseText("  x  ")).toBe("x");
  });

  it("reads XLSX sheets row by row", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Intake");
    ws.addRow(["Question", "Type"]);
    ws.addRow(["Phone number", "short text"]);
    const buf = await wb.xlsx.writeBuffer();
    const text = await extractDocumentText(new File([buf], "intake.xlsx"));
    expect(text).toBe("Sheet: Intake\nQuestion | Type\nPhone number | short text");
  });

  it("reads DOCX paragraphs", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Full name</w:t></w:r></w:p><w:p><w:r><w:t>Email address</w:t></w:r></w:p></w:body></w:document>');
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const text = await extractDocumentText(new File([buf], "form.docx"));
    expect(text).toContain("Full name");
    expect(text).toContain("Email address");
  });

  it("rejects unsupported and oversize files", async () => {
    await expect(extractDocumentText(new File(["x"], "image.png"))).rejects.toThrow(/Use a DOCX/);
    const big = new File([new Uint8Array(10)], "big.txt");
    Object.defineProperty(big, "size", { value: MAX_FILE_BYTES + 1 });
    await expect(extractDocumentText(big)).rejects.toThrow(/larger than 10 MB/);
  });
});
