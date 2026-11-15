// Re-export of the canonical schema. The single definition lives in supabase/functions/_shared/form-schema.ts,
// which the Edge Function also imports, so the browser and the server validate with identical rules.
export * from "../../supabase/functions/_shared/form-schema.ts";
