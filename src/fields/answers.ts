import type { Question } from "@/schema/form";
import { getField, resolveConfig } from "./registry";

export const isAnswered = (v: unknown) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));

export type AnswerResult = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Validate one answer against its question using the field registry.
 * Pure and DOM-free so the Phase 3 submit function can run the exact same logic server-side.
 */
export function validateAnswer(q: Question, value: unknown): AnswerResult {
  const def = getField(q.type);
  if (def.isContent) return { ok: true, value: undefined };
  // A required toggle (e.g. consent) must be switched on.
  const empty = !isAnswered(value) || (q.type === "toggle" && q.required && value !== true);
  if (empty) return q.required ? { ok: false, error: "This question is required" } : { ok: true, value: undefined };
  const schema = def.answerSchema(q, resolveConfig(q));
  if (!schema) return { ok: true, value: undefined };
  const r = schema.safeParse(value);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Invalid answer" };
}

export function formatAnswer(q: Question, value: unknown): string {
  if (!isAnswered(value)) return "";
  return getField(q.type).formatAnswer(value, q, resolveConfig(q));
}
