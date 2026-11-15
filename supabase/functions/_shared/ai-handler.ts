// The ai-generate request handler. Kept free of Deno.serve and environment access so that tests can
// drive it with fake dependencies. index.ts supplies the real ones.
import { buildMessages, CatalogLoader, extractReadableText, FREE_ROUTER_MODEL, generateFormDraft, isSafeHttpUrl, MAX_URL_FETCH_BYTES, ModelError, NO_MODEL_MESSAGE, parseModelChain, parseRequest, RATE_LIMIT_MESSAGE, UNVERIFIED_PRICING_MESSAGE } from "./ai.ts";
import { normalizeGeneratedForm } from "./normalize-form.ts";
import { corsHeadersFor, isAllowedOrigin } from "./cors.ts";

export interface HandlerDeps {
  /** Reads a server-side secret or setting. Never reached for CORS preflight. */
  env(name: string): string | undefined;
  /** Calls a Postgres function as the signed-in user, so RLS and is_admin() apply. */
  rpc(authorization: string, fn: string): Promise<{ data: unknown; error: unknown }>;
  getCatalog: CatalogLoader;
  /** Test seam for OpenRouter and link fetches. Omitted in production, which uses the global fetch. */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
}

const URL_FETCH_TIMEOUT_MS = 15000;

/** Fetches a page for "import from a link" and reduces it to readable text. Admin-only caller; see isSafeHttpUrl for the SSRF guards this relies on. */
async function fetchUrlAsDocumentText(rawUrl: string): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const safe = isSafeHttpUrl(rawUrl);
  if (!safe.ok) return { ok: false, status: 400, error: safe.error };

  let res: Response;
  try {
    res = await fetch(safe.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "STBFormsBot/1.0 (+form import)" },
    });
  } catch {
    return { ok: false, status: 502, error: "Could not reach that link. Check it's correct and publicly reachable." };
  }
  if (!res.ok) return { ok: false, status: 502, error: `That link responded with status ${res.status}.` };

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
    return { ok: false, status: 400, error: "That link doesn't look like a web page Sam Forms can read." };
  }
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > MAX_URL_FETCH_BYTES) return { ok: false, status: 400, error: "That page is too large to import." };

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_URL_FETCH_BYTES) return { ok: false, status: 400, error: "That page is too large to import." };
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const text = extractReadableText(html);
  if (!text) return { ok: false, status: 400, error: "Couldn't find any readable text on that page." };
  return { ok: true, text };
}


export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = corsHeadersFor(origin);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // Preflight is answered first: before auth, before any environment access, before the body is read.
    if (req.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
      return new Response(null, { status: 204, headers: cors });
    }
    if (!isAllowedOrigin(origin)) return json(403, { error: "This website is not allowed to use AI generation." });
    if (req.method !== "POST") return json(405, { error: "Method not allowed." });

    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { error: "Sign in to use AI generation." });

    const apiKey = deps.env("OPENROUTER_API_KEY");
    const chain = parseModelChain(deps.env("OPENROUTER_MODEL"), deps.env("OPENROUTER_FALLBACK_MODELS"));
    if (!apiKey || !chain.ok) {
      console.error("ai-generate configuration problem", chain.ok ? "missing key" : chain.error);
      return json(500, { error: "AI generation is not configured." });
    }

    // Runs as the signed-in user, so is_admin() and auth.uid() apply.
    const { data: isAdmin, error: adminError } = await deps.rpc(auth, "is_admin");
    if (adminError || !isAdmin) return json(403, { error: "Only administrators can use AI generation." });

    let body: unknown;
    try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }); }

    // "Import from a link": fetch and reduce the page to text server-side, then handle it like an uploaded document.
    if (body && typeof body === "object" && (body as Record<string, unknown>).mode === "url") {
      const rawUrl = (body as Record<string, unknown>).url;
      if (typeof rawUrl !== "string" || !rawUrl.trim()) return json(400, { error: "Enter a link to import." });
      const fetched = await fetchUrlAsDocumentText(rawUrl.trim());
      if (!fetched.ok) return json(fetched.status, { error: fetched.error });
      const title = (body as Record<string, unknown>).title;
      body = { mode: "document", text: fetched.text, title };
    }

    const parsed = parseRequest(body);
    if (!parsed.ok) return json(400, { error: parsed.error });

    const { data: allowedUse, error: quotaError } = await deps.rpc(auth, "consume_ai_quota");
    if (quotaError) return json(500, { error: "Could not check your AI quota." });
    if (!allowedUse) return json(429, { error: "You have reached the hourly AI limit. Try again later." });

    const started = performance.now();
    const strategy = chain.models[0] === FREE_ROUTER_MODEL ? "router" : "fallback-chain";
    const meta = (extra: Record<string, unknown>) => ({ strategy, requestedModels: chain.models.length, durationMs: Math.round(performance.now() - started), ...extra });

    try {
      const draft = await generateFormDraft({ apiKey, models: chain.models, messages: buildMessages(parsed.value), getCatalog: deps.getCatalog, fetchImpl: deps.fetchImpl });
      // Server-side canonical validation. The draft is never returned unless it passes FormSchema.
      const title = (parsed.value as { title?: string }).title ?? "";
      let checked;
      try {
        checked = normalizeGeneratedForm(draft.schema, title);
      } catch (e) {
        console.log("ai-generate draft rejected", draft.model);
        return json(422, { error: e instanceof Error ? e.message : "The draft could not be used.", code: "invalid_form", meta: meta({ success: false, model: draft.model, fallbackUsed: draft.fallbackUsed, attempts: draft.attempts }) });
      }
      // Log model and timing only. Never log the document, the prompt or the reply.
      console.log("ai-generate ok", draft.model, draft.strategy, draft.fallbackUsed, draft.attempts);
      return json(200, {
        schema: checked.schema,
        warnings: checked.warnings,
        meta: meta({ success: true, model: draft.model, fallbackUsed: draft.fallbackUsed, attempts: draft.attempts }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const status = e instanceof ModelError ? e.status : 500;
      console.error("ai-generate failure", status, e instanceof ModelError && e.rateLimit ? e.rateLimit : "");
      const fail = (code: number, error: string) => json(code, { error, meta: meta({ success: false }) });
      if (e instanceof ModelError && (status === 401 || status === 402 || status === 403 || status === 500)) return fail(500, "AI generation is misconfigured.");
      if (message === RATE_LIMIT_MESSAGE || (e instanceof ModelError && status === 429)) return fail(503, RATE_LIMIT_MESSAGE);
      if (message === UNVERIFIED_PRICING_MESSAGE) return fail(503, UNVERIFIED_PRICING_MESSAGE);
      if (message === NO_MODEL_MESSAGE || (e instanceof ModelError && (status === 404 || status === 503))) return fail(503, NO_MODEL_MESSAGE);
      if (e instanceof ModelError && status === 504) return fail(504, e.message);
      if (e instanceof ModelError && status === 502) return fail(502, "The AI reply could not be used. Try again.");
      return fail(502, "The AI service failed. Try again.");
    }
  } catch (e) {
    // Last-resort guard: an unexpected failure still returns a response that carries CORS headers.
    console.error("ai-generate unexpected error", e instanceof Error ? e.name : "unknown");
    return json(500, { error: "Something went wrong. Try again." });
  }
}
