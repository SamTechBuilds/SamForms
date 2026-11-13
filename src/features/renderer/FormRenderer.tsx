import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import type { FormDefinition, Question } from "@/schema/form";
import type { Answers } from "@/schema/conditions";
import { getField, resolveConfig } from "@/fields/registry";
import { fieldUi, ContentBlock } from "@/fields/ui";
import { isAnswered } from "@/fields/answers";
import { themeToCssVars } from "@/features/themes/theme";
import { buildPages, effectiveAnswers, isVisible, nextPage, nextStep, orderedQuestions, validateVisible } from "./logic";

export interface FormRendererProps {
  form: FormDefinition;
  /** Called with the effective (visible-only) answers. Preview passes nothing: no data leaves the browser. */
  onSubmit?: (answers: Answers) => Promise<void> | void;
  previewNotice?: string;
  className?: string;
}

export function QuestionBlock({ q, value, error, onChange, autoFocus }: { q: Question; value: unknown; error?: string; onChange: (v: unknown) => void; autoFocus?: boolean }) {
  const def = getField(q.type);
  const config = resolveConfig(q);
  if (def.isContent) return <ContentBlock question={q} config={config} />;
  const Input = fieldUi[q.type].Input!;
  const id = `sf-${q.id}`;
  const descId = q.description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const groupLike = ["single_choice", "multiple_choice", "yes_no", "star_rating", "linear_scale", "opinion_scale"].includes(q.type);
  const LabelTag = groupLike ? "p" : "label";
  return (
    <div data-autofocus={autoFocus || undefined}>
      <LabelTag id={`${id}-label`} {...(groupLike ? {} : { htmlFor: id })} className="mb-1 block text-lg font-medium">
        {q.label || <span className="sf-muted italic">Untitled question</span>}
        {q.required && <span aria-hidden="true" style={{ color: "var(--sf-primary)" }}> *</span>}
        {q.required && <span className="sr-only"> (required)</span>}
      </LabelTag>
      {q.description && <p id={descId} className="sf-muted mb-3 whitespace-pre-line text-sm">{q.description}</p>}
      <div className={q.description ? "" : "mt-2"}>
        <Input question={q} config={config} value={value} onChange={onChange} inputId={id} describedBy={[descId, errId].filter(Boolean).join(" ") || undefined} invalid={Boolean(error)} />
      </div>
      {error && <p id={errId} role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

function Progress({ form, value, steps }: { form: FormDefinition; value: number; steps?: { current: number; total: number } }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  if (form.theme.progress === "none") return null;
  if (form.theme.progress === "percent") return <p className="sf-muted text-sm" aria-live="polite">{pct}% complete</p>;
  if (form.theme.progress === "steps" && steps) return <p className="sf-muted text-sm" aria-live="polite">Step {Math.min(steps.current, steps.total)} of {steps.total}</p>;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Form progress" className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--sf-primary) 18%, transparent)" }}>
      <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: "var(--sf-primary)" }} />
    </div>
  );
}

/**
 * Renders a canonical FormDefinition in conversational or classic layout, applying the theme,
 * conditional logic, validation and welcome/completion screens. Used by the builder preview
 * (no submission) and designed to be reused by the Phase 3 public form page.
 */
