-- Allow anonymous mid-case step checkpoints and report drop-off by step.

alter table public.case_events drop constraint if exists case_events_type_ok;
alter table public.case_events add constraint case_events_type_ok check (
  event_type in ('case_started', 'case_completed', 'case_exited', 'case_checkpoint')
);

create or replace function public.admin_filtered_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_case_ids uuid[] default null,
  p_event_types text[] default null,
  p_delivery_contexts text[] default null,
  p_device_types text[] default null,
  p_include_nonproduction boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select e.*
    from public.case_events e
    where e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_case_ids is null or e.case_id = any (p_case_ids))
      and (p_event_types is null or e.event_type = any (p_event_types))
      and (p_delivery_contexts is null or e.delivery_context = any (p_delivery_contexts))
      and (p_device_types is null or e.device_type = any (p_device_types))
      and (
        p_include_nonproduction
        or coalesce(e.metadata ->> 'environment', 'production') = 'production'
      )
  ),
  kpis as (
    select
      count(*) filter (where event_type = 'case_started') as starts,
      count(*) filter (where event_type = 'case_completed') as completions,
      count(*) filter (where event_type = 'case_exited') as exits,
      count(distinct session_id) as unique_sessions,
      count(distinct case_id) as active_cases,
      avg(elapsed_seconds) filter (
        where event_type = 'case_completed' and elapsed_seconds is not null
      ) as avg_completion_seconds,
      percentile_cont(0.5) within group (order by elapsed_seconds) filter (
        where event_type = 'case_completed' and elapsed_seconds is not null
      ) as median_completion_seconds
    from filtered
  ),
  daily as (
    select
      date_trunc('day', occurred_at) as day_utc,
      count(*) filter (where event_type = 'case_started') as starts,
      count(*) filter (where event_type = 'case_completed') as completions
    from filtered
    group by 1
    order by 1
  ),
  by_case as (
    select
      c.id,
      c.case_key,
      c.display_name,
      count(*) filter (where f.event_type = 'case_started') as starts,
      count(*) filter (where f.event_type = 'case_completed') as completions,
      case
        when count(*) filter (where f.event_type = 'case_started') = 0 then 0
        else
          count(*) filter (where f.event_type = 'case_completed')::numeric
          / count(*) filter (where f.event_type = 'case_started')
      end as completion_rate
    from public.cases c
    left join filtered f on f.case_id = c.id
    where p_case_ids is null or c.id = any (p_case_ids)
    group by c.id, c.case_key, c.display_name
  ),
  by_delivery as (
    select coalesce(delivery_context, 'unknown') as key, count(*) as n
    from filtered
    where event_type = 'case_started'
    group by 1
  ),
  by_device as (
    select coalesce(device_type, 'unknown') as key, count(*) as n
    from filtered
    where event_type = 'case_started'
    group by 1
  ),
  by_step as (
    select
      coalesce((metadata ->> 'step')::int, 0) as step,
      coalesce(nullif(metadata ->> 'slideTitle', ''), 'Step ' || coalesce(metadata ->> 'step', '?')) as label,
      count(distinct session_id) as sessions
    from filtered
    where event_type in ('case_started', 'case_checkpoint', 'case_completed')
      and metadata ? 'step'
    group by 1, 2
    order by 1, 2
  )
  select jsonb_build_object(
    'kpis', (select to_jsonb(kpis) from kpis),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by day_utc) from daily), '[]'::jsonb),
    'by_case', coalesce((select jsonb_agg(to_jsonb(by_case) order by display_name) from by_case), '[]'::jsonb),
    'by_delivery', coalesce((select jsonb_agg(to_jsonb(by_delivery)) from by_delivery), '[]'::jsonb),
    'by_device', coalesce((select jsonb_agg(to_jsonb(by_device)) from by_device), '[]'::jsonb),
    'by_step', coalesce((select jsonb_agg(to_jsonb(by_step) order by step, label) from by_step), '[]'::jsonb)
  );
$$;
