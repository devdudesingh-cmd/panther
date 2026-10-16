-- Panther — initial schema
-- Runs on Supabase Postgres. Also runs on PGlite in tests (see tests/db/harness.ts),
-- which stubs the `auth` schema the way Supabase provides it.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ───────────────────────── Types ─────────────────────────
do $$ begin
  create type session_kind as enum ('trial', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('held', 'confirmed', 'completed', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type flag_severity as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- ───────────────────────── Helpers ─────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Parents ─────────────────────────
-- One row per parent account. Only parents have accounts (COPPA).
create table if not exists parents (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  timezone text not null default 'America/Los_Angeles',
  -- Parent confirmed they are 18+ and the child's parent/guardian.
  adult_guardian_confirmed_at timestamptz,
  -- Stripe Customer, created on first checkout. Stripe holds the card; we never see it.
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger parents_updated_at before update on parents
  for each row execute function set_updated_at();

-- Create the parent row automatically when Supabase Auth creates the user.
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into parents (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ───────────────────────── Children ─────────────────────────
-- Only a first name and grade. Never a last name, email or photo.
create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 40),
  grade smallint not null check (grade between 1 and 12),
  created_at timestamptz not null default now()
);
create index if not exists children_parent_idx on children (parent_id);

-- ───────────────────────── Sessions ─────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  child_id uuid references children (id) on delete set null,
  kind session_kind not null,
  status session_status not null default 'held',

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- ends_at + buffer. The exclusion constraint below works on [starts_at, block_until).
  block_until timestamptz not null,
  -- Which of the N simultaneous seats this session occupies.
  seat smallint not null check (seat >= 1),
  hold_expires_at timestamptz,

  topic text,
  parent_timezone text not null default 'America/Los_Angeles',

  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  stripe_checkout_id text unique,
  stripe_payment_intent text,
  stripe_setup_intent text,
  stripe_refund_id text,
  paid_at timestamptz,
  refunded_at timestamptz,

  meet_space text,
  meet_url text,
  calendar_event_id text,

  recall_bot_id text,
  bot_status text,
  bot_status_at timestamptz,

  recap text,
  practice jsonb,
  practice_token text unique default encode(gen_random_bytes(16), 'hex'),
  recap_ready_at timestamptz,

  confirmation_sent_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  fulfilled_at timestamptz,
  fulfillment_error text,

  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sessions_time_order check (ends_at > starts_at and block_until >= ends_at)
);
create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

create index if not exists sessions_parent_idx on sessions (parent_id, starts_at desc);
create index if not exists sessions_starts_idx on sessions (starts_at) where status in ('held', 'confirmed');
create index if not exists sessions_hold_idx on sessions (hold_expires_at) where status = 'held';
create index if not exists sessions_bot_idx on sessions (recall_bot_id) where recall_bot_id is not null;

-- THE double-booking guard. No two active sessions may share a seat while
-- their [start, end + buffer) ranges overlap. Enforced by Postgres itself,
-- so it holds under concurrent requests.
alter table sessions drop constraint if exists sessions_seat_no_overlap;
alter table sessions add constraint sessions_seat_no_overlap
  exclude using gist (
    seat with =,
    tstzrange(starts_at, block_until, '[)') with &&
  ) where (status in ('held', 'confirmed'));

-- A parent can't hold two sessions at the same time either.
alter table sessions drop constraint if exists sessions_parent_no_overlap;
alter table sessions add constraint sessions_parent_no_overlap
  exclude using gist (
    parent_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('held', 'confirmed'));

-- One free trial per parent account. Expired holds (abandoned checkout) don't
-- count; a cancelled trial does — reschedule instead of cancelling.
create unique index if not exists sessions_one_trial_per_parent
  on sessions (parent_id) where (kind = 'trial' and status <> 'expired');

-- ───────────────────────── Notes / homework uploads ─────────────────────────
create table if not exists session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  parent_id uuid not null references parents (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);
create index if not exists session_files_session_idx on session_files (session_id);

-- ───────────────────────── Consents (append-only) ─────────────────────────
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  policy_version text not null,
  consented_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);
create index if not exists consents_parent_idx on consents (parent_id);

