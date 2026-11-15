import { describe, it, expect } from "vitest";
import { FIELD_TYPES, FormSchema, QuestionSchema, type Question } from "@/schema/form";
import { fieldRegistry, fieldsByCategory, resolveConfig } from "./registry";
import { validateAnswer, formatAnswer } from "./answers";
import { validateFormDeep, getPublishIssues } from "./validate";
import { createQuestion, blankForm, convertQuestion } from "@/features/builder/factory";

const q = (type: Question["type"], patch: Partial<Question> = {}): Question => ({ ...createQuestion(type, "s1"), ...patch });

describe("registry completeness", () => {
  it("defines every canonical field type exactly once (27)", () => {
    expect(FIELD_TYPES).toHaveLength(28);
    expect(Object.keys(fieldRegistry).sort()).toEqual([...FIELD_TYPES].sort());
    for (const t of FIELD_TYPES) expect(fieldRegistry[t].type).toBe(t);
  });
  it("places every type in exactly one category", () => {
    const all = fieldsByCategory.flatMap(c => c.fields.map(f => f.type));
    expect(all.sort()).toEqual([...FIELD_TYPES].sort());
    expect(fieldsByCategory.every(c => c.fields.length > 0)).toBe(true);
  });
});

describe("field defaults", () => {
  for (const t of FIELD_TYPES) {
    it(`${t}: default question is canonical and its config parses`, () => {
      const question = createQuestion(t, "s1");
      expect(QuestionSchema.safeParse(question).success).toBe(true);
      expect(fieldRegistry[t].configSchema.safeParse(question.config).success).toBe(true);
      expect(question.config).toEqual(fieldRegistry[t].configSchema.parse({}));
      if (fieldRegistry[t].hasOptions) expect(question.options!.length).toBeGreaterThan(0);
    });
    it(`${t}: sample answer validates; garbage does not`, () => {
      const question = q(t, { required: true });
      const def = fieldRegistry[t];
      if (def.isContent) { expect(validateAnswer(question, "anything")).toEqual({ ok: true, value: undefined }); return; }
      const sample = def.sampleAnswer(question, resolveConfig(question));
      expect(validateAnswer(question, sample), JSON.stringify(sample)).toMatchObject({ ok: true });
      expect(validateAnswer(question, { garbage: Symbol.name })).toMatchObject({ ok: false });
      expect(validateAnswer(question, undefined)).toEqual({ ok: false, error: "This question is required" });
      expect(typeof formatAnswer(question, sample)).toBe("string");
    });
  }
  it("a form containing one of every type passes deep validation", () => {
    const f = blankForm("All types");
    f.questions = FIELD_TYPES.map(t => createQuestion(t, f.sections[0]!.id));
    expect(validateFormDeep(f).issues).toEqual([]);
  });
});

