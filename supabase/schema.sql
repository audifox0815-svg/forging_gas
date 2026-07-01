create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum ('admin', 'manager', 'operator', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.lines (
  code text primary key check (code in ('P5', 'P8', 'P15', 'RM', 'R/M')),
  name text not null,
  press_class text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.furnaces (
  furnace_no integer primary key check (furnace_no > 0),
  line_code text not null references public.lines (code) on update cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_semi boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'viewer',
  line_code text references public.lines (code) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  line_code text not null references public.lines (code) on update cascade,
  daily_target_ton numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, line_code)
);

create table if not exists public.plan_days (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  line_code text not null references public.lines (code) on update cascade,
  month integer not null check (month between 1 and 12),
  days integer not null check (days between 0 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, line_code, month)
);

create table if not exists public.production (
  id uuid primary key default gen_random_uuid(),
  work_date date,
  ym text not null,
  line text not null check (line in ('P5', 'P8', 'P15', 'RM', 'R/M')),
  product text not null,
  material text not null,
  raw_material text,
  shift text not null default 'day' check (shift in ('day', 'night', 'mixed', 'all-day')),
  is_semi boolean not null default false,
  weight_ton numeric not null,
  work_hours numeric not null,
  work_count integer not null default 1,
  plan_ton numeric not null,
  source text not null default 'import',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ym, line, product, material)
);

create table if not exists public.gas_reading (
  id uuid primary key default gen_random_uuid(),
  ym text not null,
  furnace_no integer not null references public.furnaces (furnace_no) on update cascade,
  line text not null check (line in ('P5', 'P8', 'P15', 'RM', 'R/M')),
  usage_m3 numeric not null,
  basis text not null check (basis in ('billing', 'self', '고지', '자체')),
  source text not null default 'import',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ym, furnace_no, line, basis)
);

create table if not exists public.import_log (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('production', 'gas')),
  file_name text not null,
  file_type text,
  inserted integer not null default 0,
  rows_ok integer not null default 0,
  rows_skipped integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  imported_at timestamptz not null default now()
);

create table if not exists public.edit_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  before jsonb,
  after jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_lines_updated on public.lines;
create trigger on_lines_updated
  before update on public.lines
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_furnaces_updated on public.furnaces;
create trigger on_furnaces_updated
  before update on public.furnaces
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_product_types_updated on public.product_types;
create trigger on_product_types_updated
  before update on public.product_types
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_materials_updated on public.materials;
create trigger on_materials_updated
  before update on public.materials
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_raw_materials_updated on public.raw_materials;
create trigger on_raw_materials_updated
  before update on public.raw_materials
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_targets_updated on public.targets;
create trigger on_targets_updated
  before update on public.targets
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_plan_days_updated on public.plan_days;
create trigger on_plan_days_updated
  before update on public.plan_days
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_production_updated on public.production;
create trigger on_production_updated
  before update on public.production
  for each row execute procedure public.touch_updated_at();

drop trigger if exists on_gas_reading_updated on public.gas_reading;
create trigger on_gas_reading_updated
  before update on public.gas_reading
  for each row execute procedure public.touch_updated_at();

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

create or replace function public.current_user_line_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select (select line_code from public.profiles where id = auth.uid());
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

