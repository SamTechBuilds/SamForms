import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, as, ADMIN_ID, OTHER_ID } from "./harness";
import { FIELD_TYPES, FormSchema } from "@/schema/form";
import { validateFormDeep } from "@/fields/validate";
import { blankForm } from "@/features/builder/factory";

let db: PGlite;
const admin = { role: "authenticated", uid: ADMIN_ID } as const;
const intruder = { role: "authenticated", uid: OTHER_ID } as const;
const anon = { role: "anon" } as const;

const validSchema = (title = "Client intake") => ({
  schemaVersion: 1, title, layout: "conversational",
  sections: [{ id: "s1", title: "Main", pageBreakAfter: false }],
  questions: [
    { id: "q1", type: "short_text", sectionId: "s1", label: "Name", required: true, config: {}, validation: {}, rules: [] },
    { id: "q2", type: "single_choice", sectionId: "s1", label: "Pick", required: false, config: {}, validation: {},
      options: [{ id: "a", label: "A", value: "a" }], rules: [{ id: "r1", combinator: "and", conditions: [{ questionId: "q1", operator: "is_answered" }], action: { type: "show" } }] },
  ],
});
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

async function createForm(slug: string, schema: unknown = validSchema()) {
  const r = await as(db, admin, () => db.query<{ id: string }>(
    `insert into forms (owner_id,title,slug,draft_schema) values ('${ADMIN_ID}','T','${slug}',${lit(schema)}) returning id`));
  return r.rows[0]!.id;
}
const publish = (id: string, actor: Parameters<typeof as>[1] = admin, rev: number | null = null) =>
  as(db, actor, () => db.query<{ publish_form: { id: string; version: number; reused: boolean } }>(
    `select public.publish_form('${id}'${rev === null ? "" : `, ${rev}`})`)).then(r => r.rows[0]!.publish_form);
const formRow = (id: string) => db.query<{ status: string; published_version_id: string | null; draft_revision: number; published_revision: number | null }>(
  `select status, published_version_id, draft_revision, published_revision from forms where id='${id}'`).then(r => r.rows[0]!);

beforeAll(async () => { db = await freshDb(); });

describe("schema guard stays in sync with the canonical TypeScript schema", () => {
  it("form_field_types() equals FIELD_TYPES", async () => {
    const r = await db.query<{ t: string[] }>("select public.form_field_types() as t");
    expect(r.rows[0]!.t).toEqual([...FIELD_TYPES]);
  });
  it("SQL validator and Zod agree on representative valid and invalid documents", async () => {
    const valid = validSchema();
    const cases: [string, unknown][] = [
      ["valid", valid],
      ["blank form from the builder factory", blankForm("Untitled")],
      ["bad version", { ...valid, schemaVersion: 2 }],
      ["empty title", { ...valid, title: "" }],
      ["no sections", { ...valid, sections: [] }],
      ["unknown type", { ...valid, questions: [{ ...valid.questions[0], type: "hologram" }] }],
      ["unknown section", { ...valid, questions: [{ ...valid.questions[0], sectionId: "nope" }] }],
      ["duplicate ids", { ...valid, questions: [valid.questions[0], { ...valid.questions[1], id: "q1" }] }],
      ["choice without options", { ...valid, questions: [valid.questions[0], { ...valid.questions[1], options: [] }] }],
      ["dangling rule", { ...valid, questions: [valid.questions[0], { ...valid.questions[1], rules: [{ id: "r", combinator: "and", conditions: [{ questionId: "ghost", operator: "is_empty" }], action: { type: "show" } }] }] }],
      ["goto unknown section", { ...valid, questions: [valid.questions[0], { ...valid.questions[1], rules: [{ id: "r", combinator: "or", conditions: [{ questionId: "q1", operator: "is_empty" }], action: { type: "goto_section", sectionId: "zz" } }] }] }],
      ["bad id chars", { ...valid, questions: [{ ...valid.questions[0], id: "has space" }] }],
    ];
    for (const [name, doc] of cases) {
      const sql = (await db.query<{ e: string[] }>(`select public.validate_form_schema(${lit(doc)}) as e`)).rows[0]!.e;
      expect(sql.length === 0, `${name}: sql=${JSON.stringify(sql)}`).toBe(FormSchema.safeParse(doc).success);
    }
  });
});

describe("anon and non-admins", () => {
  it("anon cannot read versions/templates or call publish_form", async () => {
    await expect(as(db, anon, () => db.query("select * from form_versions"))).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, () => db.query("select * from form_templates"))).rejects.toThrow(/permission denied/);
    const id = await createForm("anon-target");
    await expect(as(db, anon, () => db.query(`select public.publish_form('${id}')`))).rejects.toThrow(/permission denied/);
    expect((await formRow(id)).status).toBe("draft");
  });
  it("an authenticated non-admin cannot publish and sees zero versions/templates", async () => {
    const id = await createForm("intruder-target");
    await publish(id); // ensure there is something to (not) see
    await expect(publish(id, intruder)).rejects.toThrow(/not authorized/);
    for (const t of ["form_versions", "form_templates"]) {
      expect((await as(db, intruder, () => db.query(`select * from ${t}`))).rows, t).toHaveLength(0);
    }
    await expect(as(db, intruder, () => db.query(
      `insert into form_templates (name, schema, created_by) values ('x', ${lit(validSchema())}, '${OTHER_ID}')`))).rejects.toThrow(/row-level security/);
  });
});

