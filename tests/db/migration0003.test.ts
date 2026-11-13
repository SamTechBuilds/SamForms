import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, as, ADMIN_ID, OTHER_ID } from "./harness";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { validateVisible, effectiveAnswers, orderedQuestions } from "@/features/renderer/logic";

let db: PGlite;
const admin = { role: "authenticated", uid: ADMIN_ID } as const;
const intruder = { role: "authenticated", uid: OTHER_ID } as const;
const anon = { role: "anon" } as const;
const NIL = "00000000-0000-0000-0000-000000000000";

const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const sec = { id: "s1", title: "Main", pageBreakAfter: false };
const q = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type, sectionId: "s1", label: id, required: false, config: {}, validation: {}, rules: [], ...extra });
const doc = (questions: unknown[], title = "Intake") =>
  ({ schemaVersion: 1, title, layout: "conversational", sections: [sec], questions });
const rule = (id: string, action: "show" | "hide", conditions: unknown[], combinator: "and" | "or" = "and") =>
  ({ id, combinator, conditions, action: { type: action } });
const ABC = [{ id: "a", label: "A", value: "a" }, { id: "b", label: "B", value: "b" }];

// ----------------------------------------------------------------- fixtures
const intakeSchema = doc([
  q("name", "short_text", { required: true }),
  q("pick", "single_choice", { options: ABC, aiNotes: "Check this is the right bucket",
    rules: [rule("r1", "show", [{ questionId: "name", operator: "is_answered" }])] }),
  q("extra", "short_text", { required: true,
    rules: [rule("r2", "hide", [{ questionId: "pick", operator: "equals", value: "a" }])] }),
]);
const fileSchema = doc([
  q("name", "short_text", { required: true }),
  q("cv", "file_upload", { validation: { allowedMimeTypes: ["application/pdf"], maxFileSizeMb: 0.5, maxFiles: 2 } }),
]);

async function createForm(slug: string, schema: unknown): Promise<string> {
  const r = await as(db, admin, () => db.query<{ id: string }>(
    `insert into forms (owner_id,title,slug,draft_schema) values ('${ADMIN_ID}','T','${slug}',${lit(schema)}) returning id`));
  return r.rows[0]!.id;
}
const publish = (id: string) => as(db, admin, () => db.query<{ publish_form: { id: string; version: number; reused: boolean } }>(
  `select public.publish_form('${id}')`)).then(r => r.rows[0]!.publish_form);

type SubmitResult = { ok: boolean; id?: string; errors?: Record<string, string> };
const submit = (slug: string, answers: unknown, ua = "vitest") =>
  as(db, anon, () => db.query<{ r: SubmitResult }>(`select public.submit_response('${slug}', ${lit(answers)}, '${ua}') as r`))
    .then(r => r.rows[0]!.r);
const countSubmissions = async () =>
  Number((await db.query<{ n: string }>("select count(*)::text as n from submissions")).rows[0]!.n);

beforeAll(async () => {
  db = await freshDb();
  await createForm("intake-form", intakeSchema);
  await publish((await db.query<{ id: string }>("select id from forms where slug='intake-form'")).rows[0]!.id);
  await createForm("draft-form", intakeSchema); // never published
  await createForm("file-form", fileSchema);
  await publish((await db.query<{ id: string }>("select id from forms where slug='file-form'")).rows[0]!.id);
  await createForm("rate-form", doc([q("a", "short_text", { required: true })]));
  await publish((await db.query<{ id: string }>("select id from forms where slug='rate-form'")).rows[0]!.id);
});

const idOf = async (slug: string) => (await db.query<{ id: string }>(`select id from forms where slug='${slug}'`)).rows[0]!.id;
const versionIdOf = async (slug: string) => (await db.query<{ published_version_id: string }>(
  `select published_version_id from forms where slug='${slug}'`)).rows[0]!.published_version_id;

