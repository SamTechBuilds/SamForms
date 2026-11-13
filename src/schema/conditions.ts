import type { Rule } from "./form";
export type Answers = Record<string, unknown>;

const answered = (v: unknown) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));

export function evalCondition(c: Rule["conditions"][number], answers: Answers): boolean {
  const a = answers[c.questionId];
  switch (c.operator) {
    case "is_answered": return answered(a);
    case "is_empty": return !answered(a);
    case "equals": return Array.isArray(a) ? a.includes(c.value) : a === c.value;
    case "not_equals": return Array.isArray(a) ? !a.includes(c.value) : a !== c.value;
    case "contains": return Array.isArray(a) ? a.includes(c.value) : typeof a === "string" && typeof c.value === "string" && a.toLowerCase().includes(c.value.toLowerCase());
    case "greater_than": return typeof a === "number" && typeof c.value === "number" && a > c.value;
    case "less_than": return typeof a === "number" && typeof c.value === "number" && a < c.value;
  }
}
export function evalRule(r: Rule, answers: Answers): boolean {
  const results = r.conditions.map(c => evalCondition(c, answers));
  return r.combinator === "and" ? results.every(Boolean) : results.some(Boolean);
}
