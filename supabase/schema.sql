-- Fellowship Case Logbook schema
-- Run in the Supabase SQL editor (Project > SQL Editor > New query).
-- Safe to re-run: tables/functions/indexes are idempotent and policies are
-- dropped and recreated on each run.

-- ── Whitelist / physician identity ──────────────────────────────────────────
create table if not exists public.physicians (
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
alter table public.physicians add column if not exists institution text;

alter table public.physicians enable row level security;

-- A physician may read only their own row, once linked (user_id = auth.uid()).
drop policy if exists "physicians can read own row" on public.physicians;
create policy "physicians can read own row"
  on public.physicians for select
  using (auth.uid() is not null and user_id = auth.uid());

-- No direct insert/update/delete from clients. All writes to physicians
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
    select 1 from public.physicians
    where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.is_email_allowed(text) from public;
grant execute on function public.is_email_allowed(text) to anon, authenticated;

-- Links the currently authenticated user (post email-OTP verification) to
-- their whitelist row by email. Does NOT touch line_user_id — that linkage
-- is only ever set server-side by the link-line-user Edge Function after it
-- has independently verified the LIFF ID token with LINE.
create or replace function public.claim_physician_row()
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

  update public.physicians
  set user_id = auth.uid()
  where lower(email) = lower(v_email)
    and (user_id is null or user_id = auth.uid());
end;
$$;

revoke all on function public.claim_physician_row() from public;
grant execute on function public.claim_physician_row() to authenticated;

-- Seed the initial admin row. Run supabase/seed_physicians.sql afterward (or
-- any time the roster changes) to load/update the full fellow whitelist.
insert into public.physicians (full_name, email, institution)
values ('ปองสิทธิ์ โพธิคุณ', 'pong.poti@gmail.com', 'สมุทรสาคร')
on conflict (email) do nothing;

-- ── Case log ────────────────────────────────────────────────────────────────
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  timing text not null,
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
  place text not null,
  created_at timestamptz not null default now()
);

alter table public.cases enable row level security;

drop policy if exists "physicians manage their own cases" on public.cases;
create policy "physicians manage their own cases"
  on public.cases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists cases_user_id_idx on public.cases (user_id);
