import type { FieldType, FormDefinition, Question } from "@/schema/form";
import { convertQuestion, newId } from "./factory";

type Section = FormDefinition["sections"][number];
type Theme = FormDefinition["theme"];
type Screen = NonNullable<FormDefinition["welcomeScreen"]>;

export type BuilderAction =
  | { type: "set_meta"; patch: Partial<Pick<FormDefinition, "title" | "description" | "layout">> }
  | { type: "set_theme"; patch: Partial<Theme> }
  | { type: "set_screen"; screen: "welcomeScreen" | "completionScreen"; value: Screen | undefined }
  | { type: "add_question"; question: Question; index?: number }
  | { type: "update_question"; id: string; patch: Partial<Omit<Question, "id">> }
  | { type: "change_type"; id: string; fieldType: FieldType }
  | { type: "delete_question"; id: string }
  | { type: "duplicate_question"; id: string; newId: string }
  | { type: "move_question"; id: string; toSectionId: string; toIndex: number }
  | { type: "add_section"; section: Section; afterId?: string }
  | { type: "update_section"; id: string; patch: Partial<Omit<Section, "id">> }
  | { type: "delete_section"; id: string }
  | { type: "move_section"; id: string; toIndex: number }
  | { type: "replace"; form: FormDefinition };

export const questionsIn = (f: FormDefinition, sectionId: string) => f.questions.filter(q => q.sectionId === sectionId);

/** Insert q so it becomes the `index`-th question of its section (questions are stored as one ordered array). */
function insertInSection(list: Question[], q: Question, index: number | undefined): Question[] {
  const inSection = list.filter(x => x.sectionId === q.sectionId);
  if (index === undefined || index >= inSection.length) {
    const last = inSection[inSection.length - 1];
    if (!last) return [...list, q];
    const at = list.indexOf(last) + 1;
    return [...list.slice(0, at), q, ...list.slice(at)];
  }
  const at = list.indexOf(inSection[Math.max(0, index)]!);
  return [...list.slice(0, at), q, ...list.slice(at)];
}

/** Remove conditions that point at removed questions and rules that jump to removed sections. */
function pruneRules(questions: Question[], sectionIds: Set<string>): Question[] {
  const ids = new Set(questions.map(q => q.id));
  return questions.map(q => {
    const rules = q.rules
      .map(r => ({ ...r, conditions: r.conditions.filter(c => ids.has(c.questionId)) }))
      .filter(r => r.conditions.length > 0 && (r.action.type !== "goto_section" || sectionIds.has(r.action.sectionId)));
    return rules.length === q.rules.length && rules.every((r, i) => r.conditions.length === q.rules[i]!.conditions.length) ? q : { ...q, rules };
  });
}

