// Turns a model's draft into a schema that passes FormSchema. Nothing the model returns is trusted:
// unknown types become short text, rules and themes are dropped, ids are rebuilt, and the result is
// parsed again before it can be shown or saved.
import { FIELD_TYPES, FormSchema, type FormDefinition } from "@/schema/form";

const CHOICE = new Set(["single_choice", "multiple_choice", "dropdown"]);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface NormalizeResult { schema: FormDefinition; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const validId = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : null);
function unique(base: string, used: Set<string>) {
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function normalizeGeneratedForm(raw: unknown, fallbackTitle: string): NormalizeResult {
  if (!isObj(raw)) throw new Error("The AI draft was not a form. Try again with more detail.");
  const warnings: string[] = [];
  const title = (str(raw.title) || fallbackTitle.trim() || "Untitled form").slice(0, 200);
  const layout = raw.layout === "classic" ? "classic" : "conversational";

  const usedSections = new Set<string>();
  let sections = (Array.isArray(raw.sections) ? raw.sections : []).filter(isObj).map((s, i) => ({
    id: unique(validId(s.id) ?? `s${i + 1}`, usedSections),
    title: (str(s.title) || `Section ${i + 1}`).slice(0, 200),
    pageBreakAfter: false,
  }));
  if (sections.length === 0) sections = [{ id: "s1", title: "Questions", pageBreakAfter: false }];
  const sectionIds = new Set(sections.map(s => s.id));

  const usedQuestions = new Set<string>();
  const questions: Record<string, unknown>[] = [];
  (Array.isArray(raw.questions) ? raw.questions : []).forEach((item, i) => {
    if (!isObj(item)) { warnings.push(`Skipped item ${i + 1} because it was not a question.`); return; }
    const label = (str(item.label) || `Question ${i + 1}`).slice(0, 300);
    let type = typeof item.type === "string" && (FIELD_TYPES as readonly string[]).includes(item.type) ? item.type : "";
    if (!type) { warnings.push(`"${label}" had an unknown type, so it was set to short text.`); type = "short_text"; }
    const q: Record<string, unknown> = {
      id: unique(validId(item.id) ?? `q${i + 1}`, usedQuestions),
      type,
      sectionId: typeof item.sectionId === "string" && sectionIds.has(item.sectionId) ? item.sectionId : sections[0]!.id,
      label,
      required: item.required === true,
      config: {},
      validation: {},
      rules: [],
    };
    const description = str(item.description);
    if (description) q.description = description.slice(0, 1000);
    const placeholder = str(item.placeholder);
    if (placeholder) q.placeholder = placeholder.slice(0, 200);
    if (CHOICE.has(type)) {
      const labels = (Array.isArray(item.options) ? item.options : [])
        .map(o => (isObj(o) ? str(o.label) : str(o)))
        .filter(Boolean)
        .slice(0, 100)
        .map(l => l.slice(0, 200));
      const seen = new Map<string, number>();
      let options = labels.map((l, j) => {
        const count = (seen.get(l) ?? 0) + 1;
        seen.set(l, count);
        const value = count > 1 ? `${l} (${count})` : l;
        return { id: `o${j + 1}`, label: l, value };
      });
      if (options.length < 2) {
        warnings.push(`"${label}" needed options, so placeholder options were added. Edit them before publishing.`);
        options = [{ id: "o1", label: "Option 1", value: "Option 1" }, { id: "o2", label: "Option 2", value: "Option 2" }];
      }
      q.options = options;
    }
    questions.push(q);
  });
  if (questions.length === 0) throw new Error("The draft has no questions. Try a more specific description.");

  const parsed = FormSchema.safeParse({ schemaVersion: 1, title, layout, sections, questions });
  if (!parsed.success) throw new Error(`The draft could not be used: ${parsed.error.issues[0]?.message ?? "unknown problem"}.`);
  return { schema: parsed.data, warnings };
}
