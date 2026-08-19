-- Dashboard live updates. Admins already have SELECT via RLS.
do $$
begin
  alter publication supabase_realtime add table public.case_events;
exception
  when duplicate_object then
    null;
end $$;