export function FormRenderer({ form, onSubmit, previewNotice, className }: FormRendererProps) {
  const [phase, setPhase] = useState<"welcome" | "form" | "done">(form.welcomeScreen ? "welcome" : "form");
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [page, setPage] = useState(0);
  const [trail, setTrail] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const ordered = useMemo(() => orderedQuestions(form), [form]);
  const pages = useMemo(() => buildPages(form), [form]);
  const inputs = ordered.filter(q => !getField(q.type).isContent && isVisible(q, answers));
  const answeredCount = inputs.filter(q => isAnswered(answers[q.id])).length;

  const set = (id: string, v: unknown) => {
    setAnswers(a => { const n = { ...a }; if (v === undefined) delete n[id]; else n[id] = v; return n; });
    setErrors(e => { if (!e[id]) return e; const n = { ...e }; delete n[id]; return n; });
  };
  const restart = () => { setAnswers({}); setErrors({}); setStep(0); setPage(0); setTrail([]); setSubmitError(null); setPhase(form.welcomeScreen ? "welcome" : "form"); };

  async function finish() {
    setSubmitting(true); setSubmitError(null);
    try { await onSubmit?.(effectiveAnswers(form, answers)); setPhase("done"); }
    catch (e) { setSubmitError(e instanceof Error ? e.message : "Submission failed. Please try again."); }
    finally { setSubmitting(false); }
  }

  const rootProps = {
    className: `sf-root min-h-full ${className ?? ""}`,
    style: themeToCssVars(form.theme),
    "data-input": form.theme.inputStyle,
    "data-button": form.theme.buttonStyle,
  };
  const notice = previewNotice && <div className="sf-muted border-b px-4 py-2 text-center text-xs" style={{ borderColor: "color-mix(in srgb, var(--sf-fg) 12%, transparent)" }}>{previewNotice}</div>;
  const shell = (children: ReactNode) => <div {...rootProps}>{notice}<div className="mx-auto flex min-h-[28rem] w-full max-w-2xl flex-col px-5 py-10 sm:px-8">{children}</div></div>;

  if (phase === "welcome" && form.welcomeScreen) {
    const w = form.welcomeScreen;
    return shell(
      <div className="sf-animate-in my-auto text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">{w.title}</h1>
        {w.message && <p className="sf-muted mx-auto mt-4 max-w-lg whitespace-pre-line">{w.message}</p>}
        <button type="button" className="sf-btn mt-8" onClick={() => setPhase("form")}>{w.buttonLabel || "Start"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>,
    );
  }

  if (phase === "done") {
    const c = form.completionScreen;
    return shell(
      <div className="sf-animate-in my-auto text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}><Check className="h-7 w-7" aria-hidden="true" /></div>
        <h1 className="text-3xl font-semibold">{c.title}</h1>
        {c.message && <p className="sf-muted mx-auto mt-4 max-w-lg whitespace-pre-line">{c.message}</p>}
        {c.redirectUrl && <p className="sf-muted mt-4 text-sm">Respondents will be redirected to {c.redirectUrl}{previewNotice ? " (not in preview)" : ""}.</p>}
        {c.buttonLabel && c.redirectUrl && !previewNotice && <a className="sf-btn mt-6" href={c.redirectUrl} rel="noopener noreferrer">{c.buttonLabel}</a>}
        {previewNotice && <button type="button" className="sf-btn sf-btn-ghost mt-8" onClick={restart}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restart preview</button>}
      </div>,
    );
  }

  if (ordered.length === 0) return shell(<p className="sf-muted my-auto text-center">This form has no questions yet.</p>);

  // ------------------------------------------------------------ classic
  if (form.layout === "classic") {
    const pageSections = form.sections.filter(s => pages[page]!.includes(s.id));
    const pageQs = form.questions.filter(q => pages[page]!.includes(q.sectionId));
    const isLast = nextPage(form, pages, page, answers) >= pages.length;
    const advance = () => {
      const errs = validateVisible(pageQs, answers);
      setErrors(errs);
      if (Object.keys(errs).length) { document.getElementById(`sf-${Object.keys(errs)[0]}`)?.focus(); return; }
      if (isLast) return void finish();
      setTrail(t => [...t, page]); setPage(nextPage(form, pages, page, answers));
    };
    return shell(
      <form noValidate onSubmit={e => { e.preventDefault(); advance(); }} className="flex flex-1 flex-col gap-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">{form.title}</h1>
          {form.description && page === 0 && <p className="sf-muted whitespace-pre-line">{form.description}</p>}
          {pages.length > 1 && <Progress form={form} value={(page + 1) / pages.length} steps={{ current: page + 1, total: pages.length }} />}
        </header>
        {pageSections.map(s => {
          const qs = pageQs.filter(q => q.sectionId === s.id && isVisible(q, answers));
          return (
            <section key={s.id} className="sf-animate-in space-y-7" aria-label={s.title || undefined}>
              {(s.title || s.description) && <div>{s.title && <h2 className="text-xl font-semibold">{s.title}</h2>}{s.description && <p className="sf-muted mt-1 text-sm">{s.description}</p>}</div>}
              {qs.map(q => <QuestionBlock key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={v => set(q.id, v)} />)}
            </section>
          );
        })}
        {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          {trail.length > 0 ? <button type="button" className="sf-btn sf-btn-ghost" onClick={() => { setPage(trail[trail.length - 1]!); setTrail(t => t.slice(0, -1)); setErrors({}); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button> : <span />}
          <button type="submit" className="sf-btn" disabled={submitting}>{isLast ? (submitting ? "Submitting…" : "Submit") : "Next"} {!isLast && <ArrowRight className="h-4 w-4" aria-hidden="true" />}</button>
        </div>
      </form>,
    );
  }

  // ------------------------------------------------------ conversational
  // Skip a step that became hidden (e.g. after going back and changing an answer).
  const current = step < ordered.length && !isVisible(ordered[step]!, answers) ? nextStep(form, ordered, step, answers) : step;
  const q = ordered[current];
  const isLast = q ? nextStep(form, ordered, current, answers) >= ordered.length : true;
  const goNext = () => {
    if (!q) return void finish();
    const errs = validateVisible([q], answers);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const n = nextStep(form, ordered, current, answers);
    if (n >= ordered.length) return void finish();
    setTrail(t => [...t, current]); setStep(n);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "SELECT") return;
    e.preventDefault(); goNext();
  };
  const section = q ? form.sections.find(s => s.id === q.sectionId) : undefined;
  const firstOfSection = q && ordered.findIndex(x => x.sectionId === q.sectionId) === current;
  const stepNo = inputs.findIndex(x => x.id === q?.id) + 1;
  return shell(
    <div className="flex flex-1 flex-col" onKeyDown={onKey}>
      <div className="mb-10"><Progress form={form} value={inputs.length ? answeredCount / inputs.length : 0} steps={{ current: Math.max(stepNo, 1), total: Math.max(inputs.length, 1) }} /></div>
      {q && (
        <div key={q.id} className="sf-animate-in my-auto space-y-6">
          {firstOfSection && section && (section.title || section.description) && (
            <div className="sf-muted text-sm"><p className="font-semibold uppercase tracking-wide">{section.title}</p>{section.description && <p className="mt-1">{section.description}</p>}</div>
          )}
          <QuestionBlock q={q} value={answers[q.id]} error={errors[q.id]} onChange={v => set(q.id, v)} />
          {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}
          <div className="flex items-center gap-3">
            <button type="button" className="sf-btn" onClick={goNext} disabled={submitting}>
              {isLast ? (submitting ? "Submitting…" : "Submit") : "OK"} {isLast ? <Check className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            {!isLast && <span className="sf-muted hidden text-xs sm:inline">press <kbd className="font-semibold">Enter ↵</kbd></span>}
          </div>
        </div>
      )}
      <div className="mt-10 flex justify-between">
        <button type="button" className="sf-btn sf-btn-ghost !px-3" aria-label="Previous question" disabled={trail.length === 0}
          onClick={() => { setStep(trail[trail.length - 1]!); setTrail(t => t.slice(0, -1)); setErrors({}); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" className="sf-btn sf-btn-ghost !px-3" aria-label="Next question" onClick={goNext} disabled={submitting}><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>,
  );
}
