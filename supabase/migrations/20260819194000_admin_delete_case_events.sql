-- Admins may delete events (test/seed cleanup and corrections).
grant delete on table public.case_events to authenticated;

create policy case_events_admin_delete
  on public.case_events for delete
  to authenticated
  using (private.is_simbox_admin());