describe("publishing and immutable versions", () => {
  it("publishes v1, records history, audits, and links the form", async () => {
    const id = await createForm("publish-me");
    const v1 = await publish(id);
    expect(v1.version).toBe(1);
    const f = await formRow(id);
    expect(f).toMatchObject({ status: "published", published_version_id: v1.id, published_revision: 0 });
    const audit = await db.query<{ action: string; actor_id: string }>(`select action, actor_id from audit_logs where entity_id='${id}' and action='form.published'`);
    expect(audit.rows).toEqual([{ action: "form.published", actor_id: ADMIN_ID }]);
    const ver = await as(db, admin, () => db.query<{ schema: unknown; published_by: string }>(`select schema, published_by from form_versions where id='${v1.id}'`));
    expect(ver.rows[0]!.published_by).toBe(ADMIN_ID);
    expect(FormSchema.safeParse(ver.rows[0]!.schema).success).toBe(true);
  });

  it("editing a published form changes only the draft; republishing creates v2 and keeps v1 untouched", async () => {
    const id = await createForm("edit-after-publish");
    const v1 = await publish(id);
    await as(db, admin, () => db.query(`update forms set draft_schema=${lit(validSchema("Edited title"))} where id='${id}'`));
    let f = await formRow(id);
    expect(f.draft_revision).toBe(1);
    expect(f.published_version_id).toBe(v1.id); // public version unchanged until republish
    const v2 = await publish(id, admin, 1);
    expect(v2.version).toBe(2);
    f = await formRow(id);
    expect(f.published_version_id).toBe(v2.id);
    const hist = await as(db, admin, () => db.query<{ version: number; title: string }>(`select version, title from form_versions where form_id='${id}' order by version`));
    expect(hist.rows).toEqual([{ version: 1, title: "Client intake" }, { version: 2, title: "Edited title" }]);
  });

  it("re-publishing identical content re-uses the latest version", async () => {
    const id = await createForm("idempotent");
    const v1 = await publish(id);
    const again = await publish(id);
    expect(again).toMatchObject({ id: v1.id, version: 1, reused: true });
  });

  it("versions cannot be modified or deleted by anyone, even the table owner", async () => {
    const id = await createForm("immutable");
    const v = await publish(id);
    await expect(db.query(`update form_versions set title='hacked' where id='${v.id}'`)).rejects.toThrow(/immutable/);
    await expect(db.query(`delete from form_versions where id='${v.id}'`)).rejects.toThrow(/immutable/);
    await expect(db.query(`truncate form_versions cascade`)).rejects.toThrow(/immutable/);
    await expect(as(db, admin, () => db.query(`update form_versions set title='x'`))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query(`delete from form_versions`))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query(
      `insert into form_versions (form_id, version, title, schema) values ('${id}', 99, 'x', ${lit(validSchema())})`))).rejects.toThrow(/permission denied/);
  });

  it("rejects publishing an invalid draft and leaves the form unpublished", async () => {
    const id = await createForm("invalid-draft", { ...validSchema(), questions: [{ ...validSchema().questions[1], options: [] }] });
    await expect(publish(id)).rejects.toThrow(/schema is invalid: .*needs options/);
    expect((await formRow(id)).status).toBe("draft");
    expect((await db.query(`select 1 from form_versions where form_id='${id}'`)).rows).toHaveLength(0);
  });

  it("rejects a stale expected revision (concurrent edit)", async () => {
    const id = await createForm("stale-rev");
    await as(db, admin, () => db.query(`update forms set draft_schema=${lit(validSchema("v2"))} where id='${id}'`));
    await expect(publish(id, admin, 0)).rejects.toThrow(/draft has changed/);
  });

  it("archived forms must be restored before publishing", async () => {
    const id = await createForm("archived-pub");
    await as(db, admin, () => db.query(`update forms set status='archived', archived_at=now() where id='${id}'`));
    await expect(publish(id)).rejects.toThrow(/archived forms cannot be published/);
  });

  it("unpublish returns the form to draft but keeps history; republish of unchanged content re-uses the version", async () => {
    const id = await createForm("unpublish");
    const v1 = await publish(id);
    await as(db, admin, () => db.query(`update forms set status='draft' where id='${id}'`));
    expect((await formRow(id)).status).toBe("draft");
    const again = await publish(id);
    expect(again).toMatchObject({ id: v1.id, reused: true });
  });
});

