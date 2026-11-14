// Hand-maintained row types. Replace with `supabase gen types typescript` once a project is linked.
// NOTE: the form *schema* itself is NOT defined here; see src/schema/form.ts (single source of truth).
export type FormStatus = "draft" | "published" | "archived";

export interface AdminUserRow { id: string; email: string; role: "super_admin"; is_active: boolean }
export interface FormListRow {
  id: string; title: string; slug: string; status: FormStatus; created_at: string; updated_at: string;
  published_version_id?: string | null; draft_revision?: number; published_revision?: number | null;
}
/** Full forms row. draft_schema is unknown until parsed with FormSchema. */
export interface FormRow extends FormListRow {
  owner_id: string;
  draft_schema: unknown;
  draft_revision: number;
  published_version_id: string | null;
  published_revision: number | null;
  archived_at: string | null;
}
export interface FormVersionRow { id: string; form_id: string; version: number; title: string; published_at: string; published_by: string | null }
export interface FormVersionWithSchema extends FormVersionRow { schema: unknown }
export interface FormTemplateRow {
  id: string; name: string; description: string | null; category: string; schema: unknown;
  is_system: boolean; created_by: string | null; created_at: string; updated_at: string;
}
export interface AuditLogRow {
  id: string; actor_id: string | null; action: string; entity_type: string | null;
  entity_id: string | null; metadata: Record<string, unknown>; created_at: string;
}

export interface AiUsageRow { id: number; user_id: string; created_at: string }
export interface NotificationSettingsRecord { form_id: string; enabled: boolean; recipient: string | null }
export type NotificationStatus = "pending" | "sent" | "failed";