export function formReducer(f: FormDefinition, a: BuilderAction): FormDefinition {
  switch (a.type) {
    case "set_meta": return { ...f, ...a.patch };
    case "set_theme": return { ...f, theme: { ...f.theme, ...a.patch } };
    case "set_screen": {
      if (a.screen === "welcomeScreen") {
        const rest: FormDefinition = { ...f };
        delete rest.welcomeScreen;
        return a.value ? { ...rest, welcomeScreen: a.value } : rest;
      }
      return { ...f, completionScreen: a.value ?? { title: "Thank you!" } };
    }
    case "add_question": {
      if (!f.sections.some(s => s.id === a.question.sectionId)) return f;
      return { ...f, questions: insertInSection(f.questions, a.question, a.index) };
    }
    case "update_question":
      return { ...f, questions: f.questions.map(q => (q.id === a.id ? { ...q, ...a.patch, id: q.id } : q)) };
    case "change_type":
      return { ...f, questions: f.questions.map(q => (q.id === a.id ? convertQuestion(q, a.fieldType) : q)) };
    case "delete_question":
      if (!f.questions.some(q => q.id === a.id)) return f;
      return { ...f, questions: pruneRules(f.questions.filter(q => q.id !== a.id), new Set(f.sections.map(s => s.id))) };
    case "duplicate_question": {
      const i = f.questions.findIndex(q => q.id === a.id);
      if (i < 0) return f;
      const src = f.questions[i]!;
      const copy: Question = {
        ...structuredClone(src), id: a.newId,
        label: src.label ? `${src.label} (copy)`.slice(0, 500) : src.label,
        options: src.options?.map(o => ({ ...o, id: newId("o") })),
        rules: src.rules.map(r => ({ ...structuredClone(r), id: newId("r") })),
      };
      if (!copy.options) delete copy.options;
      return { ...f, questions: [...f.questions.slice(0, i + 1), copy, ...f.questions.slice(i + 1)] };
    }
    case "move_question": {
      const q = f.questions.find(x => x.id === a.id);
      if (!q || !f.sections.some(s => s.id === a.toSectionId)) return f;
      const rest = f.questions.filter(x => x.id !== a.id);
      return { ...f, questions: insertInSection(rest, { ...q, sectionId: a.toSectionId }, a.toIndex) };
    }
    case "add_section": {
      const i = a.afterId ? f.sections.findIndex(s => s.id === a.afterId) : f.sections.length - 1;
      return { ...f, sections: [...f.sections.slice(0, i + 1), a.section, ...f.sections.slice(i + 1)] };
    }
    case "update_section":
      return { ...f, sections: f.sections.map(s => (s.id === a.id ? { ...s, ...a.patch, id: s.id } : s)) };
    case "delete_section": {
      if (f.sections.length <= 1) return f;
      const i = f.sections.findIndex(s => s.id === a.id);
      if (i < 0) return f;
      const target = f.sections[i === 0 ? 1 : i - 1]!.id;
      const sections = f.sections.filter(s => s.id !== a.id);
      // Keep the moved questions after the target section's own questions.
      const moved = f.questions.filter(q => q.sectionId === a.id).map(q => ({ ...q, sectionId: target }));
      let questions = f.questions.filter(q => q.sectionId !== a.id);
      for (const q of moved) questions = insertInSection(questions, q, undefined);
      return { ...f, sections, questions: pruneRules(questions, new Set(sections.map(s => s.id))) };
    }
    case "move_section": {
      const s = f.sections.find(x => x.id === a.id);
      if (!s) return f;
      const rest = f.sections.filter(x => x.id !== a.id);
      const to = Math.max(0, Math.min(a.toIndex, rest.length));
      return { ...f, sections: [...rest.slice(0, to), s, ...rest.slice(to)] };
    }
    case "replace": return a.form;
  }
}

// ------------------------------------------------------------ undo / redo
export interface History { past: FormDefinition[]; present: FormDefinition; future: FormDefinition[]; lastKey?: string; lastAt?: number }
export type HistoryAction = { type: "do"; action: BuilderAction; at?: number } | { type: "undo" } | { type: "redo" } | { type: "reset"; form: FormDefinition };

const LIMIT = 100;
const COALESCE_MS = 1000;

/** Typing into one field produces one undo step, not one per keystroke. */
function coalesceKey(a: BuilderAction): string | undefined {
  switch (a.type) {
    case "set_meta": return `meta:${Object.keys(a.patch).join(",")}`;
    case "set_theme": return `theme:${Object.keys(a.patch).join(",")}`;
    case "set_screen": return `screen:${a.screen}`;
    case "update_question": return `q:${a.id}:${Object.keys(a.patch).sort().join(",")}`;
    case "update_section": return `s:${a.id}:${Object.keys(a.patch).sort().join(",")}`;
    default: return undefined;
  }
}

export const initHistory = (form: FormDefinition): History => ({ past: [], present: form, future: [] });

export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "reset": return initHistory(a.form);
    case "undo": {
      const prev = h.past[h.past.length - 1];
      return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
    }
    case "redo": {
      const next = h.future[0];
      return next ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) } : h;
    }
    case "do": {
      const next = formReducer(h.present, a.action);
      if (next === h.present) return h;
      const at = a.at ?? Date.now();
      const key = coalesceKey(a.action);
      const merge = key !== undefined && key === h.lastKey && h.lastAt !== undefined && at - h.lastAt < COALESCE_MS && h.past.length > 0;
      return {
        past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
        present: next, future: [], lastKey: key, lastAt: at,
      };
    }
  }
}
