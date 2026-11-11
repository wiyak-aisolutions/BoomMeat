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
