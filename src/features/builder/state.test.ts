import { describe, it, expect } from "vitest";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { blankForm, createQuestion, uniqueSlug, slugify } from "./factory";
import { formReducer, historyReducer, initHistory, questionsIn, type BuilderAction } from "./state";

function setup() {
  let f = blankForm("Test");
  const s1 = f.sections[0]!.id;
  const a = createQuestion("short_text", s1), b = createQuestion("yes_no", s1), c = createQuestion("email", s1);
  f = [a, b, c].reduce((acc, question) => formReducer(acc, { type: "add_question", question }), f);
  return { f, s1, a, b, c };
}
const ids = (f: FormDefinition, s: string) => questionsIn(f, s).map(q => q.id);
const valid = (f: FormDefinition) => expect(FormSchema.safeParse(f).success).toBe(true);

describe("question operations", () => {
  it("adds at an index, edits, duplicates and deletes", () => {
    const { f: f0, s1, a, b, c } = setup();
    let f = f0;
    const d = createQuestion("number", s1);
    f = formReducer(f, { type: "add_question", question: d, index: 1 });
    expect(ids(f, s1)).toEqual([a.id, d.id, b.id, c.id]);
    f = formReducer(f, { type: "update_question", id: d.id, patch: { label: "Age", required: true } });
    expect(f.questions.find(q => q.id === d.id)).toMatchObject({ label: "Age", required: true });
    f = formReducer(f, { type: "duplicate_question", id: d.id, newId: "q_copy" });
    expect(ids(f, s1)).toEqual([a.id, d.id, "q_copy", b.id, c.id]);
    expect(f.questions.find(q => q.id === "q_copy")!.label).toBe("Age (copy)");
    f = formReducer(f, { type: "delete_question", id: d.id });
    expect(ids(f, s1)).toEqual([a.id, "q_copy", b.id, c.id]);
    valid(f);
  });
  it("reorders within and across sections", () => {
    const { f: f0, s1, a, b, c } = setup();
    let f = f0;
    f = formReducer(f, { type: "move_question", id: c.id, toSectionId: s1, toIndex: 0 });
    expect(ids(f, s1)).toEqual([c.id, a.id, b.id]);
    f = formReducer(f, { type: "add_section", section: { id: "s2", title: "Two", pageBreakAfter: false } });
    f = formReducer(f, { type: "move_question", id: a.id, toSectionId: "s2", toIndex: 0 });
    expect(ids(f, s1)).toEqual([c.id, b.id]);
    expect(ids(f, "s2")).toEqual([a.id]);
    valid(f);
  });
  it("changes type and keeps the schema valid", () => {
    const { f: f0, b } = setup();
    let f = f0;
    f = formReducer(f, { type: "change_type", id: b.id, fieldType: "multiple_choice" });
    const q = f.questions.find(x => x.id === b.id)!;
    expect(q.type).toBe("multiple_choice");
    expect(q.options!.length).toBeGreaterThan(0);
    valid(f);
  });
  it("deleting a question removes rules that depended on it", () => {
    const { f: f0, a, b } = setup();
    let f = f0;
    f = formReducer(f, { type: "update_question", id: a.id, patch: { rules: [{ id: "r1", combinator: "and", conditions: [{ questionId: b.id, operator: "equals", value: true }], action: { type: "show" } }] } });
    f = formReducer(f, { type: "delete_question", id: b.id });
    expect(f.questions.find(q => q.id === a.id)!.rules).toEqual([]);
    valid(f);
  });
});

