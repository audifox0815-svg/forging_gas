create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum ('admin', 'operator', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'viewer',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.sync_user_profile();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.sync_user_profile();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'viewer'::public.app_role
  );
$$;

create or replace function public.has_role(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = any(required_roles);
$$;

alter table public.production enable row level security;
alter table public.gas_reading enable row level security;
alter table public.profiles enable row level security;
alter table public.import_log enable row level security;

drop policy if exists "Profiles are readable by owners and admins" on public.profiles;
drop policy if exists "Profiles are writable by admins" on public.profiles;
drop policy if exists "Authenticated production read" on public.production;
drop policy if exists "Authenticated production write" on public.production;
drop policy if exists "Privileged production update" on public.production;
drop policy if exists "Authenticated gas read" on public.gas_reading;
drop policy if exists "Authenticated gas write" on public.gas_reading;
drop policy if exists "Privileged gas update" on public.gas_reading;
drop policy if exists "Authenticated import log read" on public.import_log;
drop policy if exists "Authenticated import log write" on public.import_log;
drop policy if exists "Privileged import log update" on public.import_log;

create policy "Profiles are readable by owners and admins"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.has_role(array['admin'::public.app_role]));

create policy "Profiles are writable by admins"
  on public.profiles
  for update
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

create policy "Authenticated production read"
  on public.production
  for select
  to authenticated
  using (true);

create policy "Privileged production write"
  on public.production
  for insert
  to authenticated
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create policy "Privileged production update"
  on public.production
  for update
  to authenticated
  using (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create policy "Authenticated gas read"
  on public.gas_reading
  for select
  to authenticated
  using (true);

create policy "Privileged gas write"
  on public.gas_reading
  for insert
  to authenticated
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create policy "Privileged gas update"
  on public.gas_reading
  for update
  to authenticated
  using (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create policy "Authenticated import log read"
  on public.import_log
  for select
  to authenticated
  using (true);

create policy "Privileged import log write"
  on public.import_log
  for insert
  to authenticated
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create policy "Privileged import log update"
  on public.import_log
  for update
  to authenticated
  using (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role, 'operator'::public.app_role]));

create index if not exists production_ym_line_idx on public.production (ym, line);
create index if not exists gas_reading_ym_furnace_idx on public.gas_reading (ym, furnace_no);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists import_log_imported_at_idx on public.import_log (imported_at desc);
