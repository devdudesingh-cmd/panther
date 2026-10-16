import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Boots an in-memory Postgres (PGlite) with the Supabase bits our migration
 * expects (auth.users, auth.uid(), the three roles), then applies
 * supabase/migrations/0001_init.sql. Storage policies (0002) are Supabase-only.
 */
export async function createTestDb() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
  `);

  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
  await db.exec(sql);

  // Mirror Supabase's default grants so RLS policies are what actually gates access.
  await db.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to authenticated, service_role;
    grant all on all sequences in schema public to authenticated, service_role;
  `);

  async function createParent(email: string) {
    const r = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
    return r.rows[0].id;
  }

  /** Run `fn` as the `authenticated` role with auth.uid() = parentId (RLS applies). */
  async function asParent<T>(parentId: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${parentId}', false);`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  }

  return { db, createParent, asParent };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Map a Postgres error from book_slot()/move_session() to its code string. */
export function pgErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/\b(BOOKINGS_PAUSED|SLOT_PAST|SLOT_BLOCKED|TRIAL_USED|PARENT_OVERLAP|SLOT_FULL|NOT_ACTIVE)\b/);
  return m ? m[1] : msg;
}