// ------------------------------------------------------------- access rules
describe("public access is limited to narrow functions", () => {
  it("anon cannot read responses, pending uploads, file records or rate counters", async () => {
    for (const table of ["submissions", "submission_files", "pending_uploads", "rate_limit_events"]) {
      await expect(as(db, anon, () => db.query(`select count(*) from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });
  it("get_public_form returns published forms only, without internal review notes", async () => {
    const r = await as(db, anon, () => db.query<{ r: { slug: string; schema: { questions: Record<string, unknown>[] } } | null }>(
      "select public.get_public_form('intake-form') as r"));
    const pub = r.rows[0]!.r!;
    expect(pub.slug).toBe("intake-form");
    expect(pub.schema.questions.every(x => !("aiNotes" in x))).toBe(true);
    const draft = await as(db, anon, () => db.query<{ r: unknown }>("select public.get_public_form('draft-form') as r"));
    expect(draft.rows[0]!.r).toBeNull();
  });
  it("admins can read responses; an intruder sees none (RLS); nobody can edit them", async () => {
    await submit("intake-form", { name: "Ana", pick: "a" });
    const adminRows = await as(db, admin, () => db.query("select id from submissions"));
    expect(adminRows.rows.length).toBeGreaterThan(0);
    const intruderRows = await as(db, intruder, () => db.query("select id from submissions"));
    expect(intruderRows.rows).toHaveLength(0);
    await expect(db.query("update submissions set user_agent = 'x'")).rejects.toThrow(/cannot be edited/);
  });
});

// ------------------------------------------------------------- submissions
describe("submit_response", () => {
  it("rejects unknown and unpublished forms", async () => {
    await expect(submit("draft-form", { name: "Ana" })).rejects.toThrow(/not accepting responses/);
    await expect(submit("no-such-form", { name: "Ana" })).rejects.toThrow(/not accepting responses/);
  });

  it("stores only visible answers, pinned to the version the respondent saw", async () => {
    const before = await countSubmissions();
    const r = await submit("intake-form", { name: "Ana", pick: "a", extra: "hidden, so dropped" });
    expect(r).toMatchObject({ ok: true });
    expect(await countSubmissions()).toBe(before + 1);
    const row = (await db.query<{ answers: Record<string, unknown>; form_version_id: string }>(
      `select answers, form_version_id from submissions where id='${r.id}'`)).rows[0]!;
    expect(row.answers).toEqual({ name: "Ana", pick: "a" });
    expect(row.form_version_id).toBe(await versionIdOf("intake-form"));
  });

  it("returns field errors and stores nothing when validation fails", async () => {
    const before = await countSubmissions();
    const r = await submit("intake-form", { pick: "b" });
    expect(r.ok).toBe(false);
    expect(r.errors?.name).toBe("This question is required");
    expect(r.errors?.extra).toBe("This question is required"); // visible because pick is not "a"
    expect(await countSubmissions()).toBe(before);
  });

  it("rejects answers for questions that do not exist", async () => {
    const r = await submit("intake-form", { name: "Ana", pick: "a", ghost: "x" });
    expect(r.errors).toEqual({ ghost: "Unknown question" });
  });

  it("rate limits per network and form, and surfaces a clear message", async () => {
    const fid = await idOf("rate-form");
    await db.query(`insert into rate_limit_events (bucket_key, window_start, hits)
      values ('submit:' || public.sf_caller_hash('${fid}'), date_bin(interval '10 minutes', now(), timestamptz '2000-01-01 00:00:00+00'), 10)
      on conflict (bucket_key, window_start) do update set hits = 10`);
    await expect(submit("rate-form", { a: "x" })).rejects.toThrow(/Too many submissions/);
  });

  it("keeps old responses on their version after the form is republished", async () => {
    const v1 = await versionIdOf("intake-form");
    const r = await submit("intake-form", { name: "Before edit", pick: "a" });
    await as(db, admin, () => db.query(`update forms set draft_schema=${lit(doc([q("name", "short_text", { required: true })], "Renamed"))} where slug='intake-form'`));
    const v2 = await publish(await idOf("intake-form"));
    expect(v2.version).toBe(2);
    const row = (await db.query<{ form_version_id: string }>(`select form_version_id from submissions where id='${r.id}'`)).rows[0]!;
    expect(row.form_version_id).toBe(v1);
    const pub = (await as(db, anon, () => db.query<{ r: { title: string } }>("select public.get_public_form('intake-form') as r"))).rows[0]!.r;
    expect(pub.title).toBe("Renamed");
  });
});

// ----------------------------------------------------------------- uploads
describe("request_upload and file answers", () => {
  const requestUpload = (q: string, name: string, mime: string, size: number) =>
    as(db, anon, () => db.query<{ r: { upload_id: string; path: string } }>(
      `select public.request_upload('file-form', '${q}', '${name}', '${mime}', ${size}) as r`)).then(r => r.rows[0]!.r);

  it("refuses types that could run in a browser, non-file questions and oversize files", async () => {
    await expect(requestUpload("cv", "page.html", "text/html", 100)).rejects.toThrow(/not allowed/);
    await expect(requestUpload("cv", "x.svg", "image/svg+xml", 100)).rejects.toThrow(/not allowed/);
    await expect(requestUpload("name", "x.pdf", "application/pdf", 100)).rejects.toThrow(/does not accept files/);
    await expect(requestUpload("cv", "big.pdf", "application/pdf", 600_000)).rejects.toThrow(/too large/);
    await expect(requestUpload("cv", "x.png", "image/png", 100)).rejects.toThrow(/not allowed for this question/);
  });

  it("issues a sanitised, unguessable path and the submission stores server-side file details", async () => {
    const up = await requestUpload("cv", "CV.pdf", "application/pdf", 2048);
    expect(up.path).toMatch(new RegExp(`^${await idOf("file-form")}/${up.upload_id}/CV\\.pdf$`));
    const r = await submit("file-form", { name: "Ana", cv: [{ id: up.upload_id, name: "forged.exe", size: 1, type: "text/html" }] });
    expect(r.ok).toBe(true);
    const stored = (await db.query<{ answers: { cv: Record<string, unknown>[] } }>(
      `select answers from submissions where id='${r.id}'`)).rows[0]!.answers;
    expect(stored.cv).toEqual([{ id: up.upload_id, name: "CV.pdf", size: 2048, type: "application/pdf" }]);
    const files = (await db.query<{ n: string }>(`select count(*)::text as n from submission_files where submission_id='${r.id}'`)).rows[0]!.n;
    expect(files).toBe("1");
  });

  it("a reservation can be used once", async () => {
    const up = await requestUpload("cv", "once.pdf", "application/pdf", 10);
    expect((await submit("file-form", { name: "A", cv: [{ id: up.upload_id }] })).ok).toBe(true);
    const again = await submit("file-form", { name: "B", cv: [{ id: up.upload_id }] });
    expect(again.ok).toBe(false);
    expect(again.errors?.cv).toMatch(/expired or was already submitted/);
  });

  it("the same reservation cannot be attached twice in one submission", async () => {
    const up = await requestUpload("cv", "wrong.pdf", "application/pdf", 10);
    const r = await submit("file-form", { name: "C", cv: [{ id: up.upload_id }, { id: up.upload_id }] });
    expect(r.errors?.cv).toMatch(/attached once/);
  });
});

// ------------------------------------------------- SQL vs TypeScript parity
const parityCases: [string, unknown[], Record<string, unknown>][] = [
  ["required text missing", [q("a", "short_text", { required: true })], {}],
  ["whitespace-only required text", [q("a", "short_text", { required: true })], { a: "   " }],
  ["text pattern fails", [q("a", "short_text", { validation: { minLength: 3, pattern: "^[A-Z]+$", patternMessage: "Caps only" } })], { a: "abc" }],
  ["text pattern passes", [q("a", "short_text", { validation: { minLength: 3, pattern: "^[A-Z]+$" } })], { a: "ABC" }],
  ["long text over max", [q("a", "long_text", { validation: { maxLength: 5 } })], { a: "abcdefgh" }],
  ["full name trimmed", [q("a", "name")], { a: "  Ana " }],
  ["first and last name, last missing", [q("a", "name", { config: { format: "first_last" } })], { a: { first: "Ana" } }],
  ["email valid", [q("a", "email")], { a: "ana@example.com" }],
  ["email invalid", [q("a", "email")], { a: "ana@example" }],
  ["phone valid", [q("a", "phone")], { a: "+44 20 7946 0958" }],
  ["phone too short", [q("a", "phone")], { a: "12" }],
  ["url without scheme", [q("a", "url")], { a: "example.com" }],
  ["url valid", [q("a", "url")], { a: "https://example.com/x" }],
  ["whole number required", [q("a", "number", { config: { allowDecimals: false } })], { a: 1.5 }],
  ["number above max", [q("a", "number", { validation: { min: 1, max: 10 } })], { a: 11 }],
  ["currency with 3dp", [q("a", "currency")], { a: 1.005 }],
  ["single choice not an option", [q("a", "single_choice", { options: ABC })], { a: "zzz" }],
  ["single choice other allowed", [q("a", "single_choice", { options: ABC, config: { allowOther: true } })], { a: "zzz" }],
  ["multiple choice below minimum", [q("a", "multiple_choice", { options: ABC, validation: { minSelections: 2 } })], { a: ["a"] }],
  ["multiple choice duplicate", [q("a", "multiple_choice", { options: ABC })], { a: ["a", "a"] }],
  ["required toggle switched off", [q("a", "toggle", { required: true })], { a: false }],
  ["yes/no answered", [q("a", "yes_no")], { a: true }],
  ["impossible date", [q("a", "date")], { a: "2026-02-30" }],
  ["date before minimum", [q("a", "date", { config: { minDate: "2027-01-01" } })], { a: "2026-05-01" }],
  ["bad time", [q("a", "time")], { a: "25:00" }],
  ["date range reversed", [q("a", "date_range")], { a: { start: "2026-05-02", end: "2026-05-01" } }],
  ["star rating above five", [q("a", "star_rating")], { a: 6 }],
  ["linear scale inside range", [q("a", "linear_scale", { config: { min: 1, max: 7 } })], { a: 7 }],
  ["opinion scale above ten", [q("a", "opinion_scale")], { a: 11 }],
  ["colour not hex", [q("a", "color_picker")], { a: "red" }],
  ["colour hex", [q("a", "color_picker")], { a: "#ff0000" }],
  ["heading needs nothing", [q("h", "heading")], {}],
  ["hidden invalid answer ignored", [q("a", "yes_no"), q("b", "number", { validation: { min: 5 }, rules: [rule("r", "show", [{ questionId: "a", operator: "equals", value: true }])] })], { a: false, b: 1 }],
  ["shown invalid answer flagged", [q("a", "yes_no"), q("b", "number", { validation: { min: 5 }, rules: [rule("r", "show", [{ questionId: "a", operator: "equals", value: true }])] })], { a: true, b: 1 }],
  ["hide rule fires", [q("a", "short_text"), q("b", "short_text", { required: true, rules: [rule("r", "hide", [{ questionId: "a", operator: "is_answered" }])] })], { a: "x" }],
  ["contains is case-insensitive", [q("a", "short_text"), q("b", "short_text", { required: true, rules: [rule("r", "show", [{ questionId: "a", operator: "contains", value: "ANA" }])] })], { a: "hi ana" }],
  ["greater_than on number", [q("a", "number"), q("b", "short_text", { required: true, rules: [rule("r", "show", [{ questionId: "a", operator: "greater_than", value: 5 }])] })], { a: 3 }],
  ["or combinator", [q("a", "yes_no"), q("c", "yes_no"), q("b", "short_text", { required: true, rules: [rule("r", "show", [{ questionId: "a", operator: "equals", value: true }, { questionId: "c", operator: "equals", value: true }], "or")] })], { a: false, c: true }],
  ["not_equals on unanswered", [q("a", "short_text"), q("b", "short_text", { required: true, rules: [rule("r", "show", [{ questionId: "a", operator: "not_equals", value: "x" }])] })], {}],
  ["chained dependency collapses", [q("a", "yes_no"), q("b", "short_text", { rules: [rule("r", "show", [{ questionId: "a", operator: "equals", value: true }])] }), q("c", "short_text", { required: true, rules: [rule("r2", "show", [{ questionId: "b", operator: "is_answered" }])] })], { a: false, b: "x", c: "y" }],
];

const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]))
  : v;
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

describe("SQL validator matches the renderer's TypeScript logic", () => {
  it("errors and effective answers agree for every case in the corpus", async () => {
    const mismatches: string[] = [];
    for (const [name, questions, answers] of parityCases) {
      const parsed = FormSchema.safeParse(doc(questions));
      if (!parsed.success) throw new Error(`${name}: corpus schema is invalid: ${parsed.error.message}`);
      const form = parsed.data as FormDefinition;
      const tsErr = validateVisible(orderedQuestions(form), answers);
      const sql = (await db.query<{ r: { errors: Record<string, string>; effective: Record<string, unknown> } }>(
        `select public.validate_submission('${NIL}'::uuid, ${lit(parsed.data)}, ${lit(answers)}) as r`)).rows[0]!.r;
      if (!same(Object.keys(tsErr).sort(), Object.keys(sql.errors).sort())) {
        mismatches.push(`${name}: ts errors=${JSON.stringify(tsErr)} sql errors=${JSON.stringify(sql.errors)}`);
        continue;
      }
      if (Object.keys(tsErr).length === 0 && !same(effectiveAnswers(form, answers), sql.effective)) {
        mismatches.push(`${name}: effective answers differ`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
