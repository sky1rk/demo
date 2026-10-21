-- Pal.se — Supabase auth companion schema.
-- Run ONCE in the Supabase SQL editor (Dashboard -> SQL -> New query).
-- Safe to re-run: object creation guards for idempotency are included.

-- ---------------------------------------------------------------------------
-- 1. profiles
--    Public mirror of auth.users holding the signup metadata (first/last
--    name). Rows are created automatically by the trigger in section 3.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null
    constraint profiles_first_name_length check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null
    constraint profiles_last_name_length check (char_length(btrim(last_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Signup metadata for auth.users. Inserted by handle_new_user(); mirrored names come from raw_user_meta_data at signup.';

-- Row Level Security: users may only see and edit their own row.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to anon, authenticated
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------
create extension if not exists moddatetime with schema extensions;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update
  on public.profiles
  for each row
  execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. Signup trigger
--    Copies profile info out of the signup call's `options.data` metadata
--    (first_name / last_name passed by supabase-js) when a new user row is
--    created. SECURITY DEFINER so the insert succeeds even though the user
--    has no session yet (email confirmation pending).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unknown'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Unknown')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert
  on auth.users
  for each row
  execute function public.handle_new_user();
