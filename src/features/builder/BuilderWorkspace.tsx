import { useCallback, useEffect, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Eye, Globe, Loader2, Pencil, Redo2, RefreshCw, History, LayoutTemplate, Undo2 } from "lucide-react";
import { FormSchema, type FormDefinition, type Question } from "@/schema/form";
import type { FormRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { fetchForm, fetchRevision, publishForm, saveDraft, setFormStatus } from "@/features/forms/api";
import { publicFormUrl } from "@/features/forms/links";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { ThemeEditor } from "@/features/themes/ThemeEditor";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { BuilderContext, type BuilderContextValue } from "./context";
import { createQuestion } from "./factory";
import { historyReducer, initHistory, questionsIn, type BuilderAction } from "./state";
import { FieldPalette } from "./components/FieldPalette";
import { Canvas } from "./components/Canvas";
import { FormSettings } from "./components/FormSettings";
import { SettingsPanel } from "./components/SettingsPanel";
import { PublishDialog, SaveTemplateDialog, VersionsDialog } from "./components/Dialogs";

type Panel = "fields" | "canvas" | "settings";
type RightTab = "form" | "theme";

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved", unsaved: "Unsaved changes", saving: "Saving…",
  error: "Save failed", conflict: "Changed elsewhere", invalid: "Not saved",
};

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const tone = status === "saved" ? "text-emerald-700" : status === "error" || status === "conflict" || status === "invalid" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className={cn("flex items-center gap-2 text-xs", tone)} role="status" aria-live="polite">
      {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      <span>{STATUS_TEXT[status]}</span>
      {status === "error" && <button type="button" className="underline" onClick={onRetry}>Retry</button>}
      {status === "invalid" && error && <span className="max-w-xs truncate" title={error}>— {error}</span>}
    </div>
  );
}

