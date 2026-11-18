-- Boom Meat ERP — step 2 of «who downloads what» (run ONLY after the dashboard v104+ is uploaded).
-- Before: every active account could read the whole erp_state row. After: only the cost roles read it directly;
-- everyone else gets the filtered copy from the erp function (op "state"), which uses the service role.
-- Undo: run the block at the bottom.
create or replace function public.can_read_books() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active and p.role in ('owner', 'accountant', 'storekeeper'))
$$;
revoke all on function public.can_read_books() from public;
grant execute on function public.can_read_books() to authenticated, service_role;
drop policy if exists "state readable by active users" on public.erp_state;
drop policy if exists "state readable by cost roles" on public.erp_state;
create policy "state readable by cost roles" on public.erp_state for select to authenticated using (public.can_read_books());

-- UNDO (back to the old rule):
-- drop policy if exists "state readable by cost roles" on public.erp_state;
-- create policy "state readable by active users" on public.erp_state for select to authenticated using (public.is_active_user());
