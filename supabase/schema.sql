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
-- (staff/hn/memo default to '' so existing rows are valid; the app enforces
-- staff and hn as required at write time.)
alter table public.cases add column if not exists image_paths text[] not null default '{}';
alter table public.cases add column if not exists staff text not null default '';
alter table public.cases add column if not exists hn text not null default '';
alter table public.cases add column if not exists memo text not null default '';

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
create or replace function public.my_staff_profile()
returns table (full_name text, institution text)
language sql
security definer
set search_path = public
as $$
  select s.full_name, s.institution
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
    c.id, c.date, c.timing, c.place, p.full_name as fellow_name, c.staff,
    case
      when length(c.hn) <= 4 then coalesce(nullif(c.hn, ''), '—')
      else '•••' || right(c.hn, 4)
    end as hn,
    c.diagnosis, c.ao_code, c.ao_region_label, c.other_classification,
    c.approach, c."position", c.procedure, c.procedure_type, c.role,
    c.op_time, c.memo, c.image_paths, c.created_at
  from public.cases c
  join public.fellow f on f.user_id = c.user_id
  where f.institution = (
    select s.institution
    from public.staff_devices sd
    join public.staff s on s.id = sd.staff_id
    where sd.user_id = auth.uid()
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
    where c.image_paths @> array[p_image_id]
      and f.institution = (
        select s.institution
        from public.staff_devices sd
        join public.staff s on s.id = sd.staff_id
        where sd.user_id = auth.uid()
      )
  );
$$;

revoke all on function public.staff_can_view_image(text) from public;
grant execute on function public.staff_can_view_image(text) to authenticated;