describe("lifecycle guards", () => {
  it("a client cannot publish by direct update or repoint published_version_id", async () => {
    const id = await createForm("direct-publish");
    await expect(as(db, admin, () => db.query(`update forms set status='published' where id='${id}'`))).rejects.toThrow(/publish_form|published_has_version/);
    const v = await publish(id);
    await as(db, admin, () => db.query(`update forms set status='draft' where id='${id}'`));
    await expect(as(db, admin, () => db.query(`update forms set status='published' where id='${id}'`))).rejects.toThrow(/only be published through publish_form/);
    await expect(as(db, admin, () => db.query(`update forms set published_version_id=null where id='${id}'`))).rejects.toThrow(/permission denied/);
    await expect(db.query(`update forms set published_version_id=null where id='${id}'`)).rejects.toThrow(/publish_form/);
    expect((await formRow(id)).published_version_id).toBe(v.id);
  });
  it("draft_revision is server-maintained", async () => {
    const id = await createForm("revision");
    await expect(as(db, admin, () => db.query(`update forms set draft_revision=42 where id='${id}'`))).rejects.toThrow(/permission denied/);
    await as(db, admin, () => db.query(`update forms set title='Renamed only' where id='${id}'`));
    expect((await formRow(id)).draft_revision).toBe(0);
    await as(db, admin, () => db.query(`update forms set draft_schema=${lit(validSchema("x"))} where id='${id}'`));
    expect((await formRow(id)).draft_revision).toBe(1);
  });
  it("a form cannot point at another form's version (composite FK)", async () => {
    const a = await createForm("fk-a"); const b = await createForm("fk-b");
    const va = await publish(a);
    await db.exec("select set_config('samforms.publishing','on',false)");
    try {
      await expect(db.query(`update forms set published_version_id='${va.id}' where id='${b}'`)).rejects.toThrow(/forms_published_version_fk/);
    } finally { await db.exec("select set_config('samforms.publishing','',false)"); }
  });
  it("draft (never published) forms can be deleted; published ones cannot", async () => {
    const d = await createForm("delete-draft");
    await as(db, admin, () => db.query(`delete from forms where id='${d}'`));
    expect((await db.query(`select 1 from forms where id='${d}'`)).rows).toHaveLength(0);
    const p = await createForm("delete-published");
    await publish(p);
    await expect(as(db, admin, () => db.query(`delete from forms where id='${p}'`))).rejects.toThrow(/archive it instead/);
  });
  it("clients cannot insert forms with server-controlled columns", async () => {
    await expect(as(db, admin, () => db.query(
      `insert into forms (owner_id,title,slug,draft_schema,status) values ('${ADMIN_ID}','T','sneaky',${lit(validSchema())},'archived')`))).rejects.toThrow(/permission denied/);
  });
});

describe("form_templates", () => {
  it("ships system templates that pass the canonical Zod schema and the field registry", async () => {
    const r = await as(db, admin, () => db.query<{ name: string; schema: unknown; is_system: boolean }>("select name, schema, is_system from form_templates where is_system"));
    expect(r.rows.length).toBeGreaterThanOrEqual(5);
    for (const t of r.rows) {
      const res = validateFormDeep(t.schema);
      expect(res.issues, t.name).toEqual([]);
    }
  });
  it("admin can create, update and delete custom templates but not touch system ones", async () => {
    const ins = await as(db, admin, () => db.query<{ id: string }>(
      `insert into form_templates (name, category, schema, created_by) values ('Mine','general',${lit(validSchema())},'${ADMIN_ID}') returning id`));
    const id = ins.rows[0]!.id;
    await as(db, admin, () => db.query(`update form_templates set name='Mine v2' where id='${id}'`));
    await as(db, admin, () => db.query(`delete from form_templates where id='${id}'`));
    const actions = await db.query<{ action: string }>(`select action from audit_logs where entity_id='${id}' order by action`);
    expect(actions.rows.map(a => a.action)).toEqual(["template.created", "template.deleted"]);

    const sys = (await db.query<{ id: string }>("select id from form_templates where is_system limit 1")).rows[0]!.id;
    const upd = await as(db, admin, () => db.query(`update form_templates set name='x' where id='${sys}'`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(db, admin, () => db.query(`delete from form_templates where id='${sys}'`));
    expect(del.affectedRows).toBe(0);
    await expect(as(db, admin, () => db.query(
      `insert into form_templates (name, schema, created_by, is_system) values ('fake system', ${lit(validSchema())}, null, true)`))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query(
      `insert into form_templates (name, schema, created_by) values ('spoof', ${lit(validSchema())}, '${OTHER_ID}')`))).rejects.toThrow(/row-level security|foreign key/);
  });
  it("rejects templates whose schema is structurally invalid", async () => {
    await expect(as(db, admin, () => db.query(
      `insert into form_templates (name, schema, created_by) values ('bad', '{"schemaVersion":1}'::jsonb, '${ADMIN_ID}')`))).rejects.toThrow(/form_templates_schema_valid/);
  });
});
