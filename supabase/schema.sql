-- =============================================================
-- ALERTAVECINAL · Esquema inicial para Supabase (PostgreSQL)
-- Ejecutar completo en Supabase > SQL Editor > New query.
-- La contraseña NO se guarda en profiles: Supabase Auth la gestiona.
-- =============================================================
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text not null default '',
  role text not null default 'vecino' check (role in ('vecino','policia','admin')),
  active boolean not null default true,
  station_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.police_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint station_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint station_longitude_range check (longitude is null or longitude between -180 and 180)
);
alter table public.profiles add column if not exists email text;
alter table public.profiles drop constraint if exists profiles_station_id_fkey;
alter table public.profiles add constraint profiles_station_id_fkey foreign key (station_id) references public.police_stations(id) on delete set null;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique default ('AV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  station_id uuid references public.police_stations(id) on delete set null,
  category text not null check (category in ('robo','sospechoso','violencia','emergencia','vandalismo','otro')),
  description text not null check (char_length(description) >= 8),
  address text,
  latitude double precision,
  longitude double precision,
  photo_url text,
  status text not null default 'Activa' check (status in ('Activa','Recibida','En camino','Atendida','Resuelta','Falsa alarma')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint incident_longitude_range check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create table if not exists public.incident_confirmations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (incident_id,user_id)
);
create table if not exists public.incident_observations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  police_id uuid not null references public.profiles(id) on delete restrict,
  observation text not null check (char_length(observation) between 1 and 3000),
  created_at timestamptz not null default now()
);
create table if not exists public.incident_status_history (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  previous_status text,
  new_status text not null,
  created_at timestamptz not null default now()
);
create index if not exists incidents_created_at_idx on public.incidents(created_at desc);
create index if not exists incidents_status_idx on public.incidents(status);
create index if not exists incidents_reporter_idx on public.incidents(reporter_id);
create index if not exists incidents_station_idx on public.incidents(station_id);
create index if not exists incident_comments_incident_idx on public.incident_comments(incident_id,created_at);

-- Perfil automático: todo registro público es vecino por defecto.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,full_name,email,phone,role,active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Vecino'), new.email, coalesce(new.raw_user_meta_data->>'phone',''), 'vecino', true)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Funciones SECURITY DEFINER para comprobar roles sin recursión de RLS.
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true limit 1 $$;
create or replace function public.current_station_id()
returns uuid language sql stable security definer set search_path = public
as $$ select station_id from public.profiles where id = auth.uid() and active = true limit 1 $$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() in ('policia','admin'),false) $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin',false) $$;

-- Auditar automáticamente cada cambio de estado. La aplicación también conserva observaciones.
create or replace function public.audit_incident_status()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.incident_status_history(incident_id,changed_by,previous_status,new_status)
    values(new.id,auth.uid(),old.status,new.status);
    new.updated_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists incident_status_audit on public.incidents;
create trigger incident_status_audit before update of status on public.incidents for each row execute procedure public.audit_incident_status();

alter table public.profiles enable row level security;
alter table public.police_stations enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_comments enable row level security;
alter table public.incident_confirmations enable row level security;
alter table public.incident_observations enable row level security;
alter table public.incident_status_history enable row level security;

-- Limpiar políticas con los mismos nombres para poder volver a ejecutar este script.
drop policy if exists "profiles_select_self_or_staff" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "stations_read_authenticated" on public.police_stations;
drop policy if exists "stations_admin_all" on public.police_stations;
drop policy if exists "incidents_read_authenticated" on public.incidents;
drop policy if exists "incidents_insert_own_neighbor" on public.incidents;
drop policy if exists "incidents_update_owner_or_staff" on public.incidents;
drop policy if exists "comments_read_authenticated" on public.incident_comments;
drop policy if exists "comments_insert_own" on public.incident_comments;
drop policy if exists "confirmations_read_authenticated" on public.incident_confirmations;
drop policy if exists "confirmations_insert_own" on public.incident_confirmations;
drop policy if exists "observations_staff_read" on public.incident_observations;
drop policy if exists "observations_police_insert" on public.incident_observations;
drop policy if exists "history_staff_read" on public.incident_status_history;

create policy "profiles_select_self_or_staff" on public.profiles for select to authenticated using (id=auth.uid() or public.is_staff());
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check ((id=auth.uid() and role=public.current_app_role()) or public.is_admin());
create policy "stations_read_authenticated" on public.police_stations for select to authenticated using (true);
create policy "stations_admin_all" on public.police_stations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "incidents_read_authenticated" on public.incidents for select to authenticated using (
  public.is_admin()
  or (public.current_app_role()='policia' and (station_id=public.current_station_id() or station_id is null))
  or (public.current_app_role()='vecino' and (status in ('Activa','Recibida','En camino') or reporter_id=auth.uid()))
);
create policy "incidents_insert_own_neighbor" on public.incidents for insert to authenticated with check (reporter_id=auth.uid() and public.current_app_role()='vecino');
create policy "incidents_update_owner_or_staff" on public.incidents for update to authenticated
using (reporter_id=auth.uid() or public.is_admin() or (public.current_app_role()='policia' and (station_id=public.current_station_id() or station_id is null)))
with check (reporter_id=auth.uid() or public.is_admin() or (public.current_app_role()='policia' and (station_id=public.current_station_id() or station_id is null)));
create policy "comments_read_authenticated" on public.incident_comments for select to authenticated using (auth.uid() is not null);
create policy "comments_insert_own" on public.incident_comments for insert to authenticated with check (user_id=auth.uid() and public.current_app_role()='vecino');
create policy "confirmations_read_authenticated" on public.incident_confirmations for select to authenticated using (auth.uid() is not null);
create policy "confirmations_insert_own" on public.incident_confirmations for insert to authenticated with check (user_id=auth.uid() and public.current_app_role()='vecino');
create policy "observations_staff_read" on public.incident_observations for select to authenticated using (public.is_staff());
create policy "observations_police_insert" on public.incident_observations for insert to authenticated with check (police_id=auth.uid() and public.current_app_role()='policia');
create policy "history_staff_read" on public.incident_status_history for select to authenticated using (public.is_staff());

-- Evita que perfiles ordinarios se asignen el rol admin/policia a sí mismos.
-- La actualización de role solo debe hacerla un administrador (o el SQL Editor del propietario).
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  if auth.uid() is not null and new.active is distinct from old.active and not public.is_admin() then
    raise exception 'Solo un administrador puede activar o desactivar cuentas';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger before update on public.profiles for each row execute procedure public.protect_profile_role();

-- CONFIGURACIÓN INICIAL MANUAL:
-- 1) Registra tu usuario administrador en Authentication > Users.
-- 2) Ejecuta en SQL Editor, sustituyendo el correo:
-- update public.profiles p set role='admin' from auth.users u where p.id=u.id and u.email='TU_CORREO_ADMIN@ejemplo.com';
-- 3) Crea los usuarios policiales en Authentication y luego asigna role='policia', station_id y active=true desde SQL/función Edge segura.
-- No expongas nunca la clave service_role en el frontend.

-- Habilita los cambios de incidentes en Supabase Realtime (si la publicación existe).
do $$ begin
  alter publication supabase_realtime add table public.incidents;
exception when duplicate_object then null; when undefined_object then null;
end $$;
