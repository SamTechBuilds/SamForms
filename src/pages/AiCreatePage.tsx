import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { createForm } from "@/features/forms/api";
import { requestDraft } from "@/features/ai/client";
import { ACCEPTED_DOCUMENTS, extractDocumentText } from "@/features/ai/extract";
import { normalizeGeneratedForm, type NormalizeResult } from "@/features/ai/normalize";
import { MAX_PROMPT_CHARS_UI, MAX_DOCUMENT_CHARS_UI } from "@/features/ai/limits";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { isInputQuestion } from "@/fields/registry";
import { PageHeader } from "./PageHeader";

type Mode = "document" | "prompt" | "url";

function isLikelyUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AiCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialMode = params.get("source") === "document" ? "document" : params.get("source") === "url" ? "url" : "prompt";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NormalizeResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null); setBusy(true);
    try {
      const text = await extractDocumentText(file);
      if (!text) throw new Error("No readable text was found in this file. Try a text-based file, not a scanned image.");
      setDocumentName(file.name);
      setDocumentText(text.length > MAX_DOCUMENT_CHARS_UI ? text.slice(0, MAX_DOCUMENT_CHARS_UI) : text);
      if (text.length > MAX_DOCUMENT_CHARS_UI) toast.warning(`Only the first ${MAX_DOCUMENT_CHARS_UI.toLocaleString()} characters will be used.`);
    } catch (e) {
      setDocumentText(null); setDocumentName(null);
      setError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setError(null);
    const titleOrUndefined = title.trim() || undefined;
    const input =
      mode === "prompt" ? { mode: "prompt" as const, prompt: prompt.trim(), title: titleOrUndefined } :
      mode === "url" ? { mode: "url" as const, url: url.trim(), title: titleOrUndefined } :
      { mode: "document" as const, text: documentText ?? "", title: titleOrUndefined };

    if (mode === "prompt" && !input.prompt) return setError("Describe the form you want.");
    if (mode === "document" && !("text" in input && input.text)) return setError("Choose a document first.");
    if (mode === "url" && (!("url" in input && input.url) || !isLikelyUrl(input.url ?? ""))) return setError("Enter a valid web address, starting with http:// or https://.");

    setBusy(true);
    try {
      const raw = await requestDraft(input);
      const fallbackTitle = mode === "prompt" ? "New form" : mode === "url" ? "New form" : documentName ?? "New form";
      setDraft(normalizeGeneratedForm(raw, title || fallbackTitle));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const row = await createForm({ title: draft.schema.title, schema: draft.schema });
      toast.success("Draft created. Review it in the builder before publishing.");
      navigate(`/forms/${row.id}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The draft could not be saved");
    } finally {
      setSaving(false);
    }
  }

  if (draft) {
    const schema = draft.schema;
    return (
      <>
        <PageHeader title="Review the AI draft" description="Nothing is saved until you choose Save as draft. You can edit everything in the builder afterwards." />
        {draft.warnings.length > 0 && (
          <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-medium">Check these before publishing</p>
            <ul className="mt-1 list-disc pl-5">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Questions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="draft-title">Title</Label>
                <Input id="draft-title" value={schema.title} onChange={e => setDraft({ ...draft, schema: { ...schema, title: e.target.value.slice(0, 200) } })} />
              </div>
              <ol className="space-y-2">
                {schema.questions.filter(isInputQuestion).map(q => (
                  <li key={q.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{q.label}{q.required ? " *" : ""}</p>
                      <p className="text-muted-foreground">{q.type.replace(/_/g, " ")}{"options" in q && q.options ? ` · ${q.options.length} options` : ""}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, schema: { ...schema, questions: schema.questions.filter(x => x.id !== q.id) } })}
                      aria-label={`Remove ${q.label}`}>Remove</Button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
            <CardContent>
              <FormRenderer form={schema} previewNotice="Draft preview. Nothing is submitted here." />
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => void save()} disabled={saving || schema.questions.length === 0}>{saving ? "Saving…" : "Save as draft"}</Button>
          <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Start again</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Generate a form with AI" description="Describe the form, or start from a document. An administrator reviews every draft before it can be published." />
      <Card className="max-w-2xl">
        <CardContent className="space-y-5 p-6">
          <div role="tablist" aria-label="Source" className="inline-flex flex-wrap rounded-md border p-1">
            <Button role="tab" aria-selected={mode === "prompt"} variant={mode === "prompt" ? "default" : "ghost"} size="sm" onClick={() => setMode("prompt")}>From a description</Button>
            <Button role="tab" aria-selected={mode === "document"} variant={mode === "document" ? "default" : "ghost"} size="sm" onClick={() => setMode("document")}>From a document</Button>
            <Button role="tab" aria-selected={mode === "url"} variant={mode === "url" ? "default" : "ghost"} size="sm" onClick={() => setMode("url")}>From a link</Button>
          </div>

          {mode === "prompt" ? (
            <div>
              <Label htmlFor="ai-prompt">What should the form collect?</Label>
              <Textarea id="ai-prompt" rows={6} maxLength={MAX_PROMPT_CHARS_UI} value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. A job application for a barista: name, contact details, availability, past experience and a short cover note." />
              <p className="mt-1 text-xs text-muted-foreground">{prompt.length}/{MAX_PROMPT_CHARS_UI}</p>
            </div>
          ) : mode === "document" ? (
            <div>
              <Label htmlFor="ai-file">Document</Label>
              <Input id="ai-file" type="file" accept={ACCEPTED_DOCUMENTS} disabled={busy} onChange={e => void onFile(e.target.files?.[0])} />
              <p className="mt-1 text-xs text-muted-foreground">
                {documentName ? `Using ${documentName} (${(documentText ?? "").length.toLocaleString()} characters)` : "DOCX, PDF, XLSX, CSV, TXT or Markdown, up to 10 MB."}
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="ai-url">Link to an existing form or page</Label>
              <Input id="ai-url" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/some-form" />
              <p className="mt-1 text-xs text-muted-foreground">
                We read the page's text on the server and draft a new form from it — nothing is copied or published automatically, and the result is yours to edit before saving.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="ai-title">Title (optional)</Label>
            <Input id="ai-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <Button onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : "Generate draft"}</Button>
        </CardContent>
      </Card>
    </>
  );
}
