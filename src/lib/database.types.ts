// Hand-maintained row types for Phase 1 tables. Replace with `supabase gen types typescript` once a project is linked.
// NOTE: the form *schema* itself is NOT defined here; see src/schema/form.ts (single source of truth).
export type FormStatus = "draft" | "published" | "archived";

export interface AdminUserRow { id: string; email: string; role: "super_admin"; is_active: boolean }
export interface FormListRow { id: string; title: string; slug: string; status: FormStatus; created_at: string; updated_at: string }
export interface AuditLogRow {
  id: string; actor_id: string | null; action: string; entity_type: string | null;
  entity_id: string | null; metadata: Record<string, unknown>; created_at: string;
}
