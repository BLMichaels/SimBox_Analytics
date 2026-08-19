-- Seed cases + non-sensitive example events for dashboard development.
-- All seed events set metadata.environment = 'seed' so they can be
-- excluded from production reporting (dashboard "Include seed/test events").

insert into public.cases (case_key, display_name, active, app_version)
values
  ('SimBox_DKA', 'SimBox DKA', true, '1.0.0'),
  ('SimBox_Abdominal_Trauma', 'SimBox Abdominal Trauma', true, '1.0.0'),
  ('SimBox_Suicide_Screen_Nursing', 'SimBox Suicide Screen (Nursing)', true, '1.0.0'),
  ('SimBox_Penetrating_Trauma', 'SimBox Penetrating Trauma', true, '1.0.0'),
  ('SimBox_Asthma', 'SimBox Asthma', true, '1.0.0'),
  ('SimBox_Bronchiolitis', 'SimBox Bronchiolitis', true, '1.0.0'),
  ('SimBox_Postpartum_Complication', 'SimBox Postpartum Complication', true, '1.0.0'),
  ('SimBox_Scald_Burn', 'SimBox Scald Burn', true, '1.0.0'),
  ('SimBox_Trach', 'SimBox Trach', true, '1.0.0'),
  ('SimBox_Vomiting_Baby', 'SimBox Vomiting Baby', true, '1.0.0'),
  ('SimBox_Suicide_Screening_ASQ_C-SSRS', 'SimBox Suicide Screening ASQ / C-SSRS', true, '1.0.0'),
  ('SimBox_Suicide_Assessment_BSSA_SAFE-T', 'SimBox Suicide Assessment BSSA / SAFE-T', true, '1.0.0')
on conflict (case_key) do update
  set display_name = excluded.display_name,
      active = excluded.active,
      app_version = excluded.app_version;

-- Deterministic seed events across the last ~40 days.
with case_ids as (
  select case_key, id from public.cases
  where case_key in (
    'SimBox_DKA',
    'SimBox_Abdominal_Trauma',
    'SimBox_Suicide_Screen_Nursing',
    'SimBox_Penetrating_Trauma'
  )
),
grid as (
  select
    c.id as case_id,
    c.case_key,
    d::date as day,
    s as session_n,
    (array['github_direct', 'wix_embedded', 'github_direct', 'wix_embedded', 'github_direct'])[1 + (s % 5)] as delivery_context,
    (array['desktop', 'desktop', 'tablet', 'mobile', 'desktop'])[1 + (s % 5)] as device_type
  from case_ids c
  cross join generate_series(current_date - 39, current_date, interval '1 day') as d
  cross join generate_series(1, 3) as s
  where (hashtext(c.case_key || d::text || s::text) % 4) <> 0
),
prepared as (
  select
    g.*,
    'seed-' || substr(md5(g.case_key || g.day::text || g.session_n::text), 1, 16) as session_id,
    (g.day + make_interval(hours => 13 + (g.session_n % 5), minutes => (g.session_n * 7) % 50)) at time zone 'utc' as started_at,
    180 + abs(hashtext(g.case_key || g.day::text || g.session_n::text)) % 900 as duration_seconds,
    (abs(hashtext(g.case_key || 'done' || g.day::text || g.session_n::text)) % 10) >= 4 as did_complete,
    (abs(hashtext(g.case_key || 'exit' || g.day::text || g.session_n::text)) % 10) >= 6 as did_exit
  from grid g
)
insert into public.case_events (
  occurred_at,
  event_type,
  case_id,
  session_id,
  event_key,
  elapsed_seconds,
  delivery_context,
  device_type,
  app_version,
  metadata
)
select
  p.started_at,
  'case_started',
  p.case_id,
  p.session_id,
  p.session_id || ':case_started',
  0,
  p.delivery_context,
  p.device_type,
  '1.0.0-seed',
  jsonb_build_object('environment', 'seed', 'source', 'sql_seed')
from prepared p
union all
select
  p.started_at + make_interval(secs => p.duration_seconds),
  'case_completed',
  p.case_id,
  p.session_id,
  p.session_id || ':case_completed',
  p.duration_seconds,
  p.delivery_context,
  p.device_type,
  '1.0.0-seed',
  jsonb_build_object('environment', 'seed', 'source', 'sql_seed')
from prepared p
where p.did_complete
union all
select
  p.started_at + make_interval(secs => least(p.duration_seconds, 90 + (p.session_n * 20))),
  'case_exited',
  p.case_id,
  p.session_id,
  p.session_id || ':case_exited',
  least(p.duration_seconds, 90 + (p.session_n * 20)),
  p.delivery_context,
  p.device_type,
  '1.0.0-seed',
  jsonb_build_object('environment', 'seed', 'source', 'sql_seed')
from prepared p
where p.did_exit and not p.did_complete
on conflict (event_key) do nothing;
