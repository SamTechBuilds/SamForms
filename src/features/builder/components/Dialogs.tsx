import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, History, RotateCcw } from "lucide-react";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Row } from "@/fields/ui/editors";
import { getPublishIssues } from "@/fields/validate";
import { fetchVersion, saveAsTemplate, useFormVersions } from "@/features/forms/api";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { timeAgo } from "@/lib/format";

export function PublishDialog({ open, onOpenChange, form, isPublished, onPublish }: {
  open: boolean; onOpenChange: (o: boolean) => void; form: FormDefinition; isPublished: boolean;
  /** Saves the draft, then calls publish_form. Resolves with the version number. */
  onPublish: () => Promise<number>;
}) {
  const issues = open ? getPublishIssues(form) : [];
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) { setError(null); onOpenChange(o); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPublished ? "Publish changes" : "Publish form"}</DialogTitle>
          <DialogDescription>
            Publishing saves the current draft as a new, permanent version. {isPublished ? "The new version replaces the live one; earlier versions stay in history." : "Respondents will use this exact version."}
          </DialogDescription>
        </DialogHeader>
        {errors.length > 0 ? (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Fix {errors.length} issue{errors.length > 1 ? "s" : ""} before publishing</p>
            <ul className="list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          </div>
        ) : <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> The form passed validation.</p>}
        {warnings.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Warnings</p>
            <ul className="list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || errors.length > 0} onClick={async () => {
            setBusy(true); setError(null);
            try { await onPublish(); onOpenChange(false); } catch (e) { setError(e instanceof Error ? e.message : "Publishing failed"); } finally { setBusy(false); }
          }}>{busy ? "Publishing…" : "Publish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VersionsDialog({ open, onOpenChange, formId, liveVersionId, onRestore }: {
  open: boolean; onOpenChange: (o: boolean) => void; formId: string; liveVersionId: string | null;
  onRestore: (schema: FormDefinition, version: number) => void;
}) {
  const versions = useFormVersions(open ? formId : undefined);
  const [preview, setPreview] = useState<{ version: number; schema: FormDefinition } | null>(null);
  const [restore, setRestore] = useState<{ version: number; schema: FormDefinition } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async (id: string) => {
    setLoadingId(id); setError(null);
    try {
      const v = await fetchVersion(id);
      const parsed = FormSchema.safeParse(v.schema);
      if (!parsed.success) throw new Error("This version could not be read.");
      return { version: v.version, schema: parsed.data };
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load version"); return null; }
    finally { setLoadingId(null); }
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" aria-hidden="true" /> Version history</DialogTitle>
            <DialogDescription>Published versions are permanent and cannot be edited. You can preview one or copy it into the draft.</DialogDescription>
          </DialogHeader>
          {versions.isPending && <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {versions.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load versions: {versions.error.message} <button className="underline" onClick={() => void versions.refetch()}>Retry</button></p>}
          {versions.isSuccess && versions.data.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Not published yet. Versions appear here after you publish.</p>}
          {versions.isSuccess && versions.data.length > 0 && (
            <ul className="divide-y rounded-md border">
              {versions.data.map(v => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">Version {v.version} {v.id === liveVersionId && <Badge variant="success">Live</Badge>}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.title} · published <time dateTime={v.published_at}>{timeAgo(v.published_at)}</time></p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={async () => { const r = await load(v.id); if (r) setPreview(r); }}><Eye className="h-4 w-4" /> Preview</Button>
                    <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={async () => { const r = await load(v.id); if (r) setRestore(r); }}><RotateCcw className="h-4 w-4" /> Load into draft</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(preview)} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent wide className="p-0">
          <DialogHeader className="p-4 pb-0"><DialogTitle>Version {preview?.version} (read-only preview)</DialogTitle></DialogHeader>
          {preview && <div className="max-h-[70vh] overflow-y-auto border-t"><FormRenderer form={preview.schema} previewNotice="Preview of a published version — nothing is submitted." /></div>}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={Boolean(restore)} onOpenChange={o => !o && setRestore(null)} title={`Load version ${restore?.version} into the draft?`}
        description="Your current draft will be replaced with this version's content. The live form doesn't change until you publish. You can undo this in the builder."
        confirmLabel="Load into draft" onConfirm={() => { if (restore) { onRestore(restore.schema, restore.version); onOpenChange(false); } }} />
    </>
  );
}

export function SaveTemplateDialog({ open, onOpenChange, form }: { open: boolean; onOpenChange: (o: boolean) => void; form: FormDefinition }) {
  const [name, setName] = useState(form.title);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) { onOpenChange(o); setError(null); setDone(false); setName(form.title); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Save as template</DialogTitle><DialogDescription>Reuse this form's questions, logic and theme as a starting point.</DialogDescription></DialogHeader>
        {done ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Template saved. Find it under Templates.</p> : (
          <div className="space-y-3">
            <Row label="Template name">{id => <Input id={id} maxLength={120} value={name} onChange={e => setName(e.target.value)} />}</Row>
            <Row label="Description (optional)">{id => <Textarea id={id} maxLength={500} rows={2} value={description} onChange={e => setDescription(e.target.value)} />}</Row>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{done ? "Close" : "Cancel"}</Button>
          {!done && <Button disabled={busy || !name.trim()} onClick={async () => {
            setBusy(true); setError(null);
            try { await saveAsTemplate({ name, description, schema: form }); setDone(true); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save template"); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Save template"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
