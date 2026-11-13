import { Plus, Trash2 } from "lucide-react";
import { OPERATORS, type FormDefinition, type Question, type Rule } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { getField } from "@/fields/registry";
import { newId } from "../factory";

type Condition = Rule["conditions"][number];
const OP_LABEL: Record<(typeof OPERATORS)[number], string> = {
  equals: "is", not_equals: "is not", contains: "contains", greater_than: "is greater than", less_than: "is less than", is_answered: "is answered", is_empty: "is empty",
};
const NUMERIC = new Set(["number", "currency", "star_rating", "linear_scale", "opinion_scale"]);
const BOOL = new Set(["yes_no", "toggle"]);
function operatorsFor(q: Question | undefined) {
  if (!q) return OPERATORS;
  if (NUMERIC.has(q.type)) return ["equals", "not_equals", "greater_than", "less_than", "is_answered", "is_empty"] as const;
  if (BOOL.has(q.type) || q.type === "single_choice" || q.type === "dropdown") return ["equals", "not_equals", "is_answered", "is_empty"] as const;
  if (q.type === "multiple_choice") return ["contains", "not_equals", "is_answered", "is_empty"] as const;
  return ["equals", "not_equals", "contains", "is_answered", "is_empty"] as const;
}
const defaultValue = (q: Question | undefined): Condition["value"] =>
  !q ? "" : BOOL.has(q.type) ? true : NUMERIC.has(q.type) ? 0 : q.options?.[0]?.value ?? "";

function ValueInput({ target, c, onChange }: { target: Question | undefined; c: Condition; onChange: (v: Condition["value"]) => void }) {
  if (c.operator === "is_answered" || c.operator === "is_empty") return null;
  if (target && BOOL.has(target.type)) return (
    <NativeSelect aria-label="Value" value={String(c.value)} onChange={e => onChange(e.target.value === "true")}>
      <option value="true">{target.type === "yes_no" ? "Yes" : "On"}</option><option value="false">{target.type === "yes_no" ? "No" : "Off"}</option>
    </NativeSelect>
  );
  if (target?.options?.length) return (
    <NativeSelect aria-label="Value" value={String(c.value ?? "")} onChange={e => onChange(e.target.value)}>
      {target.options.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}
    </NativeSelect>
  );
  if (target && NUMERIC.has(target.type)) return <Input aria-label="Value" type="number" value={typeof c.value === "number" ? c.value : ""} onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />;
  return <Input aria-label="Value" value={typeof c.value === "string" ? c.value : ""} maxLength={200} onChange={e => onChange(e.target.value)} />;
}

/** Conditional logic for one question: show/hide it, or jump to a section after it. Data only — evaluated by the shared condition engine. */
export function RulesEditor({ form, question, onChange }: { form: FormDefinition; question: Question; onChange: (rules: Rule[]) => void }) {
  const sources = form.questions.filter(q => !getField(q.type).isContent);
  const rules = question.rules;
  const setRule = (i: number, r: Rule) => onChange(rules.map((x, j) => (i === j ? r : x)));
  const newCondition = (): Condition | null => {
    const src = sources.find(q => q.id !== question.id) ?? sources[0];
    return src ? { questionId: src.id, operator: operatorsFor(src)[0], value: defaultValue(src) } : null;
  };

  return (
    <div className="space-y-3">
      {rules.length === 0 && <p className="text-xs text-muted-foreground">No rules. This question is always shown.</p>}
      {rules.map((r, i) => (
        <div key={r.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <NativeSelect aria-label="Rule action" value={r.action.type === "goto_section" ? `goto:${r.action.sectionId}` : r.action.type}
              onChange={e => {
                const v = e.target.value;
                setRule(i, { ...r, action: v.startsWith("goto:") ? { type: "goto_section", sectionId: v.slice(5) } : { type: v as "show" | "hide" } });
              }}>
              <option value="show">Show this question if…</option>
              <option value="hide">Hide this question if…</option>
              {form.sections.map((s, si) => <option key={s.id} value={`goto:${s.id}`}>After this, jump to “{s.title || `Section ${si + 1}`}” if…</option>)}
            </NativeSelect>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" aria-label={`Delete rule ${i + 1}`} onClick={() => onChange(rules.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {r.conditions.map((c, ci) => {
            const target = form.questions.find(q => q.id === c.questionId);
            const ops = operatorsFor(target);
            const setCond = (patch: Partial<Condition>) => setRule(i, { ...r, conditions: r.conditions.map((x, j) => (j === ci ? { ...x, ...patch } : x)) });
            return (
              <div key={ci} className="space-y-1.5 border-l-2 border-primary/30 pl-2">
                {ci > 0 && (
                  <NativeSelect aria-label="Combine conditions with" value={r.combinator} className="h-8 w-24 text-xs" onChange={e => setRule(i, { ...r, combinator: e.target.value as "and" | "or" })}>
                    <option value="and">AND</option><option value="or">OR</option>
                  </NativeSelect>
                )}
                <NativeSelect aria-label="Question" value={c.questionId} onChange={e => {
                  const t = form.questions.find(q => q.id === e.target.value);
                  setCond({ questionId: e.target.value, operator: operatorsFor(t)[0], value: defaultValue(t) });
                }}>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.label || "(untitled)"}{s.id === question.id ? " (this question)" : ""}</option>)}
                </NativeSelect>
                <div className="flex gap-1.5">
                  <NativeSelect aria-label="Operator" value={c.operator} onChange={e => {
                    const op = e.target.value as Condition["operator"];
                    setCond(op === "is_answered" || op === "is_empty" ? { operator: op, value: undefined } : { operator: op, value: c.value ?? defaultValue(target) });
                  }}>
                    {ops.map(o => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </NativeSelect>
                  {r.conditions.length > 1 && <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Remove condition" onClick={() => setRule(i, { ...r, conditions: r.conditions.filter((_, j) => j !== ci) })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
                <ValueInput target={target} c={c} onChange={value => setCond({ value })} />
              </div>
            );
          })}
          {r.conditions.length < 20 && (
            <Button variant="ghost" size="sm" onClick={() => { const c = newCondition(); if (c) setRule(i, { ...r, conditions: [...r.conditions, c] }); }}><Plus className="h-3.5 w-3.5" /> Add condition</Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" disabled={sources.length === 0}
        onClick={() => { const c = newCondition(); if (c) onChange([...rules, { id: newId("r"), combinator: "and", conditions: [c], action: { type: "show" } }]); }}>
        <Plus className="h-4 w-4" /> Add rule
      </Button>
      {sources.length === 0 && <p className="text-xs text-muted-foreground">Add a question first; rules depend on answers.</p>}
    </div>
  );
}
