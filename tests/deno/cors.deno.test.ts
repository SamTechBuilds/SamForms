// Runs on Deno with the function's own import map, so the real SDK cors subpath is resolved.
import { handleRequest } from "../../supabase/functions/_shared/ai-handler.ts";
import { ALLOWED_ORIGINS, corsHeadersFor } from "../../supabase/functions/_shared/cors.ts";

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const noAccess = {
  env: () => { throw new Error("env must not be read for preflight"); },
  rpc: async () => { throw new Error("rpc must not be called for preflight"); },
  getCatalog: async () => new Map(),
};

Deno.test("preflight from localhost:5173 returns 204 with the matching origin", async () => {
  const res = await handleRequest(new Request("https://p.supabase.co/functions/v1/ai-generate", {
    method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
  }), noAccess);
  check(res.status === 204, `status ${res.status}`);
  check(res.headers.get("Access-Control-Allow-Origin") === "http://localhost:5173", "origin header");
  check((res.headers.get("Access-Control-Allow-Headers") ?? "").includes("authorization"), "allow headers");
});

Deno.test("preflight from the Netlify origin returns 204", async () => {
  const res = await handleRequest(new Request("https://p.supabase.co/functions/v1/ai-generate", {
    method: "OPTIONS", headers: { Origin: "https://stbforms.netlify.app" },
  }), noAccess);
  check(res.status === 204, `status ${res.status}`);
});

Deno.test("preflight from an unknown origin is refused without an allow-origin header", async () => {
  const res = await handleRequest(new Request("https://p.supabase.co/functions/v1/ai-generate", {
    method: "OPTIONS", headers: { Origin: "https://evil.example.com" },
  }), noAccess);
  check(res.status === 403, `status ${res.status}`);
  check(res.headers.get("Access-Control-Allow-Origin") === null, "no origin header for unknown origin");
});

Deno.test("allowlist is explicit and never a wildcard", () => {
  check(ALLOWED_ORIGINS.length === 2, "allowlist size");
  check(!ALLOWED_ORIGINS.includes("*"), "wildcard");
  check(corsHeadersFor("*")["Access-Control-Allow-Origin"] === undefined, "wildcard origin not reflected");
});
