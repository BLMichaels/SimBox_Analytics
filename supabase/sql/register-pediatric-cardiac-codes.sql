-- Register Pediatric Cardiac Codes for production ingest.
insert into public.cases (case_key, display_name, active, app_version)
values ('SimBox_Pediatric_Cardiac_Codes', 'SimBox Pediatric Cardiac Codes', true, '1.0.0')
on conflict (case_key) do update
  set display_name = excluded.display_name,
      active = excluded.active,
      app_version = excluded.app_version;
