import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { useForm } from "@/features/forms/api";
import {
  PAGE_SIZE, deleteResponse, fetchAllResponses, useResponseStats, useResponses, useVersionSchemas,
  type ResponseFilters, type ResponseRow,
} from "@/features/responses/api";
import { buildExport, download, exportColumns, toCsv, toXlsx } from "@/features/responses/export";
import { formatAnswer } from "@/fields/answers";
import { NotificationSettingsCard } from "@/features/notifications/NotificationSettingsCard";
import { useAuth } from "@/features/auth/auth-context";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "./PageHeader";

export function ResponsesPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const adminEmail = auth.state.status === "authorized" ? auth.state.admin.email : "";
  const form = useForm(id);
  const versions = useVersionSchemas(id);
  const stats = useResponseStats(id);
  const [filters, setFilters] = useState<ResponseFilters>({});
  const [draft, setDraft] = useState<ResponseFilters>({});
  const [page, setPage] = useState(0);
  const list = useResponses(id, page, filters);
  const [toDelete, setToDelete] = useState<ResponseRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const previewCols = useMemo(() => exportColumns(versions.data ?? []).slice(0, 3), [versions.data]);
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  const title = form.data?.title ?? "Form";

  const preview = (r: ResponseRow) => previewCols
    .map(c => {
      const text = c.question.type === "file_upload" || c.question.type === "image_upload"
        ? r.submission_files.filter(f => f.question_id === c.key).map(f => f.original_name).join("; ")
        : formatAnswer(c.question, r.answers[c.key]);
      return text ? `${c.label}: ${text}` : null;
    })
    .filter(Boolean)
    .join(" · ");

  async function exportAs(kind: "csv" | "xlsx") {
    if (!versions.data) return;
    setExporting(true);
    try {
      const rows = await fetchAllResponses(id, filters);
      const built = buildExport(title, rows, versions.data);
      const base = `${built.slug}-responses-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv") {
        // Byte-order mark so Excel reads UTF-8 correctly.
        download(new Blob(["﻿" + toCsv(built.header, built.body)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
      } else {
        download(await toXlsx(built.header, built.body), `${base}.xlsx`);
      }
      toast.success(`Exported ${rows.length} response${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const maxDay = Math.max(1, ...(stats.data?.per_day.map(d => d.count) ?? [0]));

  return (
    <>
      <PageHeader
        title={`${title}: responses`}
        description="Responses are immutable. Deleting one also removes its uploaded files."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={exporting || !versions.data} onClick={() => void exportAs("csv")}><Download className="mr-2 h-4 w-4" />CSV</Button>
            <Button variant="outline" disabled={exporting || !versions.data} onClick={() => void exportAs("xlsx")}><Download className="mr-2 h-4 w-4" />Excel</Button>
          </div>
        }
      />

      <div className="mb-8">
        <NotificationSettingsCard formId={id} defaultRecipient={adminEmail} />
      </div>

      {stats.isPending ? <Skeleton className="mb-6 h-32 w-full" /> : stats.isError ? (
        <p role="alert" className="mb-6 text-sm text-destructive">{stats.error.message}</p>
      ) : (
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Stat label="Total responses" value={stats.data.total} />
          <Stat label="Last 7 days" value={stats.data.last_7_days} />
          <Stat label="Last 30 days" value={stats.data.last_30_days} />
          <Card className="md:col-span-3">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-medium">Responses per day (last 30 days)</h2>
              <div className="flex h-24 items-end gap-1" role="img" aria-label={`Responses per day. ${stats.data.per_day.map(d => `${d.day}: ${d.count}`).join(", ")}`}>
                {stats.data.per_day.map(d => (
                  <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${Math.max(2, (d.count / maxDay) * 100)}%`, opacity: d.count === 0 ? 0.2 : 1 }} />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardContent className="space-y-5 p-4">
              <h2 className="text-sm font-medium">Answers by question</h2>
              {stats.data.questions.length === 0 && <p className="text-sm text-muted-foreground">No questions to summarise yet.</p>}
              {stats.data.questions.map(q => <QuestionSummary key={q.id} q={q} />)}
            </CardContent>
          </Card>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setFilters(draft); setPage(0); }}>
        <div><Label htmlFor="from">From</Label><Input id="from" type="date" value={draft.from ?? ""} onChange={e => setDraft({ ...draft, from: e.target.value || undefined })} /></div>
        <div><Label htmlFor="to">To</Label><Input id="to" type="date" value={draft.to ?? ""} onChange={e => setDraft({ ...draft, to: e.target.value || undefined })} /></div>
        <Button type="submit" variant="outline">Apply</Button>
        <Button type="button" variant="ghost" onClick={() => { setDraft({}); setFilters({}); setPage(0); }}>Clear</Button>
      </form>

      {list.isPending ? <Skeleton className="h-64 w-full" /> : list.isError ? (
        <p role="alert" className="text-sm text-destructive">{list.error.message}</p>
      ) : list.data.rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No responses match these filters yet.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-3 font-medium">Submitted</th><th className="p-3 font-medium">Answers</th><th className="p-3 font-medium">Files</th><th className="p-3 text-right font-medium"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {list.data.rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap p-3" title={new Date(r.submitted_at).toLocaleString()}>{timeAgo(r.submitted_at)}</td>
                  <td className="max-w-md truncate p-3 text-muted-foreground">{preview(r) || "No answers shown"}</td>
                  <td className="p-3">{r.submission_files.length}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="View response">
                        <Link to={`/forms/${id}/responses/${r.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete response" onClick={() => setToDelete(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.data && list.data.total > PAGE_SIZE && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Responses pages">
          <span className="text-muted-foreground">Page {page + 1} of {totalPages} · {list.data.total} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
          </div>
        </nav>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={o => { if (!o) setToDelete(null); }}
        title="Delete this response?"
        description="The answers and any uploaded files are permanently removed. This cannot be undone."
        confirmLabel="Delete response"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          const result = await deleteResponse(toDelete.id);
          await qc.invalidateQueries({ queryKey: ["responses"] });
          toast.success("Response deleted");
          if (result.filesRemaining > 0) toast.warning(`${result.filesRemaining} file(s) could not be removed yet and will be retried.`);
          setToDelete(null);
        }}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function QuestionSummary({ q }: { q: { label: string; type: string; answered: number; breakdown: unknown } }) {
  const b = q.breakdown;
  return (
    <div>
      <p className="text-sm font-medium">{q.label} <span className="font-normal text-muted-foreground">· {q.answered} answered</span></p>
      {Array.isArray(b) && b.length > 0 && (() => {
        const max = Math.max(1, ...(b as { count: number }[]).map(x => x.count));
        return (
          <ul className="mt-2 space-y-1">
            {(b as { value: string; count: number }[]).map(x => (
              <li key={x.value} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate" title={x.value}>{x.value}</span>
                <span className="h-2 flex-1 rounded bg-muted"><span className="block h-2 rounded bg-primary" style={{ width: `${(x.count / max) * 100}%` }} /></span>
                <span className="w-10 text-right tabular-nums">{x.count}</span>
              </li>
            ))}
          </ul>
        );
      })()}
      {typeof b === "object" && b !== null && !Array.isArray(b) && (
        <p className="mt-1 text-sm text-muted-foreground">
          Average {(b as { average: number | null }).average ?? "—"} · Min {(b as { min: number | null }).min ?? "—"} · Max {(b as { max: number | null }).max ?? "—"}
        </p>
      )}
    </div>
  );
}
