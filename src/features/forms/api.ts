import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLogRow, FormListRow } from "@/lib/database.types";

// Every query relies on RLS (is_admin()) for authorization; these are plain reads.

async function countForms(status?: FormListRow["status"]): Promise<number> {
  let q = supabase.from("forms").select("id", { count: "exact", head: true });
  if (status) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
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
      const { data, error } = await supabase
        .from("forms").select("id,title,slug,status,created_at,updated_at")
        .order("updated_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as FormListRow[];
    },
  });
}

export function useRecentFormActivity(limit = 8) {
  return useQuery({
    queryKey: ["audit", "forms", limit],
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs").select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
        .eq("entity_type", "form").order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditLogRow[];
    },
  });
}