-- ───────────────────────── Trial claims ─────────────────────────
-- Hashes only. They outlive account/child deletion on purpose so a family
-- can't claim a second free trial by deleting and re-signing up.
create table if not exists trial_claims (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique,
  card_fingerprint text unique,
  phone_hash text,
  parent_id uuid references parents (id) on delete set null,
  session_id uuid references sessions (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists trial_claims_phone_idx on trial_claims (phone_hash) where phone_hash is not null;

-- ───────────────────────── Admin & ops ─────────────────────────
create table if not exists blocked_times (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references parents (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint blocked_times_order check (ends_at > starts_at)
);
create index if not exists blocked_times_range_idx on blocked_times using gist (tstzrange(starts_at, ends_at, '[)'));

create table if not exists app_settings (
  id smallint primary key default 1 check (id = 1),
  bookings_paused boolean not null default false,
  paused_message text,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict do nothing;

-- Stripe webhook idempotency: an event id is processed at most once.
create table if not exists stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- Recall webhook log (also idempotency for bot events).
create table if not exists recall_events (
  event_id text primary key,
  bot_id text,
  code text,
  sub_code text,
  payload jsonb,
  received_at timestamptz not null default now()
);
create index if not exists recall_events_bot_idx on recall_events (bot_id, received_at desc);

create table if not exists payment_failures (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references parents (id) on delete set null,
  session_id uuid references sessions (id) on delete set null,
  stripe_object_id text,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists safety_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions (id) on delete set null,
  severity flag_severity not null default 'medium',
  note text not null,
  raised_by text not null default 'agent',
  alerted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references parents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists safety_flags_open_idx on safety_flags (created_at desc) where resolved_at is null;

-- ───────────────────────── Booking functions ─────────────────────────

-- Expire holds whose checkout window ran out. Called by book_slot() and the cron.
create or replace function expire_stale_holds() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update sessions set status = 'expired'
   where status = 'held' and hold_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Reserve a slot: creates a 'held' session on the first free seat, or raises
-- one of: BOOKINGS_PAUSED, SLOT_PAST, SLOT_BLOCKED, TRIAL_USED, PARENT_OVERLAP, SLOT_FULL.
create or replace function book_slot(
  p_parent_id uuid,
  p_child_id uuid,
  p_kind session_kind,
  p_starts_at timestamptz,
  p_minutes integer,
  p_buffer_minutes integer,
  p_max_seats integer,
  p_hold_minutes integer,
  p_topic text,
  p_price_cents integer,
  p_parent_timezone text
) returns sessions
language plpgsql security definer set search_path = public as $$
declare
  v_ends timestamptz := p_starts_at + make_interval(mins => p_minutes);
  v_block timestamptz := p_starts_at + make_interval(mins => p_minutes + p_buffer_minutes);
  v_seat integer;
  v_row sessions;
  v_constraint text;
begin
  perform expire_stale_holds();

  if (select bookings_paused from app_settings where id = 1) then
    raise exception 'BOOKINGS_PAUSED' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() then
    raise exception 'SLOT_PAST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from blocked_times b
     where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)')
  ) then
    raise exception 'SLOT_BLOCKED' using errcode = 'P0001';
  end if;
  if p_kind = 'trial' and exists (
    select 1 from sessions s
     where s.parent_id = p_parent_id and s.kind = 'trial' and s.status <> 'expired'
  ) then
    raise exception 'TRIAL_USED' using errcode = 'P0001';
  end if;

  for v_seat in 1..greatest(p_max_seats, 1) loop
    begin
      insert into sessions (
        parent_id, child_id, kind, status, starts_at, ends_at, block_until, seat,
        hold_expires_at, topic, price_cents, parent_timezone
      ) values (
        p_parent_id, p_child_id, p_kind, 'held', p_starts_at, v_ends, v_block, v_seat,
        now() + make_interval(mins => p_hold_minutes), p_topic, p_price_cents,
        coalesce(p_parent_timezone, 'America/Los_Angeles')
      ) returning * into v_row;
      return v_row;
    exception
      when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'sessions_parent_no_overlap' then
          raise exception 'PARENT_OVERLAP' using errcode = 'P0001';
        end if;
        -- seat taken: try the next one
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'sessions_one_trial_per_parent' then
          raise exception 'TRIAL_USED' using errcode = 'P0001';
        end if;
        raise;
    end;
  end loop;

  raise exception 'SLOT_FULL' using errcode = 'P0001';
end $$;

-- Move an existing active session to a new start time (reschedule), keeping
-- everything else. Raises SLOT_PAST, SLOT_BLOCKED, SLOT_FULL, NOT_ACTIVE.
create or replace function move_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_buffer_minutes integer,
  p_max_seats integer
) returns sessions
language plpgsql security definer set search_path = public as $$
declare
  v_row sessions;
  v_minutes integer;
  v_ends timestamptz;
  v_block timestamptz;
  v_seat integer;
  v_constraint text;
begin
  select * into v_row from sessions where id = p_session_id for update;
  if not found or v_row.status not in ('held', 'confirmed') then
    raise exception 'NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() then
    raise exception 'SLOT_PAST' using errcode = 'P0001';
  end if;
  v_minutes := extract(epoch from (v_row.ends_at - v_row.starts_at))::integer / 60;
  v_ends := p_starts_at + make_interval(mins => v_minutes);
  v_block := p_starts_at + make_interval(mins => v_minutes + p_buffer_minutes);

  if exists (
    select 1 from blocked_times b
     where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)')
  ) then
    raise exception 'SLOT_BLOCKED' using errcode = 'P0001';
  end if;

  for v_seat in 1..greatest(p_max_seats, 1) loop
    begin
      update sessions
         set starts_at = p_starts_at, ends_at = v_ends, block_until = v_block, seat = v_seat,
             reminder_24h_sent_at = null, reminder_1h_sent_at = null
       where id = p_session_id
       returning * into v_row;
      return v_row;
    exception when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessions_parent_no_overlap' then
        raise exception 'PARENT_OVERLAP' using errcode = 'P0001';
      end if;
    end;
  end loop;

  raise exception 'SLOT_FULL' using errcode = 'P0001';
end $$;

-- A payment arrived after the 10-minute hold lapsed. Try to take the same
-- time again (any free seat). Raises NOT_ACTIVE, SLOT_PAST, SLOT_FULL.
create or replace function revive_hold(
  p_session_id uuid,
  p_buffer_minutes integer,
  p_max_seats integer,
  p_hold_minutes integer
) returns sessions
language plpgsql security definer set search_path = public as $$
declare
  v_row sessions;
  v_seat integer;
  v_constraint text;
begin
  select * into v_row from sessions where id = p_session_id for update;
  if not found or v_row.status <> 'expired' then
    raise exception 'NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_row.starts_at <= now() then
    raise exception 'SLOT_PAST' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from blocked_times b
     where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_row.starts_at, v_row.ends_at, '[)')
  ) then
    raise exception 'SLOT_BLOCKED' using errcode = 'P0001';
  end if;

  for v_seat in 1..greatest(p_max_seats, 1) loop
    begin
      update sessions
         set status = 'held', seat = v_seat,
             block_until = ends_at + make_interval(mins => p_buffer_minutes),
             hold_expires_at = now() + make_interval(mins => p_hold_minutes)
       where id = p_session_id
       returning * into v_row;
      return v_row;
    exception
      when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'sessions_parent_no_overlap' then
          raise exception 'PARENT_OVERLAP' using errcode = 'P0001';
        end if;
      when unique_violation then
        raise exception 'TRIAL_USED' using errcode = 'P0001';
    end;
  end loop;

  raise exception 'SLOT_FULL' using errcode = 'P0001';
