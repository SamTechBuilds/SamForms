import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, as, ADMIN_ID, OTHER_ID } from "./harness";

let db: PGlite;
const admin = { role: "authenticated", uid: ADMIN_ID } as const;
const intruder = { role: "authenticated", uid: OTHER_ID } as const;
const anon = { role: "anon" } as const;
const schema = `'{"schemaVersion":1}'`;
const newForm = (slug = "client-intake", title = "Client intake") =>
  `insert into forms (owner_id,title,slug,draft_schema) values ('${ADMIN_ID}','${title}','${slug}',${schema}) returning id`;

beforeAll(async () => {
  db = await freshDb();
  // Seed data so "sees zero rows" assertions are meaningful (admin_users, forms, audit_logs, platform_settings all non-empty).
  await db.query(newForm("seed-form", "Seed form"));
});

describe("anon (public) has no access to any Phase 1 table", () => {
  for (const t of ["admin_users", "forms", "audit_logs", "platform_settings"]) {
    it(`cannot select ${t}`, async () => {
      await expect(as(db, anon, () => db.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
    });
  }
  it("cannot insert a form or call is_admin/log_audit", async () => {
    await expect(as(db, anon, () => db.query(newForm("anon-form")))).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, () => db.query("select public.is_admin()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, () => db.query("select public.log_audit('x')"))).rejects.toThrow(/permission denied/);
  });
});

describe("authenticated non-admin (e.g. a signup that slipped through) sees and does nothing", () => {
  it("is_admin() is false", async () => {
    const r = await as(db, intruder, () => db.query<{ is_admin: boolean }>("select public.is_admin()"));
    expect(r.rows[0]!.is_admin).toBe(false);
  });
  it("reads zero rows from every table (including admin_users)", async () => {
    for (const t of ["admin_users", "forms", "audit_logs", "platform_settings"]) {
      const r = await as(db, intruder, () => db.query(`select * from ${t}`));
      expect(r.rows, t).toHaveLength(0);
    }
  });
  it("cannot insert forms, settings, or audit entries; cannot self-promote", async () => {
    await expect(as(db, intruder, () => db.query(newForm("intruder-form").replace(ADMIN_ID, OTHER_ID)))).rejects.toThrow(/row-level security/);
    await expect(as(db, intruder, () => db.query("select public.log_audit('x')"))).rejects.toThrow(/not authorized/);
    await expect(as(db, intruder, () => db.query(`insert into admin_users (id,email) values ('${OTHER_ID}','intruder@example.com')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, intruder, () => db.query(`insert into platform_settings (key,value,updated_by) values ('x','1','${OTHER_ID}')`))).rejects.toThrow(/row-level security/);
  });
});

describe("admin", () => {
  it("sees only their own admin_users row and cannot modify admin_users", async () => {
    const r = await as(db, admin, () => db.query("select id from admin_users"));
    expect(r.rows).toHaveLength(1);
    await expect(as(db, admin, () => db.query("update admin_users set is_active = false"))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query("delete from admin_users"))).rejects.toThrow(/permission denied/);
  });
  it("can create, read, update status and delete forms; actions are audited server-side", async () => {
    const id = (await as(db, admin, () => db.query<{ id: string }>(newForm("lifecycle-form")))).rows[0]!.id;
    expect((await as(db, admin, () => db.query(`select * from forms where id='${id}'`))).rows).toHaveLength(1);
    await as(db, admin, () => db.query(`update forms set status='archived', archived_at=now() where id='${id}'`));
    await as(db, admin, () => db.query(`delete from forms where id='${id}'`));
    const logs = await as(db, admin, () => db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_logs where entity_id='${id}' order by created_at, action`));
    expect(logs.rows.map(l => l.action).sort()).toEqual(["form.created", "form.deleted", "form.status_changed"]);
    expect(logs.rows.every(l => l.actor_id === ADMIN_ID)).toBe(true);
  });
  it("cannot create a form owned by someone else", async () => {
    await expect(as(db, admin, () => db.query(newForm("spoof-owner").replace(ADMIN_ID, OTHER_ID)))).rejects.toThrow(/row-level security|foreign key/);
  });
  it("log_audit records the JWT subject as actor regardless of input", async () => {
    await as(db, admin, () => db.query(`select public.log_audit('auth.login','session',null,'{"ua":"test"}')`));
    const r = await as(db, admin, () => db.query<{ actor_id: string }>(`select actor_id from audit_logs where action='auth.login'`));
    expect(r.rows[0]!.actor_id).toBe(ADMIN_ID);
  });
  it("reads and updates platform_settings with defaults present", async () => {
    const r = await as(db, admin, () => db.query(`select key from platform_settings order by key`));
    expect(r.rows.map((x: any) => x.key)).toContain("retention.ai_source_documents_days");
    await as(db, admin, () => db.query(`update platform_settings set value='7', updated_by='${ADMIN_ID}' where key='retention.ai_source_documents_days'`));
    const v = await as(db, admin, () => db.query<{ value: number }>(`select value from platform_settings where key='retention.ai_source_documents_days'`));
    expect(v.rows[0]!.value).toBe(7);
  });
});

describe("audit_logs is append-only", () => {
  it("rejects UPDATE, DELETE and TRUNCATE even from the table owner", async () => {
    await expect(db.query("update audit_logs set action='tampered'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from audit_logs")).rejects.toThrow(/append-only/);
    await expect(db.query("truncate audit_logs")).rejects.toThrow(/append-only/);
  });
  it("admin has no direct INSERT/UPDATE/DELETE privilege", async () => {
    await expect(as(db, admin, () => db.query(`insert into audit_logs (action) values ('forged')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query(`delete from audit_logs`))).rejects.toThrow(/permission denied/);
  });
});

describe("constraints", () => {
  const bad = (slug: string, extra = "") =>
    db.query(`insert into forms (owner_id,title,slug,draft_schema${extra ? "," + extra.split("|")[0] : ""}) values ('${ADMIN_ID}','T','${slug}',${schema}${extra ? "," + extra.split("|")[1] : ""})`);
  it("enforces slug format, uniqueness and length", async () => {
    for (const s of ["Bad Slug", "ab", "-lead", "trail-", "double--dash", "UPPER-case", "a".repeat(65)])
      await expect(bad(s), s).rejects.toThrow(/forms_slug_format/);
    await bad("unique-slug");
    await expect(bad("unique-slug")).rejects.toThrow(/forms_slug_key/);
  });
  it("enforces status values and the published/archived invariants", async () => {
    await expect(bad("odd-status", "status|'weird'")).rejects.toThrow(/status_check/);
    await expect(bad("pub-no-version", "status|'published'")).rejects.toThrow(/forms_published_has_version/);
    await expect(bad("arch-no-ts", "status|'archived'")).rejects.toThrow(/forms_archived_has_timestamp/);
  });
  it("requires an object draft_schema and a non-blank title", async () => {
    await expect(db.query(`insert into forms (owner_id,title,slug,draft_schema) values ('${ADMIN_ID}','T','arr-schema','[]')`)).rejects.toThrow(/check/);
    await expect(db.query(`insert into forms (owner_id,title,slug,draft_schema) values ('${ADMIN_ID}','   ','blank-title',${schema})`)).rejects.toThrow(/check/);
  });
  it("allows only one super admin and lowercase emails", async () => {
    await db.exec(`insert into auth.users (id,email) values ('33333333-3333-3333-3333-333333333333','x@example.com')`);
    await expect(db.query(`insert into admin_users (id,email) values ('33333333-3333-3333-3333-333333333333','x@example.com')`)).rejects.toThrow(/single_super_admin/);
    await expect(db.query(`update admin_users set email='ADMIN@Example.com'`)).rejects.toThrow(/email_lower/);
  });
  it("maintains updated_at", async () => {
    const id = (await db.query<{ id: string }>(newForm("touch-me"))).rows[0]!.id;
    const a = (await db.query<{ updated_at: string }>(`select updated_at from forms where id='${id}'`)).rows[0]!.updated_at;
    await new Promise(r => setTimeout(r, 15));
    await db.query(`update forms set title='Renamed' where id='${id}'`);
    const b = (await db.query<{ updated_at: string }>(`select updated_at from forms where id='${id}'`)).rows[0]!.updated_at;
    expect(new Date(b).getTime()).toBeGreaterThan(new Date(a).getTime());
  });
  it("blocks deleting an admin who owns forms", async () => {
    await expect(db.query(`delete from admin_users where id='${ADMIN_ID}'`)).rejects.toThrow(/foreign key/);
  });
});

describe("RLS coverage", () => {
  it("every public table has RLS enabled (count grows as later migrations add tables)", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
    expect(r.rows.map(x => x.relname).sort()).toEqual([
      "admin_users", "audit_logs", "form_templates", "form_versions", "forms", "pending_uploads",
      "platform_settings", "rate_limit_events", "storage_cleanup", "submission_files", "submissions",
    ]);
    expect(r.rows.every(x => x.relrowsecurity)).toBe(true);
  });
});