describe("field validation", () => {
  it("text length and safe pattern", () => {
    const t = q("short_text", { validation: { minLength: 3, maxLength: 5, pattern: "^[A-Z]+$", patternMessage: "Capitals only" } });
    expect(validateAnswer(t, "ab")).toMatchObject({ ok: false });
    expect(validateAnswer(t, "abcdef")).toMatchObject({ ok: false });
    expect(validateAnswer(t, "abcd")).toEqual({ ok: false, error: "Capitals only" });
    expect(validateAnswer(t, "ABCD")).toMatchObject({ ok: true });
    expect(validateAnswer(q("short_text", { validation: { pattern: "([" } }), "x")).toMatchObject({ ok: true }); // invalid regex ignored at runtime, flagged at publish
  });
  it("optional empty answers are fine; required toggles must be on", () => {
    expect(validateAnswer(q("email"), "")).toEqual({ ok: true, value: undefined });
    expect(validateAnswer(q("toggle", { required: true }), false)).toMatchObject({ ok: false });
    expect(validateAnswer(q("toggle"), false)).toMatchObject({ ok: true });
  });
  it("contact types", () => {
    expect(validateAnswer(q("email"), "nope")).toMatchObject({ ok: false });
    expect(validateAnswer(q("url"), "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(validateAnswer(q("url"), "ftp://x.com")).toMatchObject({ ok: false });
    expect(validateAnswer(q("phone"), "12")).toMatchObject({ ok: false });
    expect(validateAnswer(q("name", { config: { format: "first_last" } }), { first: "A", last: "" })).toMatchObject({ ok: false });
  });
  it("numbers, currency and integer-only", () => {
    expect(validateAnswer(q("number", { validation: { min: 1, max: 10 } }), 11)).toMatchObject({ ok: false });
    expect(validateAnswer(q("number", { config: { allowDecimals: false } }), 2.5)).toMatchObject({ ok: false });
    expect(validateAnswer(q("number"), "5")).toMatchObject({ ok: false });
    expect(validateAnswer(q("currency"), 10.123)).toMatchObject({ ok: false });
    expect(formatAnswer(q("currency", { config: { currency: "CAD" } }), 5)).toBe("CAD 5.00");
  });
  it("choices reject unknown values unless 'other' is allowed; selection limits apply", () => {
    const single = q("single_choice");
    expect(validateAnswer(single, "made_up")).toMatchObject({ ok: false });
    expect(validateAnswer({ ...single, config: { allowOther: true, randomize: false } }, "made_up")).toMatchObject({ ok: true });
    const multi = q("multiple_choice", { validation: { minSelections: 2 } });
    const [a, b] = multi.options!;
    expect(validateAnswer(multi, [a!.value])).toMatchObject({ ok: false });
    expect(validateAnswer(multi, [a!.value, a!.value])).toMatchObject({ ok: false });
    expect(validateAnswer(multi, [a!.value, b!.value])).toMatchObject({ ok: true });
    expect(formatAnswer(multi, [a!.value, b!.value])).toBe(`${a!.label}; ${b!.label}`);
  });
  it("dates, times, ranges and scales", () => {
    expect(validateAnswer(q("date"), "2026-02-30")).toMatchObject({ ok: false });
    expect(validateAnswer(q("date", { config: { minDate: "2026-06-01" } }), "2026-05-31")).toMatchObject({ ok: false });
    expect(validateAnswer(q("time"), "24:00")).toMatchObject({ ok: false });
    expect(formatAnswer(q("time"), "13:05")).toBe("1:05 PM");
    expect(validateAnswer(q("date_range"), { start: "2026-02-02", end: "2026-02-01" })).toMatchObject({ ok: false });
    expect(validateAnswer(q("star_rating", { config: { max: 5 } }), 6)).toMatchObject({ ok: false });
    expect(validateAnswer(q("linear_scale", { config: { min: 1, max: 5 } }), 0)).toMatchObject({ ok: false });
    expect(validateAnswer(q("opinion_scale"), 0)).toMatchObject({ ok: true });
  });
  it("uploads enforce count, size and type", () => {
    const f = q("image_upload", { validation: { maxFiles: 1, maxFileSizeMb: 1, allowedMimeTypes: ["image/png"] } });
    const file = (p: object) => ({ id: "f", name: "a.png", size: 100, mimeType: "image/png", ...p });
    expect(validateAnswer(f, [file({})])).toMatchObject({ ok: true });
    expect(validateAnswer(f, [file({}), file({ id: "g" })])).toMatchObject({ ok: false });
    expect(validateAnswer(f, [file({ size: 2 * 1024 * 1024 })])).toMatchObject({ ok: false });
    expect(validateAnswer(f, [file({ mimeType: "application/pdf" })])).toMatchObject({ ok: false });
  });
  it("signature and colour", () => {
    expect(validateAnswer(q("signature"), "data:text/html;base64,PHNjcmlwdD4=")).toMatchObject({ ok: false });
    expect(validateAnswer(q("color_picker"), "red")).toMatchObject({ ok: false });
  });
});

describe("deep validation and publish readiness", () => {
  const base = () => { const f = blankForm("T"); f.questions = [createQuestion("short_text", f.sections[0]!.id)]; return f; };
  it("flags inconsistent settings", () => {
    const f = base();
    f.questions[0]!.validation = { minLength: 10, maxLength: 2, pattern: "([" };
    const msgs = validateFormDeep(f).issues.map(i => i.message).join("\n");
    expect(msgs).toMatch(/minimum length/);
    expect(msgs).toMatch(/not a valid regular expression/);
  });
  it("flags bad per-type config and duplicate option values", () => {
    const f = base();
    f.questions.push({ ...createQuestion("star_rating", f.sections[0]!.id), config: { max: 99 } });
    const c = createQuestion("dropdown", f.sections[0]!.id);
    c.options = [{ id: "a", label: "A", value: "x" }, { id: "b", label: "B", value: "x" }];
    f.questions.push(c);
    const r = validateFormDeep(f);
    expect(r.ok).toBe(false);
    expect(r.issues.map(i => i.message).join("\n")).toMatch(/max[\s\S]*unique values/);
  });
  it("requires labels and at least one question to publish", () => {
    expect(getPublishIssues(blankForm("Empty")).map(i => i.message)).toContain("Add at least one question before publishing.");
    const f = base(); f.questions[0]!.label = " ";
    expect(getPublishIssues(f).some(i => /add a question label/.test(i.message))).toBe(true);
    expect(getPublishIssues(base()).filter(i => i.severity === "error")).toEqual([]);
  });
  it("rejects malformed (e.g. AI-style) documents with readable issues", () => {
    const r = validateFormDeep({ title: "x", questions: "none" });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it("type conversion keeps label/required/options where compatible", () => {
    const s = createQuestion("single_choice", "s1");
    const d = convertQuestion({ ...s, label: "Pick", required: true }, "dropdown");
    expect(d).toMatchObject({ id: s.id, type: "dropdown", label: "Pick", required: true, options: s.options });
    const h = convertQuestion({ ...s, required: true }, "heading");
    expect(h.required).toBe(false);
    expect(h.options).toBeUndefined();
    expect(FormSchema.safeParse({ ...blankForm("x"), sections: [{ id: "s1", title: "" }], questions: [d, { ...h, id: "other" }] }).success).toBe(true);
  });
});
