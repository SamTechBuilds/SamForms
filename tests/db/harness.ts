import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Minimal emulation of the Supabase pieces the migrations depend on: roles, auth.users, auth.uid(). */
const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
export const OTHER_ID = "22222222-2222-2222-2222-222222222222";

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase/migrations");
  for (const f of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN_ID}','admin@example.com'),('${OTHER_ID}','intruder@example.com');
    insert into public.admin_users (id, email) values ('${ADMIN_ID}','admin@example.com');
  `);
  return db;
}

export type Actor = { role: "anon" } | { role: "authenticated"; uid: string };

/** Run fn with the session switched to a Supabase-like role + JWT subject, always restoring afterwards. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${actor.role === "authenticated" ? actor.uid : ""}', false); set role ${actor.role};`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
}
