import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { Row } from "@/fields/ui/editors";
import { updateSlug } from "@/features/forms/api";
import { publicFormPath } from "@/features/forms/links";
import { useBuilder } from "../context";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function FormSettings({ formId, slug }: { formId: string; slug: string }) {
  const { form, dispatch } = useBuilder();
  const qc = useQueryClient();
  const [slugDraft, setSlugDraft] = useState(slug);
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  useEffect(() => setSlugDraft(slug), [slug]);
  const slugValid = SLUG_RE.test(slugDraft) && slugDraft.length >= 3 && slugDraft.length <= 64;

  return (
    <div className="space-y-5 p-4">
      <h2 className="text-sm font-semibold">Form settings</h2>
      <p className="text-xs text-muted-foreground">Select a question on the canvas to edit it.</p>
      <Row label="Title">{id => <Input id={id} maxLength={200} value={form.title} onChange={e => dispatch({ type: "set_meta", patch: { title: e.target.value } })} />}</Row>
      <Row label="Description">{id => <Textarea id={id} rows={3} maxLength={2000} value={form.description ?? ""} onChange={e => dispatch({ type: "set_meta", patch: { description: e.target.value || undefined } })} />}</Row>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Layout</legend>
        {([["conversational", "Conversational", "One question at a time (Typeform-style)."], ["classic", "Classic", "All questions on a page; page breaks split pages."]] as const).map(([v, l, d]) => (
          <label key={v} className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${form.layout === v ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="layout" value={v} checked={form.layout === v} onChange={() => dispatch({ type: "set_meta", patch: { layout: v } })} className="mt-0.5" />
            <span><span className="font-medium">{l}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <Row label="Public link" hint={`Path: ${publicFormPath(slugDraft || "…")} · The public form page goes live in Phase 3. Changing the link after sharing breaks old links.`}>{id => (
          <div className="flex gap-2">
            <Input id={id} value={slugDraft} maxLength={64} aria-invalid={!slugValid || undefined}
              onChange={e => { setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); setSlugError(null); }} />
            <Button variant="outline" disabled={!slugValid || slugDraft === slug || saving} onClick={async () => {
              setSaving(true); setSlugError(null);
              try { await updateSlug(formId, slugDraft); await qc.invalidateQueries({ queryKey: ["forms"] }); toast.success("Link updated"); }
              catch (e) { setSlugError(e instanceof Error ? e.message : "Couldn't update link"); }
              finally { setSaving(false); }
            }}>{saving ? "Saving…" : "Save"}</Button>
          </div>)}</Row>
        {!slugValid && <p className="text-xs text-destructive">Use 3–64 lowercase letters, numbers and single hyphens.</p>}
        {slugError && <p role="alert" className="text-xs text-destructive">{slugError}</p>}
      </div>
    </div>
  );
}
