import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, as, ADMIN_ID, OTHER_ID } from "./harness";

let db: PGlite;
const admin = { role: "authenticated", uid: ADMIN_ID } as const;
const intruder = { role: "authenticated", uid: OTHER_ID } as const;
const anon = { role: "anon" } as const;
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const schema = {
  schemaVersion: 1, title: "Stats", layout: "classic",
  sections: [{ id: "s1", title: "Main", pageBreakAfter: false }],
  questions: [
    { id: "tier", type: "single_choice", sectionId: "s1", label: "Tier", required: false, config: {}, validation: {}, rules: [],
      options: [{ id: "a", label: "A", value: "a" }, { id: "b", label: "B", value: "b" }] },
    { id: "tags", type: "multiple_choice", sectionId: "s1", label: "Tags", required: false, config: {}, validation: {}, rules: [],
      options: [{ id: "x", label: "X", value: "x" }, { id: "y", label: "Y", value: "y" }] },
    { id: "score", type: "star_rating", sectionId: "s1", label: "Score", required: false, config: {}, validation: {}, rules: [] },
    { id: "doc", type: "file_upload", sectionId: "s1", label: "Doc", required: false, config: {}, validation: { allowedMimeTypes: ["application/pdf"], maxFileSizeMb: 1, maxFiles: 1 }, rules: [] },
  ],
};

const submit = (answers: unknown) =>
  as(db, anon, () => db.query<{ r: { ok: boolean; id?: string } }>(`select public.submit_response('stats-form', ${lit(answers)}, null) as r`)).then(r => r.rows[0]!.r);

beforeAll(async () => {
  db = await freshDb();
  const id = (await as(db, admin, () => db.query<{ id: string }>(
    `insert into forms (owner_id, title, slug, draft_schema) values ('${ADMIN_ID}', 'Stats', 'stats-form', ${lit(schema)}) returning id`))).rows[0]!.id;
  await as(db, admin, () => db.query(`select public.publish_form('${id}')`));
});

describe("response_stats", () => {
  it("is admin-only", async () => {
    await expect(as(db, anon, () => db.query("select public.response_stats((select id from forms limit 1))"))).rejects.toThrow(/permission denied/);
    await expect(as(db, intruder, () => db.query("select public.response_stats((select id from forms limit 1))"))).rejects.toThrow(/Only administrators/);
  });

  it("aggregates choices, multiple choices and ratings, skipping unanswered values", async () => {
    await submit({ tier: "a", tags: ["x", "y"], score: 4 });
    await submit({ tier: "a", tags: ["x"], score: 2 });
    await submit({ tier: "b", tags: [] });
    const formId = (await db.query<{ id: string }>("select id from forms where slug='stats-form'")).rows[0]!.id;
    const stats = (await as(db, admin, () => db.query<{ s: any }>(`select public.response_stats('${formId}', 'UTC') as s`))).rows[0]!.s;
    expect(stats.total).toBe(3);
    expect(stats.last_7_days).toBe(3);
    expect(stats.per_day).toHaveLength(30);
    expect(stats.per_day.reduce((n: number, d: { count: number }) => n + d.count, 0)).toBe(3);
    const byId = Object.fromEntries(stats.questions.map((q: any) => [q.id, q]));
    expect(byId.tier).toMatchObject({ answered: 3, breakdown: [{ value: "a", count: 2 }, { value: "b", count: 1 }] });
    expect(byId.tags).toMatchObject({ answered: 2, breakdown: [{ value: "x", count: 2 }, { value: "y", count: 1 }] });
    expect(byId.score.breakdown).toEqual({ count: 2, average: 3, min: 2, max: 4 });
  });

  it("rejects unknown time zones and missing forms", async () => {
    const formId = (await db.query<{ id: string }>("select id from forms where slug='stats-form'")).rows[0]!.id;
    await expect(as(db, admin, () => db.query(`select public.response_stats('${formId}', 'Mars/Olympus')`))).rejects.toThrow(/Unknown time zone/);
    await expect(as(db, admin, () => db.query(`select public.response_stats('00000000-0000-0000-0000-000000000001')`))).rejects.toThrow(/Form not found/);
  });
});

describe("delete_submission", () => {
  it("is admin-only, returns and queues the response's files, and removes the response", async () => {
    const up = (await as(db, anon, () => db.query<{ r: { upload_id: string; path: string } }>(
      `select public.request_upload('stats-form', 'doc', 'brief.pdf', 'application/pdf', 100) as r`))).rows[0]!.r;
    const r = await submit({ tier: "b", doc: [{ id: up.upload_id }] });
    expect(r.ok).toBe(true);

    await expect(as(db, intruder, () => db.query(`select public.delete_submission('${r.id}')`))).rejects.toThrow(/Only administrators/);
    await expect(as(db, anon, () => db.query(`select public.delete_submission('${r.id}')`))).rejects.toThrow(/permission denied/);

    const paths = (await as(db, admin, () => db.query<{ p: string[] }>(`select public.delete_submission('${r.id}') as p`))).rows[0]!.p;
    expect(paths).toEqual([up.path]);
    expect(Number((await db.query<{ n: string }>(`select count(*)::text as n from submissions where id='${r.id}'`)).rows[0]!.n)).toBe(0);
    expect(Number((await db.query<{ n: string }>(`select count(*)::text as n from submission_files where submission_id='${r.id}'`)).rows[0]!.n)).toBe(0);
    const queued = (await db.query<{ n: string }>(`select count(*)::text as n from storage_cleanup where storage_path='${up.path}'`)).rows[0]!.n;
    expect(queued).toBe("1");

    const removed = (await as(db, admin, () => db.query<{ n: number }>(`select public.finish_storage_cleanup(array['${up.path}']) as n`))).rows[0]!.n;
    expect(removed).toBe(1);
  });

  it("reports unknown responses", async () => {
    await expect(as(db, admin, () => db.query(`select public.delete_submission('00000000-0000-0000-0000-000000000002')`))).rejects.toThrow(/Response not found/);
  });
});
