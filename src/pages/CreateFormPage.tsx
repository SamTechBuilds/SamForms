import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileUp, Sparkles, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createForm, createFromTemplate, useTemplates } from "@/features/forms/api";
import { PageHeader } from "./PageHeader";

/** Route: /forms/new — real: blank form and templates. Document import and AI are marked not yet implemented. */
export function CreateFormPage() {
  const navigate = useNavigate();
  const templates = useTemplates();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ id: string }>) {
    setBusy(key); setError(null);
    try { const row = await fn(); navigate(`/forms/${row.id}/edit`); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't create the form."); setBusy(null); }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void run("blank", () => createForm({ title: title.trim() || "Untitled form" })); };

  return (
    <>
      <PageHeader title="Create form" description="Start from a blank form or from a template. Each form is saved as a draft until you publish it." />
      {error && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle>Start from scratch</CardTitle><CardDescription>An empty form you build question by question.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-form-title">Form title</Label>
                <Input id="new-form-title" maxLength={200} placeholder="e.g. Client onboarding" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy !== null}>{busy === "blank" ? "Creating…" : "Create blank form"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4" aria-hidden="true" /> Start from a template</CardTitle><CardDescription>Ready-made forms you can adapt. <Link to="/templates" className="underline">Browse all templates</Link></CardDescription></CardHeader>
          <CardContent>
            {templates.isPending && <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <Skeleton key={i} className="h-20" />)}</div>}
            {templates.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load templates: {templates.error.message}</p>}
            {templates.isSuccess && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {templates.data.slice(0, 6).map(t => (
                  <li key={t.id}>
                    <button type="button" disabled={busy !== null} onClick={() => void run(t.id, () => createFromTemplate(t))}
                      className="flex h-full w-full flex-col items-start gap-1 rounded-md border p-3 text-left hover:border-primary hover:bg-primary/5 disabled:opacity-60">
                      <span className="font-medium">{t.name}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{t.description}</span>
                      <span className="mt-1 text-xs text-primary">{busy === t.id ? "Creating…" : "Use template →"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3 border-dashed">
          <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Other ways to start <Badge variant="warning">Not yet implemented</Badge></CardTitle><CardDescription>These need the AI and document-extraction pipeline (Phase 5). They are shown so you know they're planned, not because they work today.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-md border p-3 opacity-70"><FileUp className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-medium">Import a document</p><p className="text-xs text-muted-foreground">DOCX, PDF, XLSX, CSV or TXT → questions to review. Planned: Phase 5.</p></div></div>
            <div className="flex items-start gap-3 rounded-md border p-3 opacity-70"><Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-medium">Generate with AI</p><p className="text-xs text-muted-foreground">From a document or a description. Planned: Phase 5.</p></div></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
