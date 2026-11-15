import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Archive, ArrowDownAZ, ArrowUpDown, Clock, FileText, Inbox, MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
const STATUS_LABEL = { draft: "Draft", published: "Live", archived: "Archived" } as const;
const TILE_TONES = ["bg-sky-500/10 text-sky-600", "bg-violet-500/10 text-violet-600", "bg-emerald-500/10 text-emerald-600", "bg-amber-500/10 text-amber-600"];

type SortKey = "updated" | "created" | "title";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Last updated" }, { value: "created", label: "Date created" }, { value: "title", label: "Title (A–Z)" },
];

function sortRows(rows: FormListRow[], sort: SortKey): FormListRow[] {
  const copy = [...rows];
  if (sort === "title") copy.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "created") copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return copy;
}

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
    try { await navigator.clipboard.writeText(publicFormUrl(f.slug)); toast.success("Public link copied."); }
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
          {everPublished && <DropdownMenuItem onSelect={() => navigate(`/forms/${f.id}/responses`)}>Responses</DropdownMenuItem>}
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
        description={`"${f.title}" will be permanently deleted. This cannot be undone.`}
        onConfirm={() => run("Draft deleted", () => deleteForm(f.id))} />
    </>
  );
}

/** Route: /forms — search, sort, filters, bulk actions, and per-form actions. */
export function FormsPage() {
  const forms = useForms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | FormStatus>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const byStatus = (forms.data ?? []).filter(f => filter === "all" || f.status === filter);
    const q = query.trim().toLowerCase();
    const byQuery = q ? byStatus.filter(f => f.title.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)) : byStatus;
    return sortRows(byQuery, sort);
  }, [forms.data, filter, query, sort]);

  // Keyboard shortcuts: "/" focuses search, "n" starts a new form — only when not already typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "n") { e.preventDefault(); navigate("/forms/new"); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => { setSelected(new Set()); }, [filter, query]);

  const everPublishedIds = new Set(rows.filter(f => f.published_version_id != null).map(f => f.id));
  const deletableSelectedIds = [...selected].filter(id => !everPublishedIds.has(id));
  const allSelected = rows.length > 0 && rows.every(f => selected.has(f.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(f => f.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkArchive() {
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map(id => setFormStatus(id, "archive")));
      await qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success(`${selected.size} form${selected.size === 1 ? "" : "s"} archived`);
      setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't archive every selected form"); }
    finally { setBulkBusy(false); }
  }
  async function bulkDelete() {
    setBulkBusy(true);
    try {
      await Promise.all(deletableSelectedIds.map(id => deleteForm(id)));
      await qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success(`${deletableSelectedIds.length} draft${deletableSelectedIds.length === 1 ? "" : "s"} deleted`);
      setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete every selected draft"); }
    finally { setBulkBusy(false); setBulkDeleting(false); }
  }

  return (
    <>
      <PageHeader title="Forms" description="Build, share and review your forms."
        actions={<Button asChild><Link to="/forms/new"><Plus className="h-4 w-4" aria-hidden="true" /> New form</Link></Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {rows.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox aria-label="Select all forms" checked={allSelected} onCheckedChange={toggleAll} /> Select all
          </label>
        )}
        <div role="tablist" aria-label="Filter forms by status" className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
              className={cn("rounded-full border px-3 py-1 text-sm", filter === f.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input ref={searchRef} type="search" placeholder="Search forms… (/)" aria-label="Search forms by title or link"
              value={query} onChange={e => setQuery(e.target.value)} className="h-9 w-48 pl-8 sm:w-64" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                {sort === "title" ? <ArrowDownAZ className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                <span className="hidden sm:inline">{SORTS.find(s => s.value === sort)?.label}</span>
                <ArrowUpDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORTS.map(s => <DropdownMenuItem key={s.value} onSelect={() => setSort(s.value)}>{s.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-accent/60 px-4 py-2.5">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => void bulkArchive()}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" disabled={bulkBusy || deletableSelectedIds.length === 0}
              title={deletableSelectedIds.length === 0 ? "Published forms can't be bulk-deleted here" : undefined}
              onClick={() => setBulkDeleting(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete {deletableSelectedIds.length > 0 && `(${deletableSelectedIds.length})`}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {forms.isPending && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}</div>}

      {forms.isError && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive">Couldn't load your forms: {forms.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void forms.refetch()}>Try again</Button>
        </div>
      )}

      {forms.isSuccess && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{query ? "No matching forms" : filter === "all" ? "No forms yet" : `No ${filter} forms`}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {query ? "Try a different search." : filter === "all" ? "Create your first form from scratch or from a template." : "Try a different filter."}
          </p>
          {filter === "all" && !query && <Button asChild size="sm"><Link to="/forms/new">Create a form</Link></Button>}
        </div>
      )}

      {forms.isSuccess && rows.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((f, i) => {
            const tone = TILE_TONES[i % TILE_TONES.length]!;
            return (
              <li key={f.id} className={cn("flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md", selected.has(f.id) && "ring-2 ring-primary")}>
                <div className="flex items-start gap-3 p-5">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden="true"><FileText className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="block max-w-full truncate text-left font-semibold hover:underline" onClick={() => navigate(`/forms/${f.id}/edit`)}>{f.title}</button>
                    <p className="truncate text-xs text-muted-foreground">/{f.slug} · Updated {timeAgo(f.updated_at)}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2"><Link to={`/forms/${f.id}/responses`}><Inbox className="h-4 w-4" aria-hidden="true" /> Responses</Link></Button>
                    <Button asChild variant="ghost" size="sm" className="h-8 px-2"><Link to={`/forms/${f.id}/edit`}>Edit</Link></Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Checkbox aria-label={`Select ${f.title}`} checked={selected.has(f.id)} onCheckedChange={() => toggleOne(f.id)} />
                    <RowActions f={f} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog open={bulkDeleting} onOpenChange={setBulkDeleting} title={`Delete ${deletableSelectedIds.length} draft${deletableSelectedIds.length === 1 ? "" : "s"}?`}
        destructive confirmLabel="Delete drafts"
        description="These drafts will be permanently deleted. This cannot be undone. Published forms in your selection are skipped."
        onConfirm={() => void bulkDelete()} />
    </>
  );
}
