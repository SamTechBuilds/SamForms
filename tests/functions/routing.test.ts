import { describe, it, expect, vi } from "vitest";
import {
  FREE_ROUTER_MODEL, ModelError, NO_MODEL_MESSAGE, RATE_LIMIT_MESSAGE, UNVERIFIED_PRICING_MESSAGE, UNVERIFIED_REPLY_MESSAGE,
  createCatalogLoader, generateFormDraft, isFreeModelId, isZeroPriced, parseCatalog, parseModelChain,
  type Catalog,
} from "../../supabase/functions/_shared/ai";

// Every OpenRouter call is mocked. No key, no network.
const FREE = { prompt: "0", completion: "0" };
const PAID = { prompt: "0.000003", completion: "0.000015" };
const catalog = (entries: Record<string, { prompt: string; completion: string }>): Catalog => new Map(Object.entries(entries));
const CATALOG = catalog({
  "vendor/a:free": FREE,
  "vendor/b:free": FREE,
  "vendor/paid": PAID,
  "vendor/mystery:free": { prompt: "", completion: "" },
});
const getCatalog = async () => CATALOG;
const FORM = JSON.stringify({ title: "Feedback", questions: [] });
const MSG = [{ role: "user", content: "make a form" }];
const chat = (model: string | undefined, content: string) =>
  new Response(JSON.stringify({ ...(model === undefined ? {} : { model }), choices: [{ message: { content } }] }), { status: 200 });
const errorBody = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const run = (models: string[], fetchImpl: ReturnType<typeof vi.fn>, cat = getCatalog) =>
  generateFormDraft({ apiKey: "k", models, messages: MSG, getCatalog: cat, fetchImpl: fetchImpl as never });

describe("price catalogue", () => {
  it("parses the public model list and recognises only explicit zero pricing as free", () => {
    const parsed = parseCatalog({ data: [{ id: "vendor/a:free", pricing: { prompt: "0", completion: "0" } }, { id: "x", pricing: null }] });
    expect(parsed?.get("vendor/a:free")).toEqual(FREE);
    expect(parsed?.has("x")).toBe(false);
    expect(parseCatalog({ nope: true })).toBeNull();
    expect(isZeroPriced(FREE)).toBe(true);
    expect(isZeroPriced(PAID)).toBe(false);
    expect(isZeroPriced({ prompt: "0", completion: "0.0000001" })).toBe(false);
    expect(isZeroPriced({ prompt: "", completion: "" })).toBe(false);
    expect(isZeroPriced(undefined)).toBe(false);
  });

  it("caches a good catalogue within the TTL, refetches after it, and never caches a failure", async () => {
    let t = 0;
    const body = { data: [{ id: "vendor/a:free", pricing: FREE }] };
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const load = createCatalogLoader(f as never, 1000, () => t);
    await load(); await load();
    expect(f).toHaveBeenCalledTimes(1);
    t = 5000;
    await load();
    expect(f).toHaveBeenCalledTimes(2);
    const bad = vi.fn(async () => new Response("down", { status: 500 }));
    const loadBad = createCatalogLoader(bad as never);
    await expect(loadBad()).rejects.toMatchObject({ status: 503, message: UNVERIFIED_PRICING_MESSAGE });
    await expect(loadBad()).rejects.toMatchObject({ status: 503 });
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the catalogue cannot be loaded, without calling any model", async () => {
    const chatFetch = vi.fn(async () => chat("vendor/a:free", FORM));
    const failing = async () => { throw new ModelError(503, UNVERIFIED_PRICING_MESSAGE); };
    await expect(run([FREE_ROUTER_MODEL], chatFetch, failing)).rejects.toMatchObject({ status: 503, message: UNVERIFIED_PRICING_MESSAGE });
    expect(chatFetch).not.toHaveBeenCalled();
  });
});

describe("model configuration allowlist", () => {
  it("accepts the free router and explicit :free models only", () => {
    expect(isFreeModelId(FREE_ROUTER_MODEL)).toBe(true);
    expect(isFreeModelId("vendor/a:free")).toBe(true);
    expect(isFreeModelId("openai/gpt-4o")).toBe(false);
    expect(isFreeModelId("vendor/a:free:extra")).toBe(false);
  });

  it("refuses paid entries in the primary or fallback configuration", () => {
    expect(parseModelChain(FREE_ROUTER_MODEL, "vendor/a:free, vendor/b:free, openrouter/free")).toEqual({ ok: true, models: [FREE_ROUTER_MODEL, "vendor/a:free", "vendor/b:free"] });
    const bad = parseModelChain(FREE_ROUTER_MODEL, "vendor/a:free, openai/gpt-4o");
    expect(bad.ok).toBe(false);
    expect(bad.ok ? "" : bad.error).toContain("openai/gpt-4o");
    expect(parseModelChain(undefined, undefined).ok).toBe(false);
    expect(parseModelChain("a/b:free,c/d:free,e/f:free,g/h:free", "i/j:free").ok).toBe(false);
  });
});

