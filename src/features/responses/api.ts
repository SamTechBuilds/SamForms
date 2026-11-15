import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Admin-only reads and writes. RLS (is_admin()) and the SECURITY DEFINER functions in migration 0004
// are the authorization; nothing here is trusted on its own.

export const PAGE_SIZE = 25;
const EXPORT_PAGE = 500;

export interface ResponseFilters { from?: string; to?: string } // local calendar dates, YYYY-MM-DD

export interface ResponseFile {
  id: string; question_id: string; original_name: string; mime_type: string; size_bytes: number; storage_path: string;
}
export interface ResponseRow {
  id: string; submitted_at: string; answers: Record<string, unknown>; user_agent: string | null;
  form_version_id: string; submission_files: ResponseFile[];
}
export interface VersionSchema { id: string; version: number; schema: unknown }

export interface QuestionStats {
  id: string; label: string; type: string; answered: number;
  breakdown: { value: string; count: number }[] | { count: number; average: number | null; min: number | null; max: number | null } | null;
}
export interface ResponseStats {
  total: number; last_7_days: number; last_30_days: number;
  per_day: { day: string; count: number }[]; questions: QuestionStats[];
}

const COLUMNS = "id, submitted_at, answers, user_agent, form_version_id, submission_files(id, question_id, original_name, mime_type, size_bytes, storage_path)";

function errorMessage(e: { message: string }): Error { return new Error(e.message); }

/** Local midnight-to-midnight bounds as ISO timestamps, so a date filter means the user's day. */
function bounds(f: ResponseFilters) {
  const from = f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined;
  const to = f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined;
  return { from, to };
}

export function useResponses(formId: string | undefined, page: number, filters: ResponseFilters) {
  return useQuery({
    queryKey: ["responses", formId, page, filters],
    enabled: Boolean(formId),
    placeholderData: prev => prev,
    queryFn: async () => {
      const { from, to } = bounds(filters);
      let q = supabase.from("submissions").select(COLUMNS, { count: "exact" }).eq("form_id", formId!);
      if (from) q = q.gte("submitted_at", from);
      if (to) q = q.lt("submitted_at", to);
      const start = page * PAGE_SIZE;
      const { data, error, count } = await q.order("submitted_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);
      if (error) throw errorMessage(error);
      return { rows: (data ?? []) as unknown as ResponseRow[], total: count ?? 0 };
    },
  });
}

/** Every response matching the filters, for export. Pages through the table in fixed-size chunks. */
export async function fetchAllResponses(formId: string, filters: ResponseFilters, onProgress?: (n: number) => void): Promise<ResponseRow[]> {
  const { from, to } = bounds(filters);
  const all: ResponseRow[] = [];
  for (let start = 0; ; start += EXPORT_PAGE) {
    let q = supabase.from("submissions").select(COLUMNS).eq("form_id", formId);
    if (from) q = q.gte("submitted_at", from);
    if (to) q = q.lt("submitted_at", to);
    const { data, error } = await q.order("submitted_at", { ascending: true }).range(start, start + EXPORT_PAGE - 1);
    if (error) throw errorMessage(error);
    const batch = (data ?? []) as unknown as ResponseRow[];
    all.push(...batch);
    onProgress?.(all.length);
    if (batch.length < EXPORT_PAGE) break;
  }
  return all;
}

export async function fetchResponse(id: string): Promise<ResponseRow> {
  const { data, error } = await supabase.from("submissions").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw errorMessage(error);
  if (!data) throw new Error("This response no longer exists.");
  return data as unknown as ResponseRow;
}

/** Schemas of every version of a form, newest first. Used to label columns and detail answers. */
export async function fetchVersionSchemas(formId: string): Promise<VersionSchema[]> {
  const { data, error } = await supabase.from("form_versions").select("id, version, schema")
    .eq("form_id", formId).order("version", { ascending: false });
  if (error) throw errorMessage(error);
  return (data ?? []) as VersionSchema[];
}

export function useVersionSchemas(formId: string | undefined) {
  return useQuery({ queryKey: ["responses", "versions", formId], queryFn: () => fetchVersionSchemas(formId!), enabled: Boolean(formId), staleTime: Infinity });
}

export function useResponseStats(formId: string | undefined) {
  return useQuery({
    queryKey: ["responses", "stats", formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<ResponseStats> => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { data, error } = await supabase.rpc("response_stats", { p_form_id: formId, p_tz: tz });
      if (error) throw errorMessage(error);
      return data as ResponseStats;
    },
  });
}

/** Deletes one response, then removes its files and clears them from the cleanup queue. */
export async function deleteResponse(id: string): Promise<{ filesRemaining: number }> {
  const { data, error } = await supabase.rpc("delete_submission", { p_id: id });
  if (error) throw errorMessage(error);
  const paths = (data ?? []) as string[];
  if (paths.length === 0) return { filesRemaining: 0 };
  const { error: removeError } = await supabase.storage.from("submissions").remove(paths);
  if (removeError) return { filesRemaining: paths.length }; // stays queued in storage_cleanup
  const { error: doneError } = await supabase.rpc("finish_storage_cleanup", { p_paths: paths });
  if (doneError) return { filesRemaining: paths.length };
  return { filesRemaining: 0 };
}

/** Short-lived link to a private file. Only admins can create one (storage read policy). */
export async function createFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("submissions").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("The file could not be opened.");
  return data.signedUrl;
}

export interface SubmissionOverview {
  total: number;
  /** Count per local calendar day for the last `days` days, oldest first. */
  daily: { date: string; count: number }[];
  recent: { id: string; form_id: string; submitted_at: string; answered: number }[];
}

/** Dashboard data across every form: total, a daily series and the latest responses. */
export function useSubmissionOverview(days = 14) {
  return useQuery({
    queryKey: ["submissions", "overview", days],
    queryFn: async (): Promise<SubmissionOverview> => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));
      const [totalRes, windowRes, recentRes] = await Promise.all([
        supabase.from("submissions").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("submitted_at").gte("submitted_at", start.toISOString()).order("submitted_at", { ascending: true }).range(0, 9999),
        supabase.from("submissions").select("id, form_id, submitted_at, answers").order("submitted_at", { ascending: false }).limit(6),
      ]);
      for (const r of [totalRes, windowRes, recentRes]) if (r.error) throw errorMessage(r.error);

      const buckets = new Map<string, number>();
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        buckets.set(localDay(d), 0);
      }
      for (const row of (windowRes.data ?? []) as { submitted_at: string }[]) {
        const key = localDay(new Date(row.submitted_at));
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const recent = ((recentRes.data ?? []) as { id: string; form_id: string; submitted_at: string; answers: Record<string, unknown> }[])
        .map(r => ({ id: r.id, form_id: r.form_id, submitted_at: r.submitted_at, answered: Object.keys(r.answers ?? {}).length }));
      return {
        total: totalRes.count ?? 0,
        daily: [...buckets].map(([date, count]) => ({ date, count })),
        recent,
      };
    },
  });
}

function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
