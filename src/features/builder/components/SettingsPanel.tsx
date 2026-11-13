import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { FieldType, Question } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { getField, resolveConfig, fieldsByCategory } from "@/fields/registry";
import { fieldUi } from "@/fields/ui";
import { Row, SwitchRow } from "@/fields/ui/editors";
import { useBuilder } from "../context";
import { OptionsEditor } from "./OptionsEditor";
import { RulesEditor } from "./RulesEditor";
import { FormSettings } from "./FormSettings";

const num = (v: string) => (v === "" ? undefined : Number(v));

function ValidationEditor({ q, update }: { q: Question; update: (p: Partial<Question>) => void }) {
  const keys = getField(q.type).validationKeys;
  const v = q.validation;
  const set = (patch: Partial<Question["validation"]>) => {
    const next = { ...v, ...patch };
    (Object.keys(next) as (keyof typeof next)[]).forEach(k => next[k] === undefined && delete next[k]);
    update({ validation: next });
  };
  const has = (k: string) => (keys as readonly string[]).includes(k);
  if (!keys.length || keys.every(k => ["allowedMimeTypes", "maxFileSizeMb", "maxFiles"].includes(k))) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Validation</h3>
      {has("minLength") && (
        <div className="grid grid-cols-2 gap-3">
          <Row label="Min characters">{id => <Input id={id} type="number" min={0} value={v.minLength ?? ""} onChange={e => set({ minLength: num(e.target.value) })} />}</Row>
          <Row label="Max characters">{id => <Input id={id} type="number" min={1} value={v.maxLength ?? ""} onChange={e => set({ maxLength: num(e.target.value) || undefined })} />}</Row>
        </div>
      )}
      {has("pattern") && (
        <>
          <Row label="Pattern (regular expression)" hint="Optional. Example: ^[A-Z]{2}\d{4}$">{id => <Input id={id} className="font-mono" maxLength={300} value={v.pattern ?? ""} onChange={e => set({ pattern: e.target.value || undefined })} />}</Row>
          {v.pattern && <Row label="Error message for pattern">{id => <Input id={id} maxLength={200} value={v.patternMessage ?? ""} onChange={e => set({ patternMessage: e.target.value || undefined })} />}</Row>}
        </>
      )}
      {has("min") && (
        <div className="grid grid-cols-2 gap-3">
          <Row label="Minimum">{id => <Input id={id} type="number" value={v.min ?? ""} onChange={e => set({ min: num(e.target.value) })} />}</Row>
          <Row label="Maximum">{id => <Input id={id} type="number" value={v.max ?? ""} onChange={e => set({ max: num(e.target.value) })} />}</Row>
        </div>
      )}
      {has("minSelections") && (
        <div className="grid grid-cols-2 gap-3">
          <Row label="Min selections">{id => <Input id={id} type="number" min={0} value={v.minSelections ?? ""} onChange={e => set({ minSelections: num(e.target.value) })} />}</Row>
          <Row label="Max selections">{id => <Input id={id} type="number" min={1} value={v.maxSelections ?? ""} onChange={e => set({ maxSelections: num(e.target.value) || undefined })} />}</Row>
        </div>
      )}
    </section>
  );
}

function QuestionSettings({ q }: { q: Question }) {
  const { form, dispatch, select } = useBuilder();
  const def = getField(q.type);
  const ui = fieldUi[q.type];
  const update = (patch: Partial<Omit<Question, "id">>) => dispatch({ type: "update_question", id: q.id, patch });
  const config = resolveConfig(q);
  const Editor = ui.ConfigEditor;
  const [tab, setTab] = useState<"settings" | "logic">("settings");
  useEffect(() => setTab("settings"), [q.id]);

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ui.icon className="h-4 w-4 text-primary" aria-hidden="true" /> {def.label}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close question settings" onClick={() => select(null)}><X className="h-4 w-4" /></Button>
      </div>
      <div role="tablist" aria-label="Question settings sections" className="grid grid-cols-2 rounded-md bg-muted p-1 text-sm">
        {(["settings", "logic"] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded px-2 py-1 font-medium ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {t === "settings" ? "Settings" : `Logic${q.rules.length ? ` (${q.rules.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "logic" ? <RulesEditor form={form} question={q} onChange={rules => update({ rules })} /> : (
        <>
          <Row label="Field type">{id => (
            <NativeSelect id={id} value={q.type} onChange={e => dispatch({ type: "change_type", id: q.id, fieldType: e.target.value as FieldType })}>
              {fieldsByCategory.map(c => <optgroup key={c.id} label={c.label}>{c.fields.map(f => <option key={f.type} value={f.type}>{f.label}</option>)}</optgroup>)}
            </NativeSelect>)}</Row>
          {q.type !== "divider" && (
            <Row label={def.isContent ? (q.type === "heading" ? "Heading text" : "Title / caption") : "Question"}>{id => (
              <Textarea id={id} rows={2} maxLength={500} value={q.label} onChange={e => update({ label: e.target.value })} />)}</Row>
          )}
          {q.type !== "divider" && q.type !== "image" && (
            <Row label={q.type === "description" ? "Text" : "Description (optional)"}>{id => (
              <Textarea id={id} rows={q.type === "description" ? 5 : 2} maxLength={2000} value={q.description ?? ""} onChange={e => update({ description: e.target.value || undefined })} />)}</Row>
          )}
          {def.supportsPlaceholder && <Row label="Placeholder">{id => <Input id={id} maxLength={200} value={q.placeholder ?? ""} onChange={e => update({ placeholder: e.target.value || undefined })} />}</Row>}
          {!def.isContent && <SwitchRow label="Required" checked={q.required} onChange={required => update({ required })} />}
          {def.hasOptions && <OptionsEditor question={q} onChange={options => update({ options })} />}
          {Editor && <section className="space-y-3"><h3 className="text-sm font-semibold">{def.label} settings</h3><Editor question={q} config={config} update={update} setConfig={patch => update({ config: { ...config, ...patch } })} /></section>}
          <ValidationEditor q={q} update={update} />
          {q.aiNotes && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">Review note</p><p className="mt-1">{q.aiNotes}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => update({ aiNotes: undefined })}>Mark as reviewed</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Right panel: settings for the selected question, or form-level settings. */
export function SettingsPanel({ formId, slug }: { formId: string; slug: string }) {
  const { form, selectedId } = useBuilder();
  const q = selectedId ? form.questions.find(x => x.id === selectedId) : undefined;
  return q ? <QuestionSettings key={q.id} q={q} /> : <FormSettings formId={formId} slug={slug} />;
}

