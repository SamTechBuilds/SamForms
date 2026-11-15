// Edge Function: turns a prompt or document text into a draft form schema using OpenRouter.
// Secrets (set with `npx supabase secrets set`): OPENROUTER_API_KEY, OPENROUTER_MODEL (default openrouter/free),
// OPENROUTER_FALLBACK_MODELS (optional, free models only). Browser origins are an explicit allowlist in _shared/cors.ts.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the platform. The service-role key is not used here.
// Request handling lives in _shared/ai-handler.ts so it can be tested with fake dependencies.
import { createClient } from "@supabase/supabase-js";
import { createCatalogLoader } from "../_shared/ai.ts";
import { handleRequest } from "../_shared/ai-handler.ts";

const getCatalog = createCatalogLoader();

Deno.serve(req =>
  handleRequest(req, {
    env: name => Deno.env.get(name),
    getCatalog,
    rpc: async (authorization, fn) => {
      const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await client.rpc(fn);
      return { data: result.data, error: result.error };
    },
  }),
);
