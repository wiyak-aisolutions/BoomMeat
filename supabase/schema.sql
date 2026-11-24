-- Boom Meat ERP — database schema (run once on a new Supabase project)
-- Browsers can only READ. Every write goes through the `erp` Edge Function (service role).

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  name       text not null,
  role       text not null check (role in ('owner','accountant','storekeeper','supervisor','worker','sales')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.erp_state (
  id         int primary key check (id = 1),
  version    bigint not null default 0,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- tiny row the browsers subscribe to (realtime) so they reload when anyone saves
create table if not exists public.erp_ping (
  id         int primary key check (id = 1),
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- append-only log of every request (who, what, result)
create table if not exists public.erp_ops (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  user_id  uuid,
  username text,
  op       text not null,
  args     jsonb,
  ok       boolean,
  error    text,
  version  bigint
);

-- one full copy of the books per day (first save of the day)
create table if not exists public.erp_snapshots (
  day     date primary key,
  version bigint not null,
  state   jsonb not null,
  at      timestamptz not null default now()
);

-- server-only secrets (Telegram bot token)
create table if not exists public.erp_secrets (
  key   text primary key,
  value text not null
);

alter table public.profiles      enable row level security;
alter table public.erp_state     enable row level security;
alter table public.erp_ping      enable row level security;
alter table public.erp_ops       enable row level security;
alter table public.erp_snapshots enable row level security;
alter table public.erp_secrets   enable row level security;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active)
$$;

drop policy if exists "profiles readable by active users" on public.profiles;
create policy "profiles readable by active users" on public.profiles for select to authenticated using (public.is_active_user());
drop policy if exists "state readable by active users" on public.erp_state;
create policy "state readable by active users" on public.erp_state for select to authenticated using (public.is_active_user());
drop policy if exists "ping readable by active users" on public.erp_ping;
create policy "ping readable by active users" on public.erp_ping for select to authenticated using (public.is_active_user());
-- erp_ops / erp_snapshots / erp_secrets: no policies => not reachable from browsers

-- optimistic save: succeeds only if nobody saved since `p_base`; returns the new version or null
create or replace function public.erp_save(p_state jsonb, p_base bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update public.erp_state set state = p_state, version = version + 1, updated_at = now()
   where id = 1 and version = p_base
  returning version into v;
  if v is not null then
    update public.erp_ping set version = v, updated_at = now() where id = 1;
  end if;
  return v;
end $$;
revoke all on function public.erp_save(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.erp_save(jsonb, bigint) to service_role;

insert into public.erp_ping (id, version) values (1, 0) on conflict do nothing;

do $$ begin
  alter publication supabase_realtime add table public.erp_ping;
exception when duplicate_object then null; end $$;
-- Account requests: a 'pending' role, a phone number, and pending users cannot read the books.
alter table public.profiles add column if not exists phone text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','accountant','storekeeper','supervisor','worker','sales','pending'));
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active and p.role <> 'pending')
$$;
-- a signed-in user may always read their OWN profile (needed to show "waiting for approval")
drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles for select to authenticated using (user_id = auth.uid());