create or replace function public.has_line_scope(target_line text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(array['admin'::public.app_role]) or
    (
      public.current_user_line_code() is not null
      and public.current_user_line_code() = target_line
    );
$$;

alter table public.lines enable row level security;
alter table public.furnaces enable row level security;
alter table public.product_types enable row level security;
alter table public.materials enable row level security;
alter table public.raw_materials enable row level security;
alter table public.profiles enable row level security;
alter table public.targets enable row level security;
alter table public.plan_days enable row level security;
alter table public.production enable row level security;
alter table public.gas_reading enable row level security;
alter table public.import_log enable row level security;
alter table public.edit_history enable row level security;

drop policy if exists "Lines are readable by authenticated users" on public.lines;
drop policy if exists "Lines are writable by admins" on public.lines;
drop policy if exists "Furnaces are readable by authenticated users" on public.furnaces;
drop policy if exists "Furnaces are writable by admins" on public.furnaces;
drop policy if exists "Product types are readable by authenticated users" on public.product_types;
drop policy if exists "Product types are writable by admins" on public.product_types;
drop policy if exists "Materials are readable by authenticated users" on public.materials;
drop policy if exists "Materials are writable by admins" on public.materials;
drop policy if exists "Raw materials are readable by authenticated users" on public.raw_materials;
drop policy if exists "Raw materials are writable by admins" on public.raw_materials;
drop policy if exists "Profiles are readable by owners and admins" on public.profiles;
drop policy if exists "Profiles are writable by admins" on public.profiles;
drop policy if exists "Targets are readable by authenticated users" on public.targets;
drop policy if exists "Targets are writable by managers and admins" on public.targets;
drop policy if exists "Plan days are readable by authenticated users" on public.plan_days;
drop policy if exists "Plan days are writable by managers and admins" on public.plan_days;
drop policy if exists "Authenticated production read" on public.production;
drop policy if exists "Privileged production write" on public.production;
drop policy if exists "Privileged production update" on public.production;
drop policy if exists "Authenticated gas read" on public.gas_reading;
drop policy if exists "Privileged gas write" on public.gas_reading;
drop policy if exists "Privileged gas update" on public.gas_reading;
drop policy if exists "Authenticated import log read" on public.import_log;
drop policy if exists "Privileged import log write" on public.import_log;
drop policy if exists "Privileged import log update" on public.import_log;
drop policy if exists "Authenticated edit history read" on public.edit_history;
drop policy if exists "Privileged edit history write" on public.edit_history;

create policy "Lines are readable by authenticated users"
  on public.lines
  for select
  to authenticated
  using (true);

create policy "Lines are writable by admins"
  on public.lines
  for all
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

create policy "Furnaces are readable by authenticated users"
  on public.furnaces
  for select
  to authenticated
  using (true);

create policy "Furnaces are writable by admins"
  on public.furnaces
  for all
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

create policy "Product types are readable by authenticated users"
  on public.product_types
  for select
  to authenticated
  using (true);

create policy "Product types are writable by admins"
  on public.product_types
  for all
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

create policy "Materials are readable by authenticated users"
  on public.materials
  for select
  to authenticated
  using (true);

create policy "Materials are writable by admins"
  on public.materials
  for all
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

create policy "Raw materials are readable by authenticated users"
  on public.raw_materials
  for select
  to authenticated
  using (true);

create policy "Raw materials are writable by admins"
  on public.raw_materials
  for all
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

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

create policy "Targets are readable by authenticated users"
  on public.targets
  for select
  to authenticated
  using (true);

create policy "Targets are writable by managers and admins"
  on public.targets
  for all
  to authenticated
  using (
    public.has_role(array['admin'::public.app_role]) or
    (public.has_role(array['manager'::public.app_role]) and public.has_line_scope(line_code))
  )
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (public.has_role(array['manager'::public.app_role]) and public.has_line_scope(line_code))
  );

create policy "Plan days are readable by authenticated users"
  on public.plan_days
  for select
  to authenticated
  using (true);

create policy "Plan days are writable by managers and admins"
  on public.plan_days
  for all
  to authenticated
  using (
    public.has_role(array['admin'::public.app_role]) or
    (public.has_role(array['manager'::public.app_role]) and public.has_line_scope(line_code))
  )
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (public.has_role(array['manager'::public.app_role]) and public.has_line_scope(line_code))
  );

create policy "Authenticated production read"
  on public.production
  for select
  to authenticated
  using (true);

create policy "Privileged production write"
  on public.production
  for insert
  to authenticated
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  );

create policy "Privileged production update"
  on public.production
  for update
  to authenticated
  using (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  )
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  );

create policy "Authenticated gas read"
  on public.gas_reading
  for select
  to authenticated
  using (true);

create policy "Privileged gas write"
  on public.gas_reading
  for insert
  to authenticated
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  );

create policy "Privileged gas update"
  on public.gas_reading
  for update
  to authenticated
  using (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  )
  with check (
    public.has_role(array['admin'::public.app_role]) or
    (
      public.has_role(array['operator'::public.app_role, 'manager'::public.app_role])
      and public.has_line_scope(line)
    )
  );