describe("router response verification", () => {
  it("identifies the model that answered and confirms it is zero-priced", async () => {
    const f = vi.fn(async () => chat("vendor/a:free", FORM));
    const out = await run([FREE_ROUTER_MODEL], f);
    expect(out).toMatchObject({ model: "vendor/a:free", strategy: "router", fallbackUsed: false, attempts: 1 });
    expect(out.schema).toEqual({ title: "Feedback", questions: [] });
  });

  it("does not depend on a :free suffix: a zero-priced model without the suffix is accepted", async () => {
    const cat = catalog({ "vendor/plain": FREE });
    const f = vi.fn(async () => chat("vendor/plain", FORM));
    await expect(run([FREE_ROUTER_MODEL], f, async () => cat)).resolves.toMatchObject({ model: "vendor/plain" });
  });

  it("discards a reply from a paid model and stops without trying anything else", async () => {
    const f = vi.fn(async () => chat("vendor/paid", FORM));
    await expect(run([FREE_ROUTER_MODEL, "vendor/b:free"], f)).rejects.toMatchObject({ status: 502, message: UNVERIFIED_REPLY_MESSAGE });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("discards a reply from a model that is missing from the catalogue (unverified)", async () => {
    const f = vi.fn(async () => chat("vendor/unknown:free", FORM));
    await expect(run([FREE_ROUTER_MODEL], f)).rejects.toMatchObject({ status: 502, message: UNVERIFIED_REPLY_MESSAGE });
  });

  it("fails closed when the router reply does not name the model that answered", async () => {
    const f = vi.fn(async () => chat(undefined, FORM));
    await expect(run([FREE_ROUTER_MODEL], f)).rejects.toMatchObject({ status: 502, message: UNVERIFIED_REPLY_MESSAGE });
  });
});

describe("configured fallbacks", () => {
  it("uses an approved, zero-priced fallback after the primary is unavailable", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(errorBody(404))
      .mockResolvedValueOnce(chat("vendor/b:free", FORM));
    const out = await run(["vendor/a:free", "vendor/b:free"], f);
    expect(out).toMatchObject({ model: "vendor/b:free", strategy: "fallback-chain", fallbackUsed: true, attempts: 2 });
  });

  it("never calls a paid fallback, and never calls an unverified one", async () => {
    const f = vi.fn(async () => chat("vendor/a:free", FORM));
    await run(["vendor/a:free", "vendor/paid", "vendor/mystery:free"], f);
    const called = f.mock.calls.map(c => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).model);
    expect(called).toEqual(["vendor/a:free"]);
  });

  it("fails with a configuration error when nothing in the list is verified free", async () => {
    const f = vi.fn();
    await expect(run(["vendor/paid"], f)).rejects.toMatchObject({ status: 500 });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("provider and account limits", () => {
  it("moves past a provider-level 429 (upstream limit) to the next model", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(errorBody(429, { error: { message: "Rate limit exceeded", metadata: { limit_source: "upstream provider" } } }))
      .mockResolvedValueOnce(chat("vendor/b:free", FORM));
    const out = await run(["vendor/a:free", "vendor/b:free"], f);
    expect(out.model).toBe("vendor/b:free");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("stops at once on an account-wide free quota exhaustion, with no further attempts", async () => {
    const f = vi.fn(async () => errorBody(429, { error: { message: "Rate limit exceeded", metadata: { limit_source: "free-models-per-day" } } }));
    const err = await run(["vendor/a:free", "vendor/b:free"], f).catch(e => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.status).toBe(429);
    expect(err.message).toBe(RATE_LIMIT_MESSAGE);
    expect(err.message).toContain("cannot bypass");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("treats a 429 with no source information as an account-wide limit (fails closed)", async () => {
    const f = vi.fn(async () => errorBody(429, {}));
    await expect(run(["vendor/a:free", "vendor/b:free"], f)).rejects.toMatchObject({ status: 429 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("stops on invalid API credentials without trying other models", async () => {
    const f = vi.fn(async () => errorBody(401));
    await expect(run(["vendor/a:free", "vendor/b:free"], f)).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("stops on a credits/account error (402) without retrying", async () => {
    const f = vi.fn(async () => errorBody(402));
    await expect(run(["vendor/a:free", "vendor/b:free"], f)).rejects.toMatchObject({ status: 402 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("failure handling", () => {
  it("moves past invalid JSON to the next model", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(chat("vendor/a:free", "not json at all"))
      .mockResolvedValueOnce(chat("vendor/b:free", FORM));
    const out = await run(["vendor/a:free", "vendor/b:free"], f);
    expect(out.model).toBe("vendor/b:free");
  });

  it("moves past a timeout to the next model", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error("aborted"))
      .mockResolvedValueOnce(chat("vendor/b:free", FORM));
    const out = await run(["vendor/a:free", "vendor/b:free"], f);
    expect(out.model).toBe("vendor/b:free");
  });

  it("moves past an empty reply to the next model", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
      .mockResolvedValueOnce(chat("vendor/b:free", FORM));
    expect((await run(["vendor/a:free", "vendor/b:free"], f)).model).toBe("vendor/b:free");
  });

  it("reports a clear error when every model is unavailable", async () => {
    const f = vi.fn(async () => errorBody(503));
    await expect(run(["vendor/a:free", "vendor/b:free"], f)).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("uses the no-model message when no attempt was possible", () => {
    expect(NO_MODEL_MESSAGE).toMatch(/No free AI model/);
  });
});
