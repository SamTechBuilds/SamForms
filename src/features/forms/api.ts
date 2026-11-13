import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLogRow, FormListRow, FormRow, FormStatus, FormTemplateRow, FormVersionRow, FormVersionWithSchema } from "@/lib/database.types";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { blankForm, uniqueSlug } from "@/features/builder/factory";

// Every operation relies on RLS (is_admin()) and DB guards for authorization; publishing goes
// through the publish_form() RPC, which re-checks admin status and validates server-side.

export class ConflictError extends Error {
  constructor(message = "This form was changed somewhere else (another tab or device).") { super(message); this.name = "ConflictError"; }
}
type PgError = { message: string; code?: string };
const fail = (e: PgError): never => {
  if (e.code === "40001") throw new ConflictError();
  throw new Error(e.message);
};

const LIST_COLS = "id,title,slug,status,created_at,updated_at,published_version_id,draft_revision,published_revision";
const FULL_COLS = `${LIST_COLS},owner_id,draft_schema,archived_at`;

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Your session has expired. Please sign in again.");
  return data.session.user.id;
}

// ------------------------------------------------------------------ reads
async function countForms(status?: FormStatus): Promise<number> {
  let q = supabase.from("forms").select("id", { count: "exact", head: true });
  if (status) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) fail(error);
  return count ?? 0;
}

export function useFormStats() {
  return useQuery({
    queryKey: ["forms", "stats"],
    queryFn: async () => {
      const [total, published, draft] = await Promise.all([countForms(), countForms("published"), countForms("draft")]);
      return { total, published, draft };
    },
  });
}

export function useForms() {
  return useQuery({
    queryKey: ["forms", "list"],
    queryFn: async (): Promise<FormListRow[]> => {
      const { data, error } = await supabase.from("forms").select(LIST_COLS).order("updated_at", { ascending: false }).limit(200);
      if (error) fail(error);
      return (data ?? []) as FormListRow[];
    },
  });
}

export async function fetchForm(id: string): Promise<FormRow> {
  const { data, error } = await supabase.from("forms").select(FULL_COLS).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("Form not found.");
  return data as FormRow;
}
export function useForm(id: string | undefined) {
  return useQuery({ queryKey: ["forms", "detail", id], queryFn: () => fetchForm(id!), enabled: Boolean(id), staleTime: Infinity, refetchOnWindowFocus: false });
}

export function useRecentFormActivity(limit = 8) {
  return useQuery({
    queryKey: ["audit", "forms", limit],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs").select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
        .in("entity_type", ["form", "template"]).order("created_at", { ascending: false }).limit(limit);
      if (error) fail(error);
      return (data ?? []) as AuditLogRow[];
    },
  });
}

