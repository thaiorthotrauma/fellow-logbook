-- Fellowship Case Logbook schema
-- Run in the Supabase SQL editor (Project > SQL Editor > New query).
-- Safe to re-run: tables/functions/indexes are idempotent and policies are
-- dropped and recreated on each run.

-- ── Whitelist / fellow identity ─────────────────────────────────────────────
-- Renames the table in place (preserving all existing rows) the first time
-- this runs against a database from before the rename; a no-op on every
-- run after that, since `physicians` no longer exists.
alter table if exists public.physicians rename to fellow;

create table if not exists public.fellow (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  user_id uuid unique references auth.users (id) on delete set null,
  line_user_id text unique,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Added after the initial table creation — explicit ALTER so re-running this
-- script against a table created before this column existed still works.
alter table public.fellow add column if not exists institution text;

-- Case-insensitive uniqueness on email: all lookups compare with lower(), and
-- the roster has mixed-case addresses, so guard against two rows that differ
-- only by case.
alter index if exists physicians_email_lower_idx rename to fellow_email_lower_idx;
create unique index if not exists fellow_email_lower_idx
  on public.fellow (lower(email));

alter table public.fellow enable row level security;

-- A fellow may read only their own row, once linked (user_id = auth.uid()).
-- Dropped by both the old and new policy name — the old-named one only
-- exists on a database that hasn't run this rename before; harmless
-- no-op after that.
drop policy if exists "physicians can read own row" on public.fellow;
drop policy if exists "fellow can read own row" on public.fellow;
create policy "fellow can read own row"
  on public.fellow for select
  using (auth.uid() is not null and user_id = auth.uid());

-- No direct insert/update/delete from clients. All writes to fellow
-- happen through the SECURITY DEFINER functions below or the service role
-- (used by the Edge Functions), so RLS intentionally grants no write policy.

-- Checks whether an email is on the whitelist, without exposing the list.
-- Callable by anyone with the anon key (needed before the user has a session).
create or replace function public.is_email_allowed(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fellow
    where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.is_email_allowed(text) from public;
grant execute on function public.is_email_allowed(text) to anon, authenticated;

-- Links the currently authenticated user (post email-OTP verification) to
-- their whitelist row by email. Does NOT touch line_user_id — that linkage
-- is only ever set server-side by the link-line-user Edge Function after it
-- has independently verified the LIFF ID token with LINE.
--
-- Renamed from claim_physician_row() — the old name is dropped explicitly
-- since `create or replace` can't rename a function, only replace its body.
drop function if exists public.claim_physician_row();
create or replace function public.claim_fellow_row()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := (select email from auth.users where id = auth.uid());
begin
  if v_email is null then
    raise exception 'no authenticated user';
  end if;

  update public.fellow
  set user_id = auth.uid()
  where lower(email) = lower(v_email)
    and (user_id is null or user_id = auth.uid());
end;
$$;

revoke all on function public.claim_fellow_row() from public;
grant execute on function public.claim_fellow_row() to authenticated;

-- Seed the initial admin row. Run supabase/seed_fellow.sql afterward (or
-- any time the roster changes) to load/update the full fellow whitelist.
insert into public.fellow (full_name, email, institution)
values ('ปองสิทธิ์ โพธิคุณ', 'pong.poti@gmail.com', 'สมุทรสาคร')
on conflict (email) do nothing;

-- ── Case log ────────────────────────────────────────────────────────────────
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  timing text not null,
  place text not null,
  staff text not null default '',
  hn text not null default '',
  diagnosis text not null,
  ao_code text not null default '',
  ao_region_label text not null default '',
  other_classification text not null,
  approach text not null,
  "position" text not null,
  procedure text not null,
  procedure_type text not null,
  role text not null,
  op_time text not null,
  memo text not null default '',
  -- Google Drive file IDs for the case's images (uploaded via the drive-images
  -- edge function). Kept as image_paths for backward compatibility; the images
  -- themselves live in the app's private Drive, not in Supabase.
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Added after the initial table creation — explicit ALTER so re-running this
-- script against a table created before these columns existed still works.
-- (staff/hn/memo/position default to '' so existing rows are valid; the app
-- enforces staff and hn as required at write time.)
alter table public.cases add column if not exists image_paths text[] not null default '{}';
alter table public.cases add column if not exists staff text not null default '';
alter table public.cases add column if not exists hn text not null default '';
alter table public.cases add column if not exists memo text not null default '';
alter table public.cases add column if not exists "position" text not null default '';

-- Constrain the enumerated columns to the exact value sets the app uses (these
-- mirror the option arrays in src/data.ts). Dropped-then-added so the script
-- stays re-runnable. A bad or renamed value is rejected at write time rather
-- than silently stored and surfacing later as a broken report.
alter table public.cases drop constraint if exists cases_timing_check;
alter table public.cases add constraint cases_timing_check
  check (timing in ('in', 'out'));

alter table public.cases drop constraint if exists cases_procedure_type_check;
alter table public.cases add constraint cases_procedure_type_check
  check (procedure_type in ('primary', 'revision', 'staged'));

alter table public.cases drop constraint if exists cases_role_check;
alter table public.cases add constraint cases_role_check
  check (role in ('primary_surgeon', 'primary_assistant', 'secondary_assistant', 'observer', 'uncertain'));

alter table public.cases drop constraint if exists cases_op_time_check;
alter table public.cases add constraint cases_op_time_check
  check (op_time in ('<1', '1-2', '2-3', '3-4', '>4'));

alter table public.cases drop constraint if exists cases_place_check;
alter table public.cases add constraint cases_place_check
  check (place in ('own', 'outside'));

alter table public.cases enable row level security;

drop policy if exists "physicians manage their own cases" on public.cases;
drop policy if exists "fellow manage their own cases" on public.cases;
-- Requires auth.uid() to own a fellow row, not just match user_id — closes
-- the gap where a leftover anonymous session (e.g. from the staff-link probe
-- in AuthGate) could otherwise write cases under an identity-less user_id.
create policy "fellow manage their own cases"
  on public.cases for all
  using (
    auth.uid() = user_id
    and exists (select 1 from public.fellow f where f.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.fellow f where f.user_id = auth.uid())
  );

create index if not exists cases_user_id_idx on public.cases (user_id);

-- ── Staff (institution-scoped, read-only reviewers) ────────────────────────
-- Staff never log cases and never go through email/OTP — trusted by LINE ID
-- alone, seeded directly (see seed_staff.sql). No email column at all.
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  institution text not null,
  line_user_id text not null unique,
  created_at timestamptz not null default now()
);

