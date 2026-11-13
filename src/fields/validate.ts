import { FormSchema, type FormDefinition, type Question } from "@/schema/form";
import { getField, isInputQuestion } from "./registry";
import { safePattern } from "./definitions";

export interface FormIssue {
  message: string;
  questionId?: string;
  sectionId?: string;
  /** "error" blocks publishing; "warning" is shown but does not block. */
  severity: "error" | "warning";
}
export interface DeepValidationResult { ok: boolean; form?: FormDefinition; issues: FormIssue[] }

const qName = (q: Question, i: number) => `Question ${i + 1}${q.label ? ` (“${q.label.slice(0, 40)}”)` : ""}`;

function questionIssues(q: Question, i: number, form: FormDefinition): FormIssue[] {
  const out: FormIssue[] = [];
  const add = (message: string, severity: FormIssue["severity"] = "error") => out.push({ message: `${qName(q, i)}: ${message}`, questionId: q.id, severity });
  const def = getField(q.type);

  const cfg = def.configSchema.safeParse(q.config ?? {});
  if (!cfg.success) cfg.error.issues.forEach(iss => add(`${iss.path.join(".") || "settings"}: ${iss.message}`));

  const v = q.validation;
  if (v.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) add("minimum length is greater than maximum length");
  if (v.min !== undefined && v.max !== undefined && v.min > v.max) add("minimum is greater than maximum");
  if (v.minSelections !== undefined && v.maxSelections !== undefined && v.minSelections > v.maxSelections) add("minimum selections is greater than maximum selections");
  if (v.pattern && !safePattern(v.pattern)) add("the validation pattern is not a valid regular expression");
  if (def.hasOptions) {
    const opts = q.options ?? [];
    const values = opts.map(o => o.value);
    if (new Set(values).size !== values.length) add("options must have unique values");
    if (new Set(opts.map(o => o.id)).size !== opts.length) add("options must have unique ids");
    if (v.minSelections !== undefined && v.minSelections > opts.length) add("minimum selections exceeds the number of options");
  }
  if (def.isContent && q.required) add("content blocks cannot be required");

  for (const r of q.rules) for (const c of r.conditions) {
    const target = form.questions.find(x => x.id === c.questionId);
    if (target && !isInputQuestion(target)) add("a rule depends on a content block, which never has an answer");
    if (c.questionId === q.id && r.action.type !== "goto_section") add("a show/hide rule cannot depend on the question itself");
    if (["equals", "not_equals", "contains", "greater_than", "less_than"].includes(c.operator) && c.value === undefined) add(`a “${c.operator.replace("_", " ")}” condition needs a value`);
  }
  return out;
}

/**
 * Full validation: canonical Zod FormSchema + field-registry config/validation checks.
 * Used before saving templates and before publishing; output is the same contract for
 * manual building, future document import and future AI generation.
 */
export function validateFormDeep(raw: unknown): DeepValidationResult {
  const parsed = FormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(iss => ({ message: `${iss.path.join(".") || "form"}: ${iss.message}`, severity: "error" as const })) };
  }
  const form = parsed.data;
  const issues = form.questions.flatMap((q, i) => questionIssues(q, i, form));
  return { ok: !issues.some(i => i.severity === "error"), form, issues };
}

/** Deep validation plus publish-readiness checks (labels, at least one question, images). */
export function getPublishIssues(raw: unknown): FormIssue[] {
  const res = validateFormDeep(raw);
  if (!res.form) return res.issues;
  const form = res.form;
  const issues = [...res.issues];
  if (!form.questions.some(isInputQuestion)) issues.push({ message: "Add at least one question before publishing.", severity: "error" });
  form.questions.forEach((q, i) => {
    if (isInputQuestion(q) && !q.label.trim()) issues.push({ message: `${qName(q, i)}: add a question label.`, questionId: q.id, severity: "error" });
    if (q.type === "heading" && !q.label.trim()) issues.push({ message: `${qName(q, i)}: the heading is empty.`, questionId: q.id, severity: "error" });
    if (q.type === "image" && !(q.config as { url?: unknown }).url) issues.push({ message: `${qName(q, i)}: add an image URL.`, questionId: q.id, severity: "error" });
    if (q.aiNotes) issues.push({ message: `${qName(q, i)}: review the AI note — ${q.aiNotes}`, questionId: q.id, severity: "warning" });
  });
  form.sections.forEach(s => {
    if (!form.questions.some(q => q.sectionId === s.id)) issues.push({ message: `Section “${s.title || "Untitled"}” is empty.`, sectionId: s.id, severity: "warning" });
  });
  return issues;
}
