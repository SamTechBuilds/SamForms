// Edge Function: turns a prompt or document text into a draft form schema using OpenRouter.
// Secrets (set with `npx supabase secrets set`): OPENROUTER_API_KEY, OPENROUTER_MODEL, APP_ORIGIN.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the platform. The service-role key is not used here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildMessages, callOpenRouter, extractJsonObject, ModelError, parseRequest } from "../_shared/ai.ts";

const origin = Deno.env.get("APP_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "Sign in to use AI generation." });

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("OPENROUTER_MODEL");
  if (!apiKey || !model) return json(500, { error: "AI generation is not configured." });

  // Runs as the signed-in user, so is_admin() and auth.uid() apply.
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error: adminError } = await user.rpc("is_admin");
  if (adminError || !isAdmin) return json(403, { error: "Only administrators can use AI generation." });

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }
  const parsed = parseRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const { data: allowed, error: quotaError } = await user.rpc("consume_ai_quota");
  if (quotaError) return json(500, { error: "Could not check your AI quota." });
  if (!allowed) return json(429, { error: "You have reached the hourly AI limit. Try again later." });

  try {
    const content = await callOpenRouter({ apiKey, model, messages: buildMessages(parsed.value) });
    const schema = extractJsonObject(content);
    if (!schema) return json(502, { error: "The AI reply could not be read. Try again." });
    return json(200, { schema });
  } catch (e) {
    // Log the status only, never the document or the reply.
    const status = e instanceof ModelError ? e.status : 500;
    console.error("ai-generate upstream failure", status);
    if (e instanceof ModelError && (e.status === 401 || e.status === 403)) return json(500, { error: "AI generation is misconfigured." });
    if (e instanceof ModelError && e.status === 429) return json(503, { error: "The AI service is busy. Try again shortly." });
    if (e instanceof ModelError && e.status === 504) return json(504, { error: e.message });
    return json(502, { error: "The AI service failed. Try again." });
  }
});
