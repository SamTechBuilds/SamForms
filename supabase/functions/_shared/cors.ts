// CORS for ai-generate. The origin allowlist is explicit: no wildcard, no echoing of arbitrary origins,
// and no environment lookups, so preflight answers do not depend on secrets being set.
// Header names come from the Supabase SDK's own list, so they stay in sync with what the SDK sends.
import { corsHeaders as sdkCorsHeaders } from "@supabase/supabase-js/cors";

export const ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "https://stbforms.netlify.app",
];

const ALLOW_HEADERS = sdkCorsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type";

export function isAllowedOrigin(origin: string | null): boolean {
  return origin === null || ALLOWED_ORIGINS.includes(origin);
}

/**
 * Headers for a response. Access-Control-Allow-Origin is set only for an allowed browser origin.
 * A disallowed origin gets no allow-origin header, so the browser blocks the response.
 * Vary: Origin is always set so caches never reuse one origin's answer for another.
 */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin !== null && ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
