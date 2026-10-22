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
  'Neonatal patient registry. risk_level is set automatically by engine scoring (with manual fallback); outcome records the retroactive clinical confirmation.';

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
  laboratory jsonb not null default '{}'::jsonb,
  treatment jsonb not null default '{}'::jsonb,
  comorbidities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assessments is
  'Wizard intake data per patient. Scored by the EOS inference service (service/); results land in the prediction column.';

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

-- ---------------------------------------------------------------------------
-- 6. Engine scoring (schema v3)
--    The EOS inference service returns the legacy build_prediction contract;
--    the frontend persists the full box on the assessment (prediction) plus
--    denormalized columns for querying. patients.outcome records the
--    retroactive clinical confirmation that makes accuracy stats computable.
--    All statements are idempotent — safe to re-run after upgrading.
-- ---------------------------------------------------------------------------
alter table public.assessments
  add column if not exists prediction jsonb,
  add column if not exists predicted_at timestamptz;

create index if not exists assessments_predicted_at_idx on public.assessments (predicted_at);

-- The Laboratory wizard step (M2) sends a seventh section column.
alter table public.assessments
  add column if not exists laboratory jsonb not null default '{}'::jsonb;

comment on column public.assessments.laboratory is
  'LabSection JSONB: crp_mg_l / wbc_count / platelet_count (optional; empty = not ordered).';

comment on column public.assessments.prediction is
  'StoredPrediction JSONB: probability, risk_label, decision_threshold, predicted_eos, xgb/tft branch probabilities, tft_source, inference_ms, interpretation, recommended_actions.';
comment on column public.assessments.predicted_at is
  'When the inference service scored this assessment (null = unscored/draft).';

-- patients.outcome: engine-scoring is a prediction, not a diagnosis. The
-- clinician records what actually happened so Reports can compute accuracy.
alter table public.patients
  add column if not exists outcome text
    default 'pending'
    constraint patients_outcome_values check (outcome in ('pending', 'confirmed_eos', 'ruled_out'));

comment on column public.patients.outcome is
  'Retroactive clinical confirmation (pending until recorded). Accuracy on /reports agrees confirmed_eos with predicted_eos.';

create index if not exists patients_outcome_idx on public.patients (outcome);

-- ---------------------------------------------------------------------------
-- 7. Privileges (schema v4)
--    RLS decides WHICH rows each query sees; these grants decide whether the
--    API roles may touch the schema at all. Some projects lose the default
--    grants Supabase normally attaches to the SQL-editor role — queries then
--    fail with 42501 "permission denied for table <t>". This block restores
--    them and pins future tables the same way. Idempotent.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all privileges on all tables    in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ownership defaults (schema v5)
--    The frontend never sends created_by — the server supplies it from the
--    JWT. This is spoof-proof (client can't claim another user's rows) and
--    satisfies the same-value RLS checks on insert. Idempotent re-runs are
--    no-ops (set default is not conditional but converges to the same state).
-- ---------------------------------------------------------------------------
alter table public.patients
  alter column created_by set default auth.uid();

alter table public.assessments
  alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 9. Clinical data: vital_observations (schema v6)
--    Time series behind /monitor's live charts: one row per recorded set of
--    readings. Earlier/later ordering is `recorded_at`, which the clinician
--    may backdate — the wizard's vitals remain point-in-time snapshots on
--    the assessment row, while this table accumulates every reading.
--    An observation must carry at least one vital value.
--    Idempotent re-run safe.
-- ---------------------------------------------------------------------------
create table if not exists public.vital_observations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete set null,
  recorded_at timestamptz not null default now(),
  heart_rate_bpm numeric
    constraint vital_observations_hr_range check (heart_rate_bpm between 0 and 400),
  temperature_c numeric
    constraint vital_observations_temp_range check (temperature_c between 25 and 45),
  sbp_mmhg numeric
    constraint vital_observations_sbp_range check (sbp_mmhg between 0 and 300),
  dbp_mmhg numeric
    constraint vital_observations_dbp_range check (dbp_mmhg between 0 and 200),
  oxygen_saturation_pct numeric
    constraint vital_observations_o2_range check (oxygen_saturation_pct between 0 and 100),
  respiratory_rate_per_min numeric
    constraint vital_observations_rr_range check (respiratory_rate_per_min between 0 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vital_observations_has_values check (
    heart_rate_bpm is not null
    or temperature_c is not null
    or sbp_mmhg is not null
    or dbp_mmhg is not null
    or oxygen_saturation_pct is not null
    or respiratory_rate_per_min is not null
  )
);

comment on table public.vital_observations is
  'Vital-sign readings over time (earlier/later records). Charts on /monitor read this time series; SBP/DBP are separate columns.';

create index if not exists vital_observations_patient_recorded_idx
  on public.vital_observations (patient_id, recorded_at desc);

alter table public.vital_observations enable row level security;

drop policy if exists vital_observations_team_select on public.vital_observations;
create policy vital_observations_team_select
  on public.vital_observations
  for select
  to authenticated
  using (true);

drop policy if exists vital_observations_insert_own on public.vital_observations;
create policy vital_observations_insert_own
  on public.vital_observations
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists vital_observations_update_own on public.vital_observations;
create policy vital_observations_update_own
  on public.vital_observations
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists vital_observations_delete_own on public.vital_observations;
create policy vital_observations_delete_own
  on public.vital_observations
  for delete
  to authenticated
  using (created_by = auth.uid());

drop trigger if exists vital_observations_touch_updated_at on public.vital_observations;
create trigger vital_observations_touch_updated_at
  before update
  on public.vital_observations
  for each row
  execute function extensions.moddatetime(updated_at);

alter table public.vital_observations
  alter column created_by set default auth.uid();

-- Realtime: charts subscribe to postgres_changes on this table. REPLICA
-- IDENTITY FULL makes DELETE events carry the old row (so listeners can
-- remove it by id); the publication addition is skipped when the table is
-- already a member (adding twice raises a duplicate-object error).
alter table public.vital_observations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vital_observations'
  ) then
    alter publication supabase_realtime add table public.vital_observations;
  end if;
end $$;
