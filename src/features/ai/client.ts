import { supabase } from "@/lib/supabase";

export type GenerateInput =
  | { mode: "prompt"; prompt: string; title?: string }
  | { mode: "document"; text: string; title?: string }
  | { mode: "url"; url: string; title?: string };

/** Calls the ai-generate Edge Function as the signed-in admin and returns the raw draft. */
export async function requestDraft(input: GenerateInput): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke<{ schema?: unknown; error?: string }>("ai-generate", { body: input });
  if (error) {
    let message = "AI generation failed. Try again.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (!data?.schema) throw new Error("The AI service returned nothing usable. Try again.");
  return data.schema;
}
