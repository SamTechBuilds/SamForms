// Runs under Deno (not Vitest) to prove the shared schema and routing work in the Edge Function runtime.
// Run: deno test --import-map supabase/functions/import_map.json tests/deno/shared.deno.test.ts
function assert(v: unknown, msg = "assertion failed"): asserts v { if (!v) throw new Error(msg); }
function assertFalse(v: unknown, msg = "expected false"): void { if (v) throw new Error(msg); }
function assertEquals(a: unknown, b: unknown): void { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); }
import { FormSchema } from "../../supabase/functions/_shared/form-schema.ts";
import { normalizeGeneratedForm } from "../../supabase/functions/_shared/normalize-form.ts";
import { createCatalogLoader, generateFormDraft, FREE_ROUTER_MODEL } from "../../supabase/functions/_shared/ai.ts";

const FREE = { prompt: "0", completion: "0" };
const cat = new Map([["vendor/a:free", FREE]]);
const getCatalog = async () => cat;
const reply = (model: string | undefined, content: string) =>
  new Response(JSON.stringify({ ...(model ? { model } : {}), choices: [{ message: { content } }] }), { status: 200 });

Deno.test("canonical schema rejects a duplicate question id and accepts a normalised draft", () => {
  const draft = normalizeGeneratedForm({ title: "T", questions: [{ label: "Name" }, { label: "Name" }] }, "fallback");
  assert(FormSchema.safeParse(draft.schema).success);
  const dup = { ...draft.schema, questions: [draft.schema.questions[0], draft.schema.questions[0]] };
  assertFalse(FormSchema.safeParse(dup).success);
});

Deno.test("router reply is accepted when the answering model is zero-priced", async () => {
  const f = async () => reply("vendor/a:free", JSON.stringify({ title: "T", questions: [{ label: "Q" }] }));
  const out = await generateFormDraft({ apiKey: "k", models: [FREE_ROUTER_MODEL], messages: [], getCatalog, fetchImpl: f as never });
  assertEquals(out.model, "vendor/a:free");
  assertEquals(out.attempts, 1);
});

Deno.test("account-wide free quota stops after one attempt", async () => {
  let calls = 0;
  const f = async () => { calls++; return new Response(JSON.stringify({ error: { message: "Rate limit exceeded", metadata: { limit_source: "free-models-per-day" } } }), { status: 429 }); };
  let threw = false;
  try { await generateFormDraft({ apiKey: "k", models: ["vendor/a:free", "vendor/a:free"], messages: [], getCatalog, fetchImpl: f as never }); }
  catch (e) { threw = (e as { status?: number }).status === 429; }
  assert(threw);
  assertEquals(calls, 1);
});

Deno.test("catalogue loader fails closed on a bad response", async () => {
  const load = createCatalogLoader((async () => new Response("no", { status: 500 })) as never);
  let threw = false;
  try { await load(); } catch { threw = true; }
  assert(threw);
});
