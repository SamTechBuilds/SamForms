import { describe, it, expect } from "vitest";
import { FormSchema } from "./form";
import { evalRule } from "./conditions";

const base = () => ({
  schemaVersion: 1 as const, title: "T",
  sections: [{ id: "s1", title: "One" }],
  questions: [
    { id: "q1", type: "yes_no", sectionId: "s1", label: "Hire?" },
    { id: "q2", type: "short_text", sectionId: "s1", label: "Why?", rules: [{ id: "r1", combinator: "and", conditions: [{ questionId: "q1", operator: "equals", value: true }], action: { type: "show" } }] },
  ],
});

describe("FormSchema", () => {
  it("accepts a valid form and applies defaults", () => {
    const f = FormSchema.parse(base());
    expect(f.layout).toBe("conversational");
    expect(f.questions[0]!.required).toBe(false);
  });
  it("fills the full theme defaults when theme is omitted (zod 4 default semantics regression)", () => {
    const f = FormSchema.parse(base());
    expect(f.theme).toMatchObject({ primary: "#2563eb", background: "#ffffff", fontFamily: "inter", borderRadius: 8, progress: "bar" });
    expect(f.completionScreen.title).toBe("Thank you!");
    expect(f.questions[0]!.validation).toEqual({});
    expect(f.questions[0]!.rules).toEqual([]);
  });
  it("rejects duplicate ids, unknown sections and dangling rule refs", () => {
    const b = base(); b.questions[1]!.id = "q1";
    expect(FormSchema.safeParse(b).success).toBe(false);
    const c = base(); c.questions[0]!.sectionId = "nope";
    expect(FormSchema.safeParse(c).success).toBe(false);
    const d = base(); (d.questions[1] as any).rules[0].conditions[0].questionId = "ghost";
    expect(FormSchema.safeParse(d).success).toBe(false);
  });
  it("requires options for choice questions", () => {
    const b = base(); b.questions[0] = { id: "q1", type: "dropdown", sectionId: "s1", label: "x" } as any;
    expect(FormSchema.safeParse(b).success).toBe(false);
  });
  it("rejects malformed AI-style output", () => {
    expect(FormSchema.safeParse({ title: "x", questions: "none" }).success).toBe(false);
  });
});

describe("conditions", () => {
  const rule: any = { id: "r", combinator: "or", conditions: [
    { questionId: "a", operator: "greater_than", value: 5 },
    { questionId: "b", operator: "contains", value: "yes" } ], action: { type: "show" } };
  it("OR/AND combinators", () => {
    expect(evalRule(rule, { a: 6 })).toBe(true);
    expect(evalRule(rule, { a: 1, b: "Oh YES" })).toBe(true);
    expect(evalRule(rule, { a: 1 })).toBe(false);
    expect(evalRule({ ...rule, combinator: "and" }, { a: 6 })).toBe(false);
  });
  it("answered / empty", () => {
    const r: any = { id: "r", combinator: "and", conditions: [{ questionId: "a", operator: "is_empty" }], action: { type: "hide" } };
    expect(evalRule(r, {})).toBe(true);
    expect(evalRule(r, { a: [] })).toBe(true);
    expect(evalRule(r, { a: "x" })).toBe(false);
  });
});