/** Route: /forms/:id/edit. Three-panel builder on desktop; panel switcher on small screens. */
export function BuilderWorkspace({ row, initial }: { row: FormRow; initial: FormDefinition }) {
  const qc = useQueryClient();
  const [hist, dispatchHist] = useReducer(historyReducer, initial, initHistory);
  const form = hist.present;
  const dispatch = useCallback((action: BuilderAction) => dispatchHist({ type: "do", action }), []);
  const undo = useCallback(() => dispatchHist({ type: "undo" }), []);
  const redo = useCallback(() => dispatchHist({ type: "redo" }), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("canvas");
  const [rightTab, setRightTab] = useState<RightTab>("form");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);

  const save = useCallback((s: FormDefinition, rev: number) => saveDraft(row.id, s, rev), [row.id]);
  const fetchRev = useCallback(() => fetchRevision(row.id), [row.id]);
  const auto = useAutosave({ schema: form, initialRevision: row.draft_revision, save, fetchRevision: fetchRev });
  const { saveNow, getRevision, markSaved, overwrite } = auto;

  // Keyboard: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z or Ctrl+Y, Ctrl/⌘+S. Ignored while typing so native text undo still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
      else if (k === "s") { e.preventDefault(); void saveNow(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saveNow]);

  // Selecting or adding a question on a small screen should reveal its settings.
  useEffect(() => { if (selectedId) setPanel("settings"); }, [selectedId]);

  const addQuestion = useCallback((type: Parameters<BuilderContextValue["addQuestion"]>[0], sectionId?: string, index?: number) => {
    const selected = selectedId ? form.questions.find(q => q.id === selectedId) : undefined;
    const sec = sectionId ?? selected?.sectionId ?? form.sections[form.sections.length - 1]!.id;
    const q: Question = createQuestion(type, sec);
    let at = index;
    if (sectionId === undefined && index === undefined && selected && selected.sectionId === sec) {
      at = questionsIn(form, sec).findIndex(x => x.id === selected.id) + 1;
    }
    dispatch({ type: "add_question", question: q, index: at });
    setSelectedId(q.id);
  }, [dispatch, form, selectedId]);

  const ctx: BuilderContextValue = { form, dispatch, selectedId, select: setSelectedId, addQuestion };
  const selected = selectedId ? form.questions.find(q => q.id === selectedId) : undefined;
  const isPublished = row.status === "published";
  const isArchived = row.status === "archived";

  const onPublish = async (): Promise<number> => {
    const ok = await saveNow();
    if (!ok) throw new Error("The draft couldn't be saved, so nothing was published. Fix the issue shown in the header and try again.");
    const res = await publishForm(row.id, getRevision());
    await qc.invalidateQueries({ queryKey: ["forms"] });
    toast.success(res.reused ? `No changes since version ${res.version}; it stays live.` : `Published version ${res.version}`);
    return res.version;
  };

  const doUnpublish = async () => {
    await setFormStatus(row.id, "unpublish");
    await qc.invalidateQueries({ queryKey: ["forms"] });
    toast.success("Form set back to draft.");
  };

  const reloadLatest = async () => {
    const fresh = await fetchForm(row.id);
    const parsed = FormSchema.safeParse(fresh.draft_schema);
    if (!parsed.success) { toast.error("The latest saved draft could not be read."); return; }
    dispatchHist({ type: "reset", form: parsed.data });
    markSaved(parsed.data, fresh.draft_revision);
  };

  const panelClass = (p: Panel) => cn("min-h-0 overflow-hidden", panel === p ? "flex" : "hidden", "lg:flex");

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="flex min-h-0 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Link to="/forms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> My forms</Link>
          <h1 className="min-w-0 max-w-[30ch] truncate text-lg font-semibold">{form.title || "Untitled form"}</h1>
          <Badge variant={isPublished ? "success" : isArchived ? "outline" : "secondary"}>{row.status}</Badge>
          <SaveIndicator status={auto.status} error={auto.error} onRetry={() => void saveNow()} />

          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={hist.past.length === 0} onClick={undo}><Undo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={hist.future.length === 0} onClick={redo}><Redo2 className="h-4 w-4" /></Button>
            <div role="group" aria-label="Editor mode" className="ml-1 flex rounded-md border p-0.5 text-sm">
              <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")} className={cn("rounded px-2.5 py-1", mode === "edit" && "bg-accent font-medium")}><Pencil className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Edit</button>
              <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")} className={cn("rounded px-2.5 py-1", mode === "preview" && "bg-accent font-medium")}><Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Live preview</button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)}><History className="h-4 w-4" /> History</Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}><LayoutTemplate className="h-4 w-4" /> Save as template</Button>
            {isPublished && <Button variant="outline" size="sm" onClick={() => setUnpublishOpen(true)}>Unpublish</Button>}
            <Button size="sm" disabled={isArchived} title={isArchived ? "Restore the form from My forms before publishing" : undefined} onClick={() => setPublishOpen(true)}>
              <Globe className="h-4 w-4" /> {isPublished ? "Publish changes" : "Publish"}
            </Button>
          </div>
        </header>

        {auto.status === "conflict" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> This draft was changed in another tab or device. Autosave is paused.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void reloadLatest().catch(e => toast.error(e instanceof Error ? e.message : "Reload failed"))}><RefreshCw className="h-3.5 w-3.5" /> Load latest</Button>
              <Button size="sm" onClick={() => void overwrite()}>Keep my version</Button>
            </div>
          </div>
        )}

        <div className="lg:hidden" role="tablist" aria-label="Builder panels">
          <div className="grid grid-cols-3 rounded-md bg-muted p-1 text-sm">
            {([["fields", "Fields"], ["canvas", "Form"], ["settings", "Settings"]] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={panel === v} onClick={() => setPanel(v)} className={cn("rounded px-2 py-1.5 font-medium", panel === v ? "bg-background shadow-sm" : "text-muted-foreground")}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid min-h-[70vh] flex-1 grid-cols-1 overflow-hidden rounded-lg border bg-background lg:h-[calc(100vh-11rem)] lg:grid-cols-[17rem_minmax(0,1fr)_21rem]">
          <aside aria-label="Field types" className={cn(panelClass("fields"), "flex-col border-r bg-card")}>
            <FieldPalette onAdded={() => setPanel("settings")} />
          </aside>

          <section aria-label="Form canvas" className={cn(panelClass("canvas"), "flex-col bg-muted/30")}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === "preview" ? (
                <div className="mx-auto my-4 max-w-3xl overflow-hidden rounded-lg border bg-background shadow-sm">
                  <FormRenderer form={form} previewNotice="Live preview — nothing is submitted." />
                </div>
              ) : (
                <div onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}><Canvas /></div>
              )}
            </div>
          </section>

          <aside aria-label="Settings" className={cn(panelClass("settings"), "flex-col border-l bg-card")}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {selected ? <SettingsPanel formId={row.id} slug={row.slug} /> : (
                <div>
                  <div role="tablist" aria-label="Form settings sections" className="m-4 mb-0 grid grid-cols-2 rounded-md bg-muted p-1 text-sm">
                    {([["form", "Form"], ["theme", "Theme"]] as const).map(([v, l]) => (
                      <button key={v} role="tab" aria-selected={rightTab === v} onClick={() => setRightTab(v)} className={cn("rounded px-2 py-1 font-medium", rightTab === v ? "bg-background shadow-sm" : "text-muted-foreground")}>{l}</button>
                    ))}
                  </div>
                  {rightTab === "form"
                    ? <FormSettings formId={row.id} slug={row.slug} />
                    : <ThemeEditor form={form}
                        setTheme={patch => dispatch({ type: "set_theme", patch })}
                        setScreen={(screen, value) => dispatch({ type: "set_screen", screen, value })} />}
                </div>
              )}
            </div>
          </aside>
        </div>

        <p className="hidden text-xs text-muted-foreground lg:block">Public link: <span className="font-mono">{publicFormUrl(row.slug)}</span> · Public responses open in Phase 3.</p>
      </div>

      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} form={form} isPublished={isPublished} onPublish={onPublish} />
      <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} formId={row.id} liveVersionId={row.published_version_id}
        onRestore={(schema, version) => { dispatch({ type: "replace", form: schema }); toast.success(`Version ${version} loaded into the draft. Publish to make it live.`); }} />
      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} form={form} />
      <ConfirmDialog open={unpublishOpen} onOpenChange={setUnpublishOpen} title="Unpublish this form?" confirmLabel="Unpublish" destructive
        description="The form returns to draft. Earlier published versions are kept. Your draft is not changed."
        onConfirm={doUnpublish} />
    </BuilderContext.Provider>
  );
}
