import { describe, it, expect, vi } from "vitest";
import { handleRequest, type HandlerDeps } from "../../supabase/functions/_shared/ai-handler";
import { ALLOWED_ORIGINS } from "../../supabase/functions/_shared/cors";
import type { Catalog } from "../../supabase/functions/_shared/ai";

// No network, no real secrets. Every OpenRouter call and every database call is a fake.
const LOCAL = "http://localhost:5173";
const PROD = "https://stbforms.netlify.app";
const EVIL = "https://evil.example.com";
const FREE = { prompt: "0", completion: "0" };
const CATALOG: Catalog = new Map([["vendor/a:free", FREE]]);
const VALID_FORM = {
  schemaVersion: 1, title: "Feedback", layout: "classic",
  sections: [{ id: "s1", title: "Questions", pageBreakAfter: false }],
  questions: [{ id: "name", type: "short_text", sectionId: "s1", label: "Name", required: true, config: {}, validation: {}, rules: [] }],
};
const reply = (content: string, model = "vendor/a:free") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200 });

type Overrides = {
  isAdmin?: boolean;
  quota?: boolean;
  env?: Record<string, string>;
  rpc?: (auth: string, fn: string) => Promise<{ data: unknown; error: unknown }>;
  fetchImpl?: HandlerDeps["fetchImpl"];
};

function makeDeps(over: Overrides = {}) {
  const env = over.env ?? { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "openrouter/free" };
  const rpc = vi.fn(async (_auth: string, fn: string) => {
    if (fn === "is_admin") return { data: over.isAdmin ?? true, error: null };
    if (fn === "consume_ai_quota") return { data: over.quota ?? true, error: null };
    return { data: null, error: { message: "unknown" } };
  });
  const deps: HandlerDeps = {
    env: vi.fn((k: string) => env[k]) as HandlerDeps["env"],
    rpc: (over.rpc ?? rpc) as HandlerDeps["rpc"],
    getCatalog: async () => CATALOG,
    fetchImpl: over.fetchImpl ?? (vi.fn(async () => reply(JSON.stringify(VALID_FORM))) as never),
  };
  return { deps, env: deps.env as unknown as ReturnType<typeof vi.fn>, rpc: deps.rpc as unknown as ReturnType<typeof vi.fn> };
}

const post = (origin: string | null, auth: string | null = "Bearer user-jwt", body: unknown = { mode: "prompt", prompt: "A feedback form" }) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.Origin = origin;
  if (auth !== null) headers.Authorization = auth;
  return new Request("https://project.supabase.co/functions/v1/ai-generate", { method: "POST", headers, body: JSON.stringify(body) });
};
const preflight = (origin: string | null) => {
  const headers: Record<string, string> = { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, apikey, x-client-info, content-type" };
  if (origin !== null) headers.Origin = origin;
  return new Request("https://project.supabase.co/functions/v1/ai-generate", { method: "OPTIONS", headers });
};

describe("CORS preflight", () => {
  it("allows localhost:5173 with a matching origin and the headers the frontend sends", async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(preflight(LOCAL), deps);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
    const allowed = res.headers.get("Access-Control-Allow-Headers") ?? "";
    for (const h of ["authorization", "apikey", "x-client-info", "content-type"]) expect(allowed).toContain(h);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("allows the Netlify production origin", async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(preflight(PROD), deps);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(PROD);
  });

  it("rejects a disallowed origin with no allow-origin header", async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(preflight(EVIL), deps);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers preflight before any environment, auth or database access", async () => {
    const { deps, env, rpc } = makeDeps();
    await handleRequest(preflight(LOCAL), deps);
    expect(env).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never sends a wildcard allow-origin and only lists the explicit allowlist", () => {
    expect(ALLOWED_ORIGINS).toEqual([LOCAL, PROD]);
    expect(ALLOWED_ORIGINS).not.toContain("*");
  });
});

describe("CORS on real responses", () => {
  it("valid admin request returns 200 with CORS headers", async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
    const json = await res.json() as { schema: { title: string }; meta: { success: boolean } };
    expect(json.schema.title).toBe("Feedback");
    expect(json.meta.success).toBe(true);
  });

  it("missing Authorization returns 401 with CORS headers and never calls the database", async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleRequest(post(LOCAL, null), deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("non-admin returns 403 with CORS headers", async () => {
    const { deps } = makeDeps({ isAdmin: false });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("a disallowed origin is refused on POST and gets no allow-origin header", async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleRequest(post(EVIL), deps);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("validation failure returns 400 with CORS headers", async () => {
    const { deps } = makeDeps();
    const res = await handleRequest(post(LOCAL, "Bearer x", { mode: "prompt", prompt: "" }), deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("a draft that fails canonical validation returns 422 with CORS headers", async () => {
    const { deps } = makeDeps({ fetchImpl: vi.fn(async () => reply(JSON.stringify({ title: "Empty", questions: [] }))) as never });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(422);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("an unreadable model reply returns 502 with CORS headers", async () => {
    const { deps } = makeDeps({ fetchImpl: vi.fn(async () => reply("not json at all")) as never });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(502);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("an exhausted quota returns 429 with CORS headers", async () => {
    const { deps } = makeDeps({ quota: false });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("missing server configuration returns 500 with CORS headers", async () => {
    const { deps } = makeDeps({ env: {} });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("an OpenRouter platform rate limit returns 503 with CORS headers", async () => {
    const limited = new Response(JSON.stringify({ error: { metadata: { limit_source: "platform" } } }), { status: 429 });
    const { deps } = makeDeps({ fetchImpl: vi.fn(async () => limited) as never });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(503);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
  });

  it("an unexpected database throw returns 500 with CORS headers and does not leak the error", async () => {
    const rpc = vi.fn(async () => { throw new Error("connection string secret-value"); });
    const { deps } = makeDeps({ rpc: rpc as unknown as Overrides["rpc"] });
    const res = await handleRequest(post(LOCAL), deps);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(LOCAL);
    expect(await res.text()).not.toContain("secret-value");
  });

  it("never emits a wildcard allow-origin on any response", async () => {
    const { deps } = makeDeps();
    const responses = [
      await handleRequest(preflight(LOCAL), deps), await handleRequest(preflight(EVIL), deps),
      await handleRequest(post(LOCAL, null), deps), await handleRequest(post(LOCAL), deps),
      await handleRequest(new Request("https://x", { method: "GET", headers: { Origin: LOCAL } }), deps),
    ];
    for (const r of responses) expect(r.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });
});
