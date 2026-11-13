import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileText, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { deleteForm, duplicateForm, renameForm, setFormStatus, useForms } from "@/features/forms/api";
import { publicFormUrl } from "@/features/forms/links";
import type { FormListRow, FormStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "./PageHeader";

const FILTERS: { value: "all" | FormStatus; label: string }[] = [
  { value: "all", label: "All" }, { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" }, { value: "archived", label: "Archived" },
];
const STATUS_BADGE = { draft: "secondary", published: "success", archived: "outline" } as const;

function RenameDialog({ form, onClose }: { form: FormListRow | null; onClose: () => void }) {
  const [title, setTitle] = useState(form?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  return (
    <Dialog open={form !== null} onOpenChange={o => { if (!o && !busy) { setError(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename form</DialogTitle><DialogDescription>The title is shown to respondents and in exports.</DialogDescription></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-title">Title</Label>
          <Input id="rename-title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={busy || !title.trim()} onClick={async () => {
            if (!form) return;
            setBusy(true); setError(null);
            try { await renameForm(form.id, title); await qc.invalidateQueries({ queryKey: ["forms"] }); toast.success("Form renamed"); onClose(); }
            catch (e) { setError(e instanceof Error ? e.message : "Couldn't rename"); }
            finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Rename"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ f }: { f: FormListRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const everPublished = f.published_version_id != null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); await qc.invalidateQueries({ queryKey: ["forms"] }); toast.success(label); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicFormUrl(f.slug)); toast.success("Public link copied. The public page opens in Phase 3."); }
    catch { toast.error("Couldn't copy automatically. Copy the link from the builder instead."); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${f.title}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => navigate(`/forms/${f.id}/edit`)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`/forms/${f.id}/preview`)}>Preview</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>Copy public link</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run("Form duplicated as a new draft", () => duplicateForm(f.id))}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          {f.status === "published" && <DropdownMenuItem onSelect={() => void run("Form set back to draft", () => setFormStatus(f.id, "unpublish"))}>Unpublish</DropdownMenuItem>}
          {f.status !== "archived" && <DropdownMenuItem onSelect={() => void run("Form archived", () => setFormStatus(f.id, "archive"))}>Archive</DropdownMenuItem>}
          {f.status === "archived" && <DropdownMenuItem onSelect={() => void run("Form restored as a draft", () => setFormStatus(f.id, "restore"))}>Restore</DropdownMenuItem>}
          {!everPublished && <><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => setDeleting(true)}>Delete draft</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <RenameDialog form={f} onClose={() => setRenaming(false)} />}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this draft?" destructive confirmLabel="Delete draft"
        description={`“${f.title}” will be permanently deleted. This cannot be undone.`}
        onConfirm={() => run("Draft deleted", () => deleteForm(f.id))} />
    </>
  );
}

/** Route: /forms — real list with filters and per-form actions. */
export function FormsPage() {
  const forms = useForms();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | FormStatus>("all");
  const rows = (forms.data ?? []).filter(f => filter === "all" || f.status === filter);

  return (
    <>
      <PageHeader title="My Forms" description="All forms you own."
        actions={<Button asChild><Link to="/forms/new"><Plus className="h-4 w-4" aria-hidden="true" /> New form</Link></Button>} />

      <div role="tablist" aria-label="Filter forms by status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === f.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {forms.isPending && <div className="space-y-3 p-6" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}

          {forms.isError && (
            <div role="alert" className="flex flex-col items-center gap-3 p-10 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">Couldn’t load your forms: {forms.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void forms.refetch()}>Try again</Button>
            </div>
          )}

          {forms.isSuccess && rows.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">{filter === "all" ? "No forms yet" : `No ${filter} forms`}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filter === "all" ? "Create your first form from scratch or from a template." : "Try a different filter."}
              </p>
              {filter === "all" && <Button asChild size="sm"><Link to="/forms/new">Create a form</Link></Button>}
            </div>
          )}

          {forms.isSuccess && rows.length > 0 && (
            <ul className="divide-y">
              {rows.map(f => (
                <li key={f.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <button type="button" className="max-w-full truncate text-left font-medium hover:underline" onClick={() => navigate(`/forms/${f.id}/edit`)}>{f.title}</button>
                    <p className="truncate text-xs text-muted-foreground">/{f.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={STATUS_BADGE[f.status]}>{f.status}</Badge>
                    <time dateTime={f.updated_at} className="hidden text-xs text-muted-foreground sm:block">Updated {timeAgo(f.updated_at)}</time>
                    <RowActions f={f} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