create policy "Authenticated import log read"
  on public.import_log
  for select
  to authenticated
  using (true);

create policy "Privileged import log write"
  on public.import_log
  for insert
  to authenticated
  with check (
    public.has_role(array['admin'::public.app_role, 'operator'::public.app_role, 'manager'::public.app_role])
  );

create policy "Privileged import log update"
  on public.import_log
  for update
  to authenticated
  using (
    public.has_role(array['admin'::public.app_role, 'operator'::public.app_role, 'manager'::public.app_role])
  )
  with check (
    public.has_role(array['admin'::public.app_role, 'operator'::public.app_role, 'manager'::public.app_role])
  );

create policy "Authenticated edit history read"
  on public.edit_history
  for select
  to authenticated
  using (public.has_role(array['admin'::public.app_role, 'manager'::public.app_role]));

create policy "Privileged edit history write"
  on public.edit_history
  for insert
  to authenticated
  with check (public.has_role(array['admin'::public.app_role, 'manager'::public.app_role]));

create index if not exists lines_active_idx on public.lines (active);
create index if not exists furnaces_line_idx on public.furnaces (line_code);
create index if not exists product_types_active_idx on public.product_types (active);
create index if not exists materials_active_idx on public.materials (active);
create index if not exists raw_materials_active_idx on public.raw_materials (active);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_line_code_idx on public.profiles (line_code);
create index if not exists targets_year_line_idx on public.targets (year, line_code);
create index if not exists plan_days_year_line_month_idx on public.plan_days (year, line_code, month);
create index if not exists production_ym_line_idx on public.production (ym, line);
create index if not exists gas_reading_ym_furnace_idx on public.gas_reading (ym, furnace_no);
create index if not exists import_log_imported_at_idx on public.import_log (imported_at desc);

insert into public.lines (code, name, press_class)
values
  ('P15', 'P15 라인', '대형'),
  ('P5', 'P5 라인', '중형'),
  ('P8', 'P8 라인', '중형'),
  ('RM', 'R/M 라인', '공용')
on conflict (code) do nothing;

insert into public.furnaces (furnace_no, line_code)
values
  (1, 'P5'),
  (2, 'P5'),
  (3, 'P5'),
  (4, 'P5'),
  (5, 'P5'),
  (6, 'P15'),
  (7, 'RM'),
  (8, 'RM'),
  (9, 'RM'),
  (10, 'RM'),
  (11, 'RM'),
  (12, 'RM'),
  (13, 'RM'),
  (14, 'P8'),
  (15, 'P8'),
  (16, 'P15'),
  (17, 'P15'),
  (18, 'P15'),
  (19, 'P15'),
  (20, 'P15')
on conflict (furnace_no) do nothing;

insert into public.product_types (code, name, is_semi)
values
  ('DIE', '금형강', false),
  ('CRANK', '크랭크축', false),
  ('SHELL', '쉘', false),
  ('ROTOR', '로터', false),
  ('SEMI_COMMON', '공용 반제품', true)
on conflict (code) do nothing;

insert into public.materials (code, name)
values
  ('SKD61', 'SKD61'),
  ('SCM440', 'SCM440'),
  ('SAE1045', 'SAE1045'),
  ('S45C', 'S45C'),
  ('SCM415', 'SCM415')
on conflict (code) do nothing;

insert into public.raw_materials (code, name)
values
  ('INGOT', '잉곳'),
  ('CHARGE', '차지'),
  ('RETURN', '회수재'),
  ('BAR', '봉강')
on conflict (code) do nothing;

insert into public.targets (year, line_code, daily_target_ton)
values
  (2024, 'P15', 190),
  (2024, 'P5', 172),
  (2024, 'P8', 160),
  (2024, 'RM', 139),
  (2025, 'P15', 190),
  (2025, 'P5', 172),
  (2025, 'P8', 160),
  (2025, 'RM', 139),
  (2026, 'P15', 190),
  (2026, 'P5', 172),
  (2026, 'P8', 160),
  (2026, 'RM', 139)
on conflict (year, line_code) do nothing;

