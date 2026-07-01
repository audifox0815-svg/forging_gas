create extension if not exists "pgcrypto";

create table if not exists public.production (
  id uuid primary key default gen_random_uuid(),
  ym text not null,
  line text not null check (line in ('P5', 'P8', 'P15', 'RM')),
  product text not null,
  material text not null,
  weight_ton numeric not null,
  work_hours numeric not null,
  plan_ton numeric not null,
  created_at timestamptz not null default now(),
  unique (ym, line, product, material)
);

create table if not exists public.gas_reading (
  id uuid primary key default gen_random_uuid(),
  ym text not null,
  furnace_no integer not null,
  line text not null check (line in ('P5', 'P8', 'P15', 'RM')),
  usage_m3 numeric not null,
  basis text not null check (basis in ('고지', '자체')),
  created_at timestamptz not null default now(),
  unique (ym, furnace_no, line, basis)
);

create table if not exists public.import_log (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('production', 'gas')),
  inserted integer not null,
  file_name text not null,
  imported_at timestamptz not null default now(),
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null
);

alter table public.production enable row level security;
alter table public.gas_reading enable row level security;
alter table public.import_log enable row level security;

drop policy if exists "Authenticated production read" on public.production;
drop policy if exists "Authenticated production write" on public.production;
drop policy if exists "Authenticated gas read" on public.gas_reading;
drop policy if exists "Authenticated gas write" on public.gas_reading;
drop policy if exists "Authenticated import log read" on public.import_log;
drop policy if exists "Authenticated import log write" on public.import_log;

create policy "Authenticated production read"
  on public.production
  for select
  to authenticated
  using (true);

create policy "Authenticated production write"
  on public.production
  for insert
  to authenticated
  with check (true);

create policy "Authenticated gas read"
  on public.gas_reading
  for select
  to authenticated
  using (true);

create policy "Authenticated gas write"
  on public.gas_reading
  for insert
  to authenticated
  with check (true);

create policy "Authenticated import log read"
  on public.import_log
  for select
  to authenticated
  using (true);

create policy "Authenticated import log write"
  on public.import_log
  for insert
  to authenticated
  with check (true);

create index if not exists production_ym_line_idx on public.production (ym, line);
create index if not exists gas_reading_ym_furnace_idx on public.gas_reading (ym, furnace_no);
create index if not exists import_log_imported_at_idx on public.import_log (imported_at desc);
