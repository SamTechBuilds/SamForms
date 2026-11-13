import type { FormDefinition, Question } from "@/schema/form";
import { evalRule, type Answers } from "@/schema/conditions";
import { validateAnswer } from "@/fields/answers";

/**
 * Visibility: a question with "show" rules is visible only when at least one of them passes;
 * any passing "hide" rule hides it. Pure data evaluation via the shared condition engine
 * (never stored code). Hidden questions are skipped and their answers ignored.
 */
export function isVisible(q: Question, answers: Answers): boolean {
  const show = q.rules.filter(r => r.action.type === "show");
  const hide = q.rules.filter(r => r.action.type === "hide");
  if (hide.some(r => evalRule(r, answers))) return false;
  return show.length === 0 || show.some(r => evalRule(r, answers));
}

/** Answers of hidden questions are removed (iterated so chains of dependencies settle). */
export function effectiveAnswers(form: FormDefinition, answers: Answers): Answers {
  let cur = answers;
  for (let i = 0; i < 5; i++) {
    const next: Answers = {};
    for (const q of form.questions) if (cur[q.id] !== undefined && isVisible(q, cur)) next[q.id] = cur[q.id];
    if (Object.keys(next).length === Object.keys(cur).length) return next;
    cur = next;
  }
  return cur;
}

/** Section to jump to after answering q (last passing goto rule wins), if any. */
export function gotoTarget(q: Question, answers: Answers): string | undefined {
  let target: string | undefined;
  for (const r of q.rules) if (r.action.type === "goto_section" && evalRule(r, answers)) target = r.action.sectionId;
  return target;
}

/** Classic layout pages: consecutive sections, split after sections with pageBreakAfter. */
export function buildPages(form: FormDefinition): string[][] {
  const pages: string[][] = [[]];
  form.sections.forEach((s, i) => {
    pages[pages.length - 1]!.push(s.id);
    if (s.pageBreakAfter && i < form.sections.length - 1) pages.push([]);
  });
  return pages;
}

/** Ordered questions in section order (questions array order within each section). */
export function orderedQuestions(form: FormDefinition): Question[] {
  return form.sections.flatMap(s => form.questions.filter(q => q.sectionId === s.id));
}

export function validateVisible(questions: Question[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    if (!isVisible(q, answers)) continue;
    const r = validateAnswer(q, answers[q.id]);
    if (!r.ok) errors[q.id] = r.error;
  }
  return errors;
}

/** Conversational step after `current` (index into ordered), honouring goto rules and visibility. */
export function nextStep(form: FormDefinition, ordered: Question[], current: number, answers: Answers): number {
  const q = ordered[current];
  let start = current + 1;
  if (q) {
    const target = gotoTarget(q, answers);
    if (target) {
      const idx = ordered.findIndex(x => x.sectionId === target);
      if (idx >= 0) start = idx; // an empty target section falls through to the next section's questions
      else {
        const secIdx = form.sections.findIndex(s => s.id === target);
        const after = ordered.findIndex(x => form.sections.findIndex(s => s.id === x.sectionId) > secIdx);
        start = after >= 0 ? after : ordered.length;
      }
    }
  }
  for (let i = start; i < ordered.length; i++) if (isVisible(ordered[i]!, answers)) return i;
  return ordered.length; // end
}

export function nextPage(form: FormDefinition, pages: string[][], current: number, answers: Answers): number {
  const onPage = form.questions.filter(q => pages[current]!.includes(q.sectionId) && isVisible(q, answers));
  let target: string | undefined;
  for (const q of onPage) target = gotoTarget(q, answers) ?? target;
  if (target) {
    const p = pages.findIndex(pg => pg.includes(target!));
    if (p >= 0) return p;
  }
  return current + 1;
}