describe("sections and page breaks", () => {
  it("adds, renames, moves, toggles page breaks and deletes (merging questions)", () => {
    const { f: f0, s1, a } = setup();
    let f = f0;
    f = formReducer(f, { type: "add_section", section: { id: "s2", title: "", pageBreakAfter: false }, afterId: s1 });
    f = formReducer(f, { type: "update_section", id: s1, patch: { title: "Intro", pageBreakAfter: true } });
    f = formReducer(f, { type: "move_question", id: a.id, toSectionId: "s2", toIndex: 0 });
    f = formReducer(f, { type: "move_section", id: "s2", toIndex: 0 });
    expect(f.sections.map(s => s.id)).toEqual(["s2", s1]);
    expect(f.sections[1]).toMatchObject({ title: "Intro", pageBreakAfter: true });
    f = formReducer(f, { type: "delete_section", id: "s2" });
    expect(f.sections.map(s => s.id)).toEqual([s1]);
    expect(questionsIn(f, s1).map(q => q.id)).toContain(a.id);
    valid(f);
  });
  it("never deletes the last section, and prunes goto rules to deleted sections", () => {
    const { f: f0, s1, a, b } = setup();
    let f = f0;
    expect(formReducer(f, { type: "delete_section", id: s1 })).toBe(f);
    f = formReducer(f, { type: "add_section", section: { id: "s2", title: "", pageBreakAfter: false } });
    f = formReducer(f, { type: "update_question", id: b.id, patch: { rules: [{ id: "r", combinator: "or", conditions: [{ questionId: a.id, operator: "is_answered" }], action: { type: "goto_section", sectionId: "s2" } }] } });
    f = formReducer(f, { type: "delete_section", id: "s2" });
    expect(f.questions.find(q => q.id === b.id)!.rules).toEqual([]);
    valid(f);
  });
});

describe("theme, screens and meta", () => {
  it("updates theme and screens through the canonical schema", () => {
    const { f: f0 } = setup();
    let f = f0;
    f = formReducer(f, { type: "set_theme", patch: { primary: "#ff0000", buttonStyle: "pill" } });
    f = formReducer(f, { type: "set_screen", screen: "welcomeScreen", value: { title: "Hi", buttonLabel: "Go" } });
    f = formReducer(f, { type: "set_meta", patch: { layout: "classic" } });
    valid(f);
    expect(FormSchema.parse(f).theme).toMatchObject({ primary: "#ff0000", buttonStyle: "pill" });
    f = formReducer(f, { type: "set_screen", screen: "welcomeScreen", value: undefined });
    expect("welcomeScreen" in f).toBe(false);
  });
});

describe("undo / redo", () => {
  it("undoes and redoes structural edits", () => {
    const { f, s1 } = setup();
    let h = initHistory(f);
    const q = createQuestion("date", s1);
    h = historyReducer(h, { type: "do", action: { type: "add_question", question: q } });
    expect(h.present.questions).toHaveLength(4);
    h = historyReducer(h, { type: "undo" });
    expect(h.present.questions).toHaveLength(3);
    h = historyReducer(h, { type: "redo" });
    expect(h.present.questions).toHaveLength(4);
  });
  it("coalesces rapid typing into a single undo step", () => {
    const { f, a } = setup();
    let h = initHistory(f);
    const type = (label: string): BuilderAction => ({ type: "update_question", id: a.id, patch: { label } });
    h = historyReducer(h, { type: "do", action: type("H"), at: 0 });
    h = historyReducer(h, { type: "do", action: type("He"), at: 200 });
    h = historyReducer(h, { type: "do", action: type("Hel"), at: 400 });
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: "do", action: type("Hello"), at: 3000 });
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: "undo" });
    expect(h.present.questions[0]!.label).toBe("Hel");
  });
  it("a new edit clears the redo stack; no-op actions are not recorded", () => {
    const { f } = setup();
    let h = initHistory(f);
    h = historyReducer(h, { type: "do", action: { type: "set_meta", patch: { title: "A" } } });
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "do", action: { type: "set_meta", patch: { layout: "classic" } } });
    expect(h.future).toEqual([]);
    const before = h;
    expect(historyReducer(h, { type: "do", action: { type: "delete_question", id: "nope" } })).toBe(before);
  });
});

describe("slugs", () => {
  it("produces DB-valid slugs", () => {
    const re = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const t of ["Client Intake!", "", "a", "Ünïcödé form", "x".repeat(200), "--weird--"]) {
      const s = uniqueSlug(t);
      expect(s, t).toMatch(re);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(64);
    }
    expect(slugify("Client Intake")).toBe("client-intake");
  });
});