end $$;

-- "Delete my child's data": removes the child row and scrubs everything that
-- could describe the child from their sessions. Trial claims (hashes) stay.
create or replace function delete_child_data(p_parent_id uuid, p_child_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update sessions
     set topic = null, recap = null, practice = null, child_id = null
   where parent_id = p_parent_id and child_id = p_child_id;
  get diagnostics n = row_count;
  delete from session_files
   where parent_id = p_parent_id
     and session_id in (select id from sessions where parent_id = p_parent_id and child_id is null);
  delete from children where id = p_child_id and parent_id = p_parent_id;
  return n;
end $$;

-- ───────────────────────── Row-level security ─────────────────────────
alter table parents enable row level security;
alter table children enable row level security;
alter table sessions enable row level security;
alter table session_files enable row level security;
alter table consents enable row level security;
alter table trial_claims enable row level security;
alter table blocked_times enable row level security;
alter table app_settings enable row level security;
alter table stripe_events enable row level security;
alter table recall_events enable row level security;
alter table payment_failures enable row level security;
alter table safety_flags enable row level security;

-- Parents: own row only.
drop policy if exists parents_select_own on parents;
create policy parents_select_own on parents for select to authenticated using (id = auth.uid());
drop policy if exists parents_update_own on parents;
create policy parents_update_own on parents for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Children: full control over your own kids' rows.
drop policy if exists children_own on children;
create policy children_own on children for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- Sessions: read your own. All writes go through server routes (service role).
drop policy if exists sessions_select_own on sessions;
create policy sessions_select_own on sessions for select to authenticated using (parent_id = auth.uid());

-- Uploaded notes: private to the parent who uploaded them.
drop policy if exists session_files_own on session_files;
create policy session_files_own on session_files for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- Consents: read your own; written by the server.
drop policy if exists consents_select_own on consents;
create policy consents_select_own on consents for select to authenticated using (parent_id = auth.uid());

-- Everything else has no policies: only the service role (server) can touch it.

-- Functions are security definer; keep them away from anon/authenticated callers.
revoke all on function book_slot(uuid, uuid, session_kind, timestamptz, integer, integer, integer, integer, text, integer, text) from public;
revoke all on function move_session(uuid, timestamptz, integer, integer) from public;
revoke all on function revive_hold(uuid, integer, integer, integer) from public;
revoke all on function delete_child_data(uuid, uuid) from public;
revoke all on function expire_stale_holds() from public;