-- Admin staff bypass the institution filter in staff_institution_cases() /
-- staff_can_view_image() below and see every institution's fellows. `institution`
-- stays populated (their own "home" institution, shown in the header) even for
-- admins — it just no longer limits what they can read.
alter table public.staff add column if not exists is_admin boolean not null default false;

-- One row per device a staff member has signed in from — not one row per
-- staff member. Staff authenticate via anonymous sign-in (no email to anchor
-- an identity across devices the way a fellow's email does), so phone and
-- tablet each get an unrelated auth.uid(). A single user_id column would let
-- only one device hold the link at a time, silently kicking out the other on
-- every sign-in; this table lets any number of devices stay linked at once.
create table if not exists public.staff_devices (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;
alter table public.staff_devices enable row level security;
-- No policies granted on either table — every access goes through the
-- service role (Edge Functions) or the security-definer functions below,
-- never a direct client select. In particular, this means a raw
-- `supabase.from('staff_devices')` call from the browser returns nothing,
-- by design: there's no dedicated policy to accidentally get wrong.

-- Returns the calling staff member's own name/institution, or no rows if the
-- caller isn't a linked staff device. Lets the client show "who am I" without
-- ever granting a raw select on the staff tables.
--
-- Dropped first — `create or replace` can't change a function's OUT-parameter
-- row type (added is_admin here), only its body.
drop function if exists public.my_staff_profile();
create or replace function public.my_staff_profile()
returns table (full_name text, institution text, is_admin boolean)
language sql
security definer
set search_path = public
as $$
  select s.full_name, s.institution, s.is_admin
  from public.staff_devices sd
  join public.staff s on s.id = sd.staff_id
  where sd.user_id = auth.uid();
$$;

revoke all on function public.my_staff_profile() from public;
grant execute on function public.my_staff_profile() to authenticated;

-- The only way staff case data is ever read. HN masking is enforced HERE,
-- not in application code, so no future screen can forget to apply it and
-- leak a full HN — the raw value never leaves the database for a staff
-- caller. A fellow calling this (it's grantable to any authenticated user)
-- simply isn't in staff_devices, so it returns zero rows — no error, no leak.
create or replace function public.staff_institution_cases()
returns table (
  id uuid,
  date date,
  timing text,
  place text,
  fellow_name text,
  staff text,
  hn text,
  diagnosis text,
  ao_code text,
  ao_region_label text,
  other_classification text,
  approach text,
  "position" text,
  procedure text,
  procedure_type text,
  role text,
  op_time text,
  memo text,
  image_paths text[],
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id, c.date, c.timing, c.place, f.full_name as fellow_name, c.staff,
    case
      when length(c.hn) <= 4 then coalesce(nullif(c.hn, ''), '—')
      else '•••' || right(c.hn, 4)
    end as hn,
    c.diagnosis, c.ao_code, c.ao_region_label, c.other_classification,
    c.approach, c."position", c.procedure, c.procedure_type, c.role,
    c.op_time, c.memo, c.image_paths, c.created_at
  from public.cases c
  join public.fellow f on f.user_id = c.user_id
  where exists (
    select 1
    from public.staff_devices sd
    join public.staff s on s.id = sd.staff_id
    where sd.user_id = auth.uid()
      and (s.is_admin or f.institution = s.institution)
  )
  order by c.date desc;
$$;

revoke all on function public.staff_institution_cases() from public;
grant execute on function public.staff_institution_cases() to authenticated;

-- Authorizes a staff member to view one case image: true if that image
-- belongs to a case whose owning fellow is in the caller's institution.
-- Returns a boolean only (never row data), so drive-images can use it as a
-- second ownership check without granting staff any direct table access.
create or replace function public.staff_can_view_image(p_image_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    join public.fellow f on f.user_id = c.user_id
    join public.staff_devices sd on sd.user_id = auth.uid()
    join public.staff s on s.id = sd.staff_id
    where c.image_paths @> array[p_image_id]
      and (s.is_admin or f.institution = s.institution)
  );
$$;

revoke all on function public.staff_can_view_image(text) from public;
grant execute on function public.staff_can_view_image(text) to authenticated;

-- ── Error notification flood control ────────────────────────────────────────
-- Backs the Telegram error alerts (see TELEGRAM_ERRORS.md). A Drive rate limit
-- or an expired token fails on every request; without a ceiling one bad
-- afternoon buries the chat, including the case notifications the chat exists
-- for. Counting lives here rather than in the Edge Functions because isolates
-- are recycled — in-memory counters would reset mid-storm and defeat the mute
-- exactly when it matters — and because several isolates report concurrently,
-- which only a single atomic statement can count correctly.

create table if not exists public.error_events (
  fingerprint text primary key,
  headline text not null,
  origin text not null default '',
  message text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  window_started_at timestamptz not null default now(),
  occurrences int not null default 0,
  sent int not null default 0,
  muted_until timestamptz,
  people text[] not null default '{}'
);

create index if not exists error_events_muted_idx
  on public.error_events (muted_until)
  where muted_until is not null;

-- One row, holding the hourly ceiling across every fingerprint.
create table if not exists public.error_budget (
  id boolean primary key default true check (id),
  window_started_at timestamptz not null default now(),
  sent int not null default 0
);

insert into public.error_budget (id) values (true) on conflict (id) do nothing;

alter table public.error_events enable row level security;
alter table public.error_budget enable row level security;

-- No policies at all: both tables are written only by the Edge Functions
-- through the service role, which bypasses RLS. Nothing client-side may read
-- or touch them — a caller able to inflate a counter could mute the alerts
-- about its own behaviour.

-- Decides whether one occurrence of a fingerprint should be sent, and returns
-- any rollups that fell due, in a single round trip.
--
-- Rules (all of them here, so there is one place to read them):
--   * The first p_full_sends occurrences of a fingerprint send in full
--     (3 normally) — enough to see whether it is one fellow or everyone.
--   * The last of those mutes it for an hour and says so, so the silence that
--     follows is never ambiguous.
--   * When the mute expires with unreported occurrences, the next report of
--     ANY error flushes a rollup for it. There is no cron in this schema, so
--     a rollup rides along with the next thing that happens; if the whole app
--     goes quiet, nothing is pending to report anyway.
--   * A window that passes with no occurrences resets, so a bug that returns
--     tomorrow is announced again rather than staying silently muted.
--   * 40 alerts an hour across every fingerprint, after which only rollups
--     get through. Reaching the ceiling is itself announced, once.
create or replace function public.error_gate(
  p_fingerprint text,
  p_headline text,
  p_origin text,
  p_message text,
  p_person text default null,
  p_full_sends int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window constant interval := interval '1 hour';
  -- Reports arriving without a session (an error thrown before login) are
  -- capped at one full send instead of three: they are the only unauthenticated
  -- path into the chat, so their ceiling is the tightest one here.
  v_full_sends constant int := greatest(1, coalesce(p_full_sends, 3));
  v_budget constant int := 40;
  v_row public.error_events;
  v_pending public.error_events;
  v_rollups jsonb := '[]'::jsonb;
  v_budget_row public.error_budget;
  v_budget_reset boolean := false;
  v_decision text;
  v_reset boolean;
begin
  -- 1. Flush rollups whose mute has expired with occurrences never reported.
  --    Capped at 3 per call so one report can't turn into a burst of its own.
  for v_pending in
    select * from public.error_events
    where muted_until is not null
      and muted_until <= v_now
      and occurrences > sent
    order by last_seen desc
    limit 3
    for update skip locked
  loop
    v_rollups := v_rollups || jsonb_build_object(
      'fingerprint', v_pending.fingerprint,
      'headline', v_pending.headline,
      'origin', v_pending.origin,
      'message', v_pending.message,
      'suppressed', v_pending.occurrences - v_pending.sent,
      'since', v_pending.window_started_at,
      'last_seen', v_pending.last_seen,
      'people_affected', coalesce(array_length(v_pending.people, 1), 0),
      -- Still arriving in the last five minutes means the storm is ongoing,
      -- so the rollup re-mutes instead of reopening the floodgates.
      'still_muted', v_pending.last_seen > v_now - interval '5 minutes'
    );

    update public.error_events
    set window_started_at = v_now,
        first_seen = v_now,
        occurrences = 0,
        sent = 0,
        people = '{}',
        muted_until = case
          when v_pending.last_seen > v_now - interval '5 minutes' then v_now + v_window
          else null
        end
    where fingerprint = v_pending.fingerprint;
  end loop;

  -- 2. Record this occurrence. A window that elapsed without muting starts
  --    over, so the same bug next week is announced rather than swallowed.
  insert into public.error_events as e (
    fingerprint, headline, origin, message,
    first_seen, last_seen, window_started_at, occurrences, sent, people
  )
  values (
    p_fingerprint, p_headline, p_origin, p_message,
    v_now, v_now, v_now, 1, 0,
    case when p_person is null then '{}'::text[] else array[p_person] end
  )
  on conflict (fingerprint) do update
  set
    headline = excluded.headline,
    origin = excluded.origin,
    message = excluded.message,
    last_seen = v_now,
    window_started_at = case
      when e.muted_until is null and e.window_started_at < v_now - v_window
      then v_now else e.window_started_at end,
    occurrences = case
      when e.muted_until is null and e.window_started_at < v_now - v_window
      then 1 else e.occurrences + 1 end,
    sent = case
      when e.muted_until is null and e.window_started_at < v_now - v_window
      then 0 else e.sent end,
    people = case
      when e.muted_until is null and e.window_started_at < v_now - v_window
      then (case when p_person is null then '{}'::text[] else array[p_person] end)
      when p_person is null or p_person = any (e.people) then e.people
      else e.people || p_person end
  returning * into v_row;

  -- 3. Decide.
  if v_row.muted_until is not null and v_row.muted_until > v_now then
    v_decision := 'muted';
  elsif v_row.sent >= v_full_sends then
    v_decision := 'muted';
  else
    -- Hourly ceiling, rolled lazily on read for the same reason as above:
    -- no cron, and a stale window must not permanently silence the chat.
    select * into v_budget_row from public.error_budget where id limit 1 for update;
    if v_budget_row is null then
      insert into public.error_budget (id) values (true)
      on conflict (id) do nothing;
      select * into v_budget_row from public.error_budget where id limit 1 for update;
    end if;

    v_reset := v_budget_row.window_started_at < v_now - v_window;
    if v_reset then
      update public.error_budget
      set window_started_at = v_now, sent = 0
      where id
      returning * into v_budget_row;
    end if;

    if v_budget_row.sent >= v_budget then
      v_decision := 'budget';
    else
      v_decision := 'send';
      update public.error_budget set sent = sent + 1 where id
      returning * into v_budget_row;
      -- Announce the ceiling on the send that reaches it, not after.
      v_budget_reset := v_budget_row.sent = v_budget;

      update public.error_events
      set sent = sent + 1,
          muted_until = case
            when sent + 1 >= v_full_sends then v_now + v_window
            else muted_until end
      where fingerprint = p_fingerprint
      returning * into v_row;
    end if;
  end if;

  return jsonb_build_object(
    'decision', v_decision,
    'occurrences', v_row.occurrences,
    'sent', v_row.sent,
    'window_started_at', v_row.window_started_at,
    'muted_until', v_row.muted_until,
    'budget_reached', v_budget_reset,
    'budget_resumes_at', coalesce(v_budget_row.window_started_at, v_now) + v_window,
    'rollups', v_rollups
  );
end;
$$;

-- Only the service role may call this: a caller that could inflate a counter
-- could mute the alerts about its own behaviour. Every reporter runs inside an
-- Edge Function, so nothing client-side ever needs it.
revoke all on function public.error_gate(text, text, text, text, text, int) from public;
