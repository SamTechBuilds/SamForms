import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, as, ADMIN_ID, OTHER_ID } from "./harness";

let db: PGlite;
const admin = { role: "authenticated", uid: ADMIN_ID } as const;
const intruder = { role: "authenticated", uid: OTHER_ID } as const;
const anon = { role: "anon" } as const;
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const schema = { schemaVersion: 1, title: "N", layout: "classic", sections: [{ id: "s1", title: "M", pageBreakAfter: false }],
  questions: [{ id: "a", type: "short_text", sectionId: "s1", label: "A", required: false, config: {}, validation: {}, rules: [] }] };

beforeAll(async () => {
  db = await freshDb();
  const id = (await as(db, admin, () => db.query<{ id: string }>(
    `insert into forms (owner_id, title, slug, draft_schema) values ('${ADMIN_ID}', 'N', 'notify-form', ${lit(schema)}) returning id`))).rows[0]!.id;
  await as(db, admin, () => db.query(`select public.publish_form('${id}')`));
});

describe("AI quota (migration 0005)", () => {
  it("is admin-only and allows 30 generations per admin per hour", async () => {
    await expect(as(db, anon, () => db.query("select public.consume_ai_quota()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, intruder, () => db.query("select public.consume_ai_quota()"))).rejects.toThrow(/Only administrators/);
    const results: boolean[] = [];
    for (let i = 0; i < 31; i++) {
      results.push((await as(db, admin, () => db.query<{ ok: boolean }>("select public.consume_ai_quota() as ok"))).rows[0]!.ok);
    }
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });
});

describe("notifications (migration 0006)", () => {
  it("queues nothing while notifications are off, and queues one row per response once on", async () => {
    const fid = (await db.query<{ id: string }>("select id from forms where slug='notify-form'")).rows[0]!.id;
    await submitOne("first");
    expect(await queued()).toBe(0);

    await as(db, admin, () => db.query(`insert into notification_settings (form_id, enabled, recipient) values ('${fid}', true, 'owner@example.com')`));
    await submitOne("second");
    expect(await queued()).toBe(1);
    const row = (await db.query<{ recipient: string; status: string }>("select recipient, status from notification_queue")).rows[0]!;
    expect(row).toEqual({ recipient: "owner@example.com", status: "pending" });
  });

  it("refuses to enable notifications without a valid recipient", async () => {
    const fid = (await db.query<{ id: string }>("select id from forms where slug='notify-form'")).rows[0]!.id;
    await expect(as(db, admin, () => db.query(`update notification_settings set recipient = null where form_id='${fid}'`))).rejects.toThrow(/notification_enabled_needs_recipient/);
    await expect(as(db, admin, () => db.query(`update notification_settings set recipient = 'not-an-email' where form_id='${fid}'`))).rejects.toThrow(/check/);
  });

  it("the queue is invisible to clients, and only the service role can claim and complete", async () => {
    await expect(as(db, admin, () => db.query("select * from notification_queue"))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, () => db.query("select * from claim_notifications(5)"))).rejects.toThrow(/permission denied/);
    // The service role exists in Supabase; in this harness we act as the owner to exercise the function bodies.
    const claimed = (await db.query<{ id: number; recipient: string; form_title: string }>(
      "select id, recipient, form_title from claim_notifications(5)")).rows;
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ recipient: "owner@example.com", form_title: "N" });
    expect((await db.query<{ attempts: number }>("select attempts from notification_queue")).rows[0]!.attempts).toBe(1);
    await db.query(`select complete_notification(${claimed[0]!.id}, false, 'Provider timeout')`);
    const after = (await db.query<{ status: string; last_error: string }>("select status, last_error from notification_queue")).rows[0]!;
    expect(after).toEqual({ status: "pending", last_error: "Provider timeout" });
    await db.query(`select complete_notification(${claimed[0]!.id}, true)`);
    const sent = (await db.query<{ status: string }>("select status from notification_queue")).rows[0]!;
    expect(sent.status).toBe("sent");
  });

  it("gives up after five failed attempts", async () => {
    await submitOne("third");
    await db.query("update notification_queue set attempts = 4, status = 'pending' where status = 'pending'");
    const [row] = (await db.query<{ id: number }>("select id from claim_notifications(5)")).rows;
    await db.query(`select complete_notification(${row!.id}, false, 'still failing')`);
    expect((await db.query<{ status: string; attempts: number }>("select status, attempts from notification_queue where id=" + row!.id)).rows[0]).toEqual({ status: "failed", attempts: 5 });
  });
});

async function submitOne(tag: string) {
  return as(db, anon, () => db.query<{ r: { ok: boolean } }>(`select public.submit_response('notify-form', ${lit({ a: tag })}, null) as r`));
}
async function queued() {
  return Number((await db.query<{ n: string }>("select count(*)::text as n from notification_queue")).rows[0]!.n);
}
