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
  department text,
  role text,
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

-- ---------------------------------------------------------------------------
-- 4. Clinical data: patients
--    Team model: every authenticated user can read the registry; writes are
--    scoped to the creator. Multi-clinic isolation (org_id) comes later.
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  mrn text unique,
  first_name text not null
    constraint patients_first_name_length check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null
    constraint patients_last_name_length check (char_length(btrim(last_name)) between 1 and 100),
  sex text
    constraint patients_sex_values check (sex in ('female', 'male')),
  date_of_birth date,
  gestational_age_weeks numeric
    constraint patients_ga_range check (gestational_age_weeks between 20 and 45),
  birth_weight_grams numeric
    constraint patients_bw_range check (birth_weight_grams between 200 and 8000),
  delivery_mode text
    constraint patients_delivery_mode_values check (delivery_mode in ('vaginal', 'cesarean')),
  -- Manual until the ML prediction engine is connected; the registry page
  -- manages it from Phase 2 onward.
  risk_level text not null default 'pending'
    constraint patients_risk_level_values check (risk_level in ('pending', 'low', 'moderate', 'high')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patients is
  'Neonatal patient registry. risk_level is manual until the prediction engine is connected.';

create index if not exists patients_created_by_idx on public.patients (created_by);
create index if not exists patients_risk_level_idx on public.patients (risk_level);

alter table public.patients enable row level security;

drop policy if exists patients_team_select on public.patients;
create policy patients_team_select
  on public.patients
  for select
  to authenticated
  using (true);

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own
  on public.patients
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own
  on public.patients
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists patients_delete_own on public.patients;
create policy patients_delete_own
  on public.patients
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
  before update
  on public.patients
  for each row
  execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 5. Clinical data: assessments
--    One row per completed (or draft) wizard run. Sections are stored as
--    JSONB blobs so the schema can evolve before the prediction engine is
--    connected.
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  status text not null default 'draft'
    constraint assessments_status_values check (status in ('draft', 'complete')),
  demographic jsonb not null default '{}'::jsonb,
  maternal jsonb not null default '{}'::jsonb,
  neonatal jsonb not null default '{}'::jsonb,
  vitals jsonb not null default '{}'::jsonb,
  treatment jsonb not null default '{}'::jsonb,
  comorbidities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assessments is
  'Wizard intake data per patient. Risk scoring happens in the (future) prediction engine, not here.';

create index if not exists assessments_patient_id_idx on public.assessments (patient_id);
create index if not exists assessments_created_by_idx on public.assessments (created_by);

alter table public.assessments enable row level security;

drop policy if exists assessments_team_select on public.assessments;
create policy assessments_team_select
  on public.assessments
  for select
  to authenticated
  using (true);

drop policy if exists assessments_insert_own on public.assessments;
create policy assessments_insert_own
  on public.assessments
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists assessments_update_own on public.assessments;
create policy assessments_update_own
  on public.assessments
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists assessments_delete_own on public.assessments;
create policy assessments_delete_own
  on public.assessments
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists assessments_touch_updated_at on public.assessments;
create trigger assessments_touch_updated_at
  before update
  on public.assessments
  for each row
  execute function extensions.moddatetime(updated_at);