export function useFormVersions(formId: string | undefined) {
  return useQuery({
    queryKey: ["forms", "versions", formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<FormVersionRow[]> => {
      const { data, error } = await supabase.from("form_versions").select("id,form_id,version,title,published_at,published_by")
        .eq("form_id", formId!).order("version", { ascending: false });
      if (error) fail(error);
      return (data ?? []) as FormVersionRow[];
    },
  });
}
export async function fetchVersion(versionId: string): Promise<FormVersionWithSchema> {
  const { data, error } = await supabase.from("form_versions").select("id,form_id,version,title,published_at,published_by,schema").eq("id", versionId).maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("Version not found.");
  return data as FormVersionWithSchema;
}

// ----------------------------------------------------------------- writes
/** Create a draft form. Retries with a fresh slug on the (rare) unique collision. */
export async function createForm(input: { title: string; schema?: FormDefinition }): Promise<FormRow> {
  const owner = await currentUserId();
  const schema = FormSchema.parse({ ...(input.schema ?? blankForm(input.title)), title: input.title.trim() || "Untitled form" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from("forms")
      .insert({ owner_id: owner, title: schema.title, slug: uniqueSlug(schema.title), draft_schema: schema })
      .select(FULL_COLS).single();
    if (!error) return data as FormRow;
    if (error.code !== "23505") fail(error);
  }
  throw new Error("Couldn't generate a unique link for this form. Please try again.");
}

/** Save the draft with optimistic concurrency on draft_revision. Returns the new revision. */
export async function saveDraft(id: string, schema: FormDefinition, expectedRevision: number): Promise<{ revision: number; updatedAt: string }> {
  const parsed = FormSchema.parse(schema);
  const { data, error } = await supabase.from("forms")
    .update({ draft_schema: parsed, title: parsed.title.trim() })
    .eq("id", id).eq("draft_revision", expectedRevision)
    .select("draft_revision,updated_at");
  if (error) fail(error);
  const row = data?.[0] as { draft_revision: number; updated_at: string } | undefined;
  if (!row) throw new ConflictError();
  return { revision: row.draft_revision, updatedAt: row.updated_at };
}

export async function fetchRevision(id: string): Promise<number> {
  const { data, error } = await supabase.from("forms").select("draft_revision").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("Form not found.");
  return (data as { draft_revision: number }).draft_revision;
}

export async function renameForm(id: string, title: string): Promise<void> {
  const t = title.trim();
  if (!t || t.length > 200) throw new Error("Title must be 1–200 characters.");
  const row = await fetchForm(id);
  const parsed = FormSchema.safeParse(row.draft_schema);
  const draft = parsed.success ? { ...parsed.data, title: t } : row.draft_schema;
  const { data, error } = await supabase.from("forms").update({ title: t, draft_schema: draft })
    .eq("id", id).eq("draft_revision", row.draft_revision).select("id");
  if (error) fail(error);
  if (!data?.length) throw new ConflictError();
}

export async function updateSlug(id: string, slug: string): Promise<void> {
  const { error } = await supabase.from("forms").update({ slug }).eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "That link is already used by another form." : error.message.includes("slug_format") ? "Use 3–64 lowercase letters, numbers and single hyphens." : error.message);
}

export async function duplicateForm(id: string): Promise<FormRow> {
  const src = await fetchForm(id);
  const parsed = FormSchema.safeParse(src.draft_schema);
  if (!parsed.success) throw new Error("This form's draft is not valid and can't be duplicated.");
  const title = `Copy of ${parsed.data.title}`.slice(0, 200);
  return createForm({ title, schema: { ...parsed.data, title } });
}

export async function deleteForm(id: string): Promise<void> {
  const { error } = await supabase.from("forms").delete().eq("id", id);
  if (error) fail(error);
}

export async function setFormStatus(id: string, action: "archive" | "restore" | "unpublish"): Promise<void> {
  const patch = action === "archive" ? { status: "archived", archived_at: new Date().toISOString() } : { status: "draft", archived_at: null };
  const { error } = await supabase.from("forms").update(patch).eq("id", id);
  if (error) fail(error);
}

export async function publishForm(id: string, expectedRevision?: number): Promise<{ id: string; version: number; reused: boolean }> {
  const { data, error } = await supabase.rpc("publish_form", { p_form_id: id, p_expected_revision: expectedRevision ?? null });
  if (error) fail(error);
  return data as { id: string; version: number; reused: boolean };
}

// -------------------------------------------------------------- templates
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<FormTemplateRow[]> => {
      const { data, error } = await supabase.from("form_templates").select("*").order("is_system", { ascending: false }).order("name");
      if (error) fail(error);
      return (data ?? []) as FormTemplateRow[];
    },
  });
}
export async function createFromTemplate(t: Pick<FormTemplateRow, "name" | "schema">): Promise<FormRow> {
  const parsed = FormSchema.safeParse(t.schema);
  if (!parsed.success) throw new Error("This template is not valid.");
  return createForm({ title: parsed.data.title || t.name, schema: parsed.data });
}
export async function saveAsTemplate(input: { name: string; description?: string; category?: string; schema: FormDefinition }): Promise<void> {
  const owner = await currentUserId();
  const { error } = await supabase.from("form_templates").insert({
    name: input.name.trim(), description: input.description?.trim() || null,
    category: input.category || "general", schema: FormSchema.parse(input.schema), created_by: owner,
  });
  if (error) fail(error);
}
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("form_templates").delete().eq("id", id);
  if (error) fail(error);
}

/** Mutation wrapper that refreshes every forms/templates/audit query on success. */
export function useInvalidatingMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["forms"] }),
      qc.invalidateQueries({ queryKey: ["templates"] }),
      qc.invalidateQueries({ queryKey: ["audit"] }),
    ]),
  });
}
