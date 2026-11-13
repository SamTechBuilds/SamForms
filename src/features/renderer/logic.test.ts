import { describe, it, expect } from "vitest";
import { FormSchema, type FormDefinition, type Question } from "@/schema/form";
import { blankForm, createQuestion } from "@/features/builder/factory";
import { buildPages, effectiveAnswers, isVisible, nextPage, nextStep, orderedQuestions, validateVisible } from "./logic";

/** s1: q1 (yes_no), q2 (short_text, shown only when q1 = yes) ; s2: q3 (required) */
function fixture(): FormDefinition {
  const f = blankForm("Logic");
  f.sections = [{ id: "s1", title: "A", pageBreakAfter: true }, { id: "s2", title: "B", pageBreakAfter: false }];
  const q1: Question = { ...createQuestion("yes_no", "s1"), id: "q1" };
  const q2: Question = { ...createQuestion("short_text", "s1"), id: "q2", rules: [{ id: "r1", combinator: "and", conditions: [{ questionId: "q1", operator: "equals", value: true }], action: { type: "show" } }] };
  const q3: Question = { ...createQuestion("short_text", "s2"), id: "q3", required: true };
  f.questions = [q1, q2, q3];
  return f;
}

describe("conditional visibility", () => {
  it("show rule hides a question until its condition passes", () => {
    const f = fixture();
    const q2 = f.questions[1]!;
    expect(isVisible(q2, {})).toBe(false);
    expect(isVisible(q2, { q1: true })).toBe(true);
    expect(isVisible(q2, { q1: false })).toBe(false);
  });
  it("hide rules win over show rules and OR/AND combine as specified", () => {
    const q: Question = { ...createQuestion("short_text", "s1"), id: "x", rules: [
      { id: "a", combinator: "or", conditions: [{ questionId: "p", operator: "equals", value: "a" }, { questionId: "p", operator: "equals", value: "b" }], action: { type: "show" } },
      { id: "h", combinator: "and", conditions: [{ questionId: "p", operator: "equals", value: "b" }], action: { type: "hide" } },
    ] };
    expect(isVisible(q, { p: "a" })).toBe(true);
    expect(isVisible(q, { p: "b" })).toBe(false);
    expect(isVisible(q, { p: "c" })).toBe(false);
  });
  it("answers of hidden questions are dropped from the submission", () => {
    const f = fixture();
    expect(effectiveAnswers(f, { q1: false, q2: "stale", q3: "x" })).toEqual({ q1: false, q3: "x" });
    expect(effectiveAnswers(f, { q1: true, q2: "kept" })).toEqual({ q1: true, q2: "kept" });
  });
});

describe("navigation", () => {
  it("conversational next step skips hidden questions", () => {
    const f = fixture();
    const ordered = orderedQuestions(f);
    expect(nextStep(f, ordered, 0, { q1: false })).toBe(2); // q2 skipped
    expect(nextStep(f, ordered, 0, { q1: true })).toBe(1);
    expect(nextStep(f, ordered, 2, {})).toBe(3); // end
  });
  it("goto_section jumps forward to the target section", () => {
    const f = fixture();
    f.questions[0]!.rules = [{ id: "g", combinator: "and", conditions: [{ questionId: "q1", operator: "equals", value: false }], action: { type: "goto_section", sectionId: "s2" } }];
    const ordered = orderedQuestions(f);
    expect(nextStep(f, ordered, 0, { q1: false })).toBe(2);
    expect(nextStep(f, ordered, 0, { q1: true })).toBe(1);
  });
  it("classic pages split on page breaks and respect goto", () => {
    const f = fixture();
    const pages = buildPages(f);
    expect(pages).toEqual([["s1"], ["s2"]]);
    f.questions[0]!.rules = [{ id: "g", combinator: "and", conditions: [{ questionId: "q1", operator: "is_answered" }], action: { type: "goto_section", sectionId: "s2" } }];
    expect(nextPage(f, pages, 0, { q1: true })).toBe(1);
  });
});

describe("validation of visible questions only", () => {
  it("required hidden questions are not enforced; required visible ones are", () => {
    const f = fixture();
    f.questions[2]!.rules = [{ id: "h", combinator: "and", conditions: [{ questionId: "q1", operator: "equals", value: false }], action: { type: "hide" } }];
    expect(validateVisible(f.questions, { q1: false })).toEqual({});
    expect(validateVisible(f.questions, { q1: true })).toEqual({ q3: "This question is required" });
  });
  it("the fixture is a valid canonical form", () => {
    expect(FormSchema.safeParse(fixture()).success).toBe(true);
  });
});
