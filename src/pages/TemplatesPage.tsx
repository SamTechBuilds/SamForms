import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Trash2 } from "lucide-react";
import { FormSchema } from "@/schema/form";
import type { FormTemplateRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { createFromTemplate, deleteTemplate, useTemplates } from "@/features/forms/api";
import { getField } from "@/fields/registry";
import { PageHeader } from "./PageHeader";

function summarize(schema: unknown) {
  const r = FormSchema.safeParse(schema);
  if (!r.success) return "Invalid template";
  const inputs = r.data.questions.filter(q => !getField(q.type).isContent).length;
  return `${inputs} question${inputs === 1 ? "" : "s"} · ${r.data.sections.length} section${r.data.sections.length === 1 ? "" : "s"}`;
}

/** Route: /templates */
export function TemplatesPage() {
  const templates = useTemplates();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<FormTemplateRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createFrom = async (t: FormTemplateRow) => {
    setBusy(t.id); setError(null);
    try { const row = await createFromTemplate(t); toast.success("Form created from template"); navigate(`/forms/${row.id}/edit`); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't create the form"); setBusy(null); }
  };

  const system = templates.data?.filter(t => t.is_system) ?? [];
  const mine = templates.data?.filter(t => !t.is_system) ?? [];

  const grid = (list: FormTemplateRow[], empty: string) => list.length === 0 ? (
    <p className="text-sm text-muted-foreground">{empty}</p>
  ) : (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map(t => (
        <li key={t.id}>
          <Card className="flex h-full flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{t.name}</CardTitle>
                <Badge variant="outline" className="shrink-0 capitalize">{t.category}</Badge>
              </div>
              <CardDescription>{t.description ?? "No description"}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex items-center justify-between gap-2 pt-0">
              <span className="text-xs text-muted-foreground">{summarize(t.schema)}</span>
              <div className="flex gap-1">
                {!t.is_system && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Delete template ${t.name}`} onClick={() => setToDelete(t)}><Trash2 className="h-4 w-4" /></Button>}
                <Button size="sm" disabled={busy !== null} onClick={() => void createFrom(t)}>{busy === t.id ? "Creating…" : "Use template"}</Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Templates" description="Start a new form from a starter template, or from one you saved from your own form." />
      {error && <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</p>}
      {templates.isPending && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-36" />)}</div>}
      {templates.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load templates: {templates.error.message}</p>}
      {templates.isSuccess && (
        <div className="space-y-8">
          <section aria-labelledby="sys-templates" className="space-y-3">
            <h2 id="sys-templates" className="text-lg font-semibold">Starter templates</h2>
            {grid(system, "No starter templates are installed.")}
          </section>
          <section aria-labelledby="my-templates" className="space-y-3">
            <h2 id="my-templates" className="text-lg font-semibold">Your templates</h2>
            {grid(mine, "Open a form in the builder and choose “Save as template” to add one here.")}
          </section>
        </div>
      )}
      <ConfirmDialog open={toDelete !== null} onOpenChange={o => !o && setToDelete(null)} title="Delete template?" destructive confirmLabel="Delete template"
        description={`“${toDelete?.name ?? ""}” will be removed. Forms already created from it are not affected.`}
        onConfirm={async () => { if (toDelete) { await deleteTemplate(toDelete.id); await qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template deleted"); } }} />
    </>
  );
}
