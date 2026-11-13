import { SCHEMA_VERSION, ThemeSchema, type FieldType, type FormDefinition, type Question } from "@/schema/form";
import { getField } from "@/fields/registry";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Short, URL/schema-safe random id (matches the canonical Id pattern). */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("")}`;
}

export function slugify(title: string): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
  return base.length >= 3 ? base : `form${base ? `-${base}` : ""}`;
}
/** Unique-enough public slug: readable stem + random suffix (DB enforces uniqueness). */
export function uniqueSlug(title: string): string {
  return `${slugify(title)}-${newId("x").slice(2, 7)}`;
}

export function blankForm(title: string): FormDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    title: title.trim() || "Untitled form",
    layout: "conversational",
    sections: [{ id: newId("s"), title: "", pageBreakAfter: false }],
    questions: [],
    theme: ThemeSchema.parse({}),
    completionScreen: { title: "Thank you!", message: "Your response has been recorded." },
  };
}

export function createQuestion(type: FieldType, sectionId: string): Question {
  const def = getField(type);
  const d = def.defaults();
  return {
    id: newId("q"), type, sectionId,
    label: d.label,
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.placeholder !== undefined && def.supportsPlaceholder ? { placeholder: d.placeholder } : {}),
    required: false,
    ...(def.hasOptions ? { options: (d.options ?? []).map(o => ({ ...o, id: newId("o") })) } : {}),
    config: def.configSchema.parse({}),
    validation: { ...(d.validation ?? {}) },
    rules: [],
  };
}

/** Change a question's type, keeping everything that still makes sense. */
export function convertQuestion(q: Question, type: FieldType): Question {
  if (q.type === type) return q;
  const from = getField(q.type), to = getField(type);
  const fresh = createQuestion(type, q.sectionId);
  const keptValidation = Object.fromEntries(Object.entries(q.validation).filter(([k]) => (to.validationKeys as readonly string[]).includes(k)));
  return {
    ...fresh,
    id: q.id,
    label: q.label || fresh.label,
    ...(q.description !== undefined ? { description: q.description } : {}),
    ...(to.supportsPlaceholder && q.placeholder ? { placeholder: q.placeholder } : {}),
    required: to.isContent ? false : q.required,
    ...(to.hasOptions ? { options: from.hasOptions && q.options?.length ? q.options : fresh.options } : {}),
    validation: Object.keys(keptValidation).length ? keptValidation : fresh.validation,
    rules: q.rules,
  };
}

export function newOption(existing: { value: string }[]) {
  let n = existing.length + 1;
  while (existing.some(o => o.value === `option_${n}`)) n++;
  return { id: newId("o"), label: `Option ${n}`, value: `option_${n}` };
}
