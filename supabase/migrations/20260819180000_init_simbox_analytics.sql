-- SimBox anonymous usage analytics
-- RLS is enabled on every application table.
-- The anon role receives NO table grants. Learners never talk to Postgres;
-- they POST to the record-simbox-event Edge Function, which uses the
-- service role only on the server.

create extension if not exists "pgcrypto";

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_key text not null unique,
  display_name text not null,
  active boolean not null default true,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_case_key_format check (case_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'),
  constraint cases_case_key_len check (char_length(case_key) between 1 and 80),
  constraint cases_display_name_len check (char_length(display_name) between 1 and 120)
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  event_type text not null,
  case_id uuid not null references public.cases (id) on delete restrict,
  session_id text not null,
  event_key text not null unique,
  elapsed_seconds integer,
  delivery_context text,
  device_type text,
  app_version text,
  metadata jsonb not null default '{}'::jsonb,
  constraint case_events_type_ok check (
    event_type in ('case_started', 'case_completed', 'case_exited')
  ),
  constraint case_events_elapsed_ok check (
    elapsed_seconds is null or elapsed_seconds >= 0
  ),
  constraint case_events_delivery_ok check (
    delivery_context is null
    or delivery_context in ('github_direct', 'wix_embedded', 'unknown')
  ),
  constraint case_events_device_ok check (
    device_type is null
    or device_type in ('desktop', 'tablet', 'mobile', 'unknown')
  ),
  constraint case_events_session_len check (char_length(session_id) between 1 and 80),
  constraint case_events_event_key_len check (char_length(event_key) between 1 and 180)
);

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint admin_users_role_ok check (role = 'admin')
);

-- ---------------------------------------------------------------------------
-- Admin helper (SECURITY DEFINER). Authorization lives in admin_users,
-- never in JWT user_metadata.
-- ---------------------------------------------------------------------------
create or replace function private.is_simbox_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function private.is_simbox_admin() from public, anon;
grant execute on function private.is_simbox_admin() to authenticated;
grant usage on schema private to authenticated;

create index case_events_case_occurred_idx
  on public.case_events (case_id, occurred_at desc);

create index case_events_type_occurred_idx
  on public.case_events (event_type, occurred_at desc);

create index case_events_session_idx
  on public.case_events (session_id);

create index case_events_event_key_idx
  on public.case_events (event_key);

-- ---------------------------------------------------------------------------
-- updated_at + immutable case_key after events exist
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cases_touch_updated_at
before update on public.cases
for each row execute function private.touch_updated_at();

create or replace function private.prevent_case_key_change_with_events()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.case_key is distinct from old.case_key then
    if exists (select 1 from public.case_events where case_id = old.id) then
      raise exception 'case_key cannot change after events exist'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger cases_protect_case_key
before update on public.cases
for each row execute function private.prevent_case_key_change_with_events();

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker so table RLS applies)
-- ---------------------------------------------------------------------------
create or replace view public.daily_case_metrics
with (security_invoker = true)
as
select
  date_trunc('day', e.occurred_at) as day_utc,
  c.id as case_id,
  c.case_key,
  c.display_name,
  count(*) filter (where e.event_type = 'case_started') as total_starts,
  count(*) filter (where e.event_type = 'case_completed') as total_completions,
  count(*) filter (where e.event_type = 'case_exited') as total_exits,
  case
    when count(*) filter (where e.event_type = 'case_started') = 0 then 0
    else
      count(*) filter (where e.event_type = 'case_completed')::numeric
      / count(*) filter (where e.event_type = 'case_started')
  end as completion_rate,
  avg(e.elapsed_seconds) filter (
    where e.event_type = 'case_completed' and e.elapsed_seconds is not null
  ) as avg_completion_seconds,
  percentile_cont(0.5) within group (order by e.elapsed_seconds)
    filter (
      where e.event_type = 'case_completed' and e.elapsed_seconds is not null
    ) as median_completion_seconds,
  count(distinct e.session_id) as unique_anonymous_sessions,
  count(*) filter (where e.delivery_context = 'github_direct') as github_direct_events,
  count(*) filter (where e.delivery_context = 'wix_embedded') as wix_embedded_events,
  count(*) filter (where e.delivery_context = 'unknown') as unknown_delivery_events,
  count(*) filter (where e.device_type = 'desktop') as desktop_events,
  count(*) filter (where e.device_type = 'tablet') as tablet_events,
  count(*) filter (where e.device_type = 'mobile') as mobile_events,
  count(*) filter (where e.device_type = 'unknown') as unknown_device_events
from public.case_events e
join public.cases c on c.id = e.case_id
group by 1, c.id, c.case_key, c.display_name;

create or replace view public.case_summary_metrics
with (security_invoker = true)
as
select
  c.id as case_id,
  c.case_key,
  c.display_name,
  c.active,
  c.app_version,
  count(*) filter (where e.event_type = 'case_started') as total_starts,
  count(*) filter (where e.event_type = 'case_completed') as total_completions,
  count(*) filter (where e.event_type = 'case_exited') as total_exits,
  case
    when count(*) filter (where e.event_type = 'case_started') = 0 then 0
    else
      count(*) filter (where e.event_type = 'case_completed')::numeric
      / count(*) filter (where e.event_type = 'case_started')
  end as completion_rate,
  avg(e.elapsed_seconds) filter (
    where e.event_type = 'case_completed' and e.elapsed_seconds is not null
  ) as avg_completion_seconds,
  percentile_cont(0.5) within group (order by e.elapsed_seconds)
    filter (
      where e.event_type = 'case_completed' and e.elapsed_seconds is not null
    ) as median_completion_seconds,
  count(distinct e.session_id) as unique_anonymous_sessions,
  count(*) filter (where e.delivery_context = 'github_direct') as github_direct_events,
  count(*) filter (where e.delivery_context = 'wix_embedded') as wix_embedded_events,
  count(*) filter (where e.delivery_context = 'unknown') as unknown_delivery_events,
  count(*) filter (where e.device_type = 'desktop') as desktop_events,
  count(*) filter (where e.device_type = 'tablet') as tablet_events,
  count(*) filter (where e.device_type = 'mobile') as mobile_events,
  count(*) filter (where e.device_type = 'unknown') as unknown_device_events
from public.cases c
left join public.case_events e on e.case_id = c.id
group by c.id, c.case_key, c.display_name, c.active, c.app_version;

-- ---------------------------------------------------------------------------
-- Filtered metrics for the dashboard date picker (RLS via invoker)
-- ---------------------------------------------------------------------------
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
    group by 1
  ),
  by_device as (
    select coalesce(device_type, 'unknown') as key, count(*) as n
    from filtered
    group by 1
  )
  select jsonb_build_object(
    'kpis', (select to_jsonb(kpis) from kpis),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by day_utc) from daily), '[]'::jsonb),
    'by_case', coalesce((select jsonb_agg(to_jsonb(by_case) order by display_name) from by_case), '[]'::jsonb),
    'by_delivery', coalesce((select jsonb_agg(to_jsonb(by_delivery)) from by_delivery), '[]'::jsonb),
    'by_device', coalesce((select jsonb_agg(to_jsonb(by_device)) from by_device), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_filtered_metrics(
  timestamptz, timestamptz, uuid[], text[], text[], text[], boolean
) from public, anon;
grant execute on function public.admin_filtered_metrics(
  timestamptz, timestamptz, uuid[], text[], text[], text[], boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- Policy intent:
--   anon        — no SELECT/INSERT/UPDATE/DELETE on analytics tables
--   authenticated listed in admin_users — read cases, events, views
--   administrators — insert/update cases (create, rename display, activate)
--   case_events    — no client writes; Edge Function uses service role
-- ---------------------------------------------------------------------------
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.admin_users enable row level security;

revoke all on table public.cases from public, anon, authenticated;
revoke all on table public.case_events from public, anon, authenticated;
revoke all on table public.admin_users from public, anon, authenticated;
revoke all on table public.daily_case_metrics from public, anon, authenticated;
revoke all on table public.case_summary_metrics from public, anon, authenticated;

grant select, insert, update on table public.cases to authenticated;
grant select on table public.case_events to authenticated;
grant select on table public.admin_users to authenticated;
grant select on table public.daily_case_metrics to authenticated;
grant select on table public.case_summary_metrics to authenticated;

create policy cases_admin_select
  on public.cases for select
  to authenticated
  using (private.is_simbox_admin());

create policy cases_admin_insert
  on public.cases for insert
  to authenticated
  with check (private.is_simbox_admin());

create policy cases_admin_update
  on public.cases for update
  to authenticated
  using (private.is_simbox_admin())
  with check (private.is_simbox_admin());

create policy case_events_admin_select
  on public.case_events for select
  to authenticated
  using (private.is_simbox_admin());

-- Admins may read their own admin_users row (and others, for a simple roster).
create policy admin_users_admin_select
  on public.admin_users for select
  to authenticated
  using (private.is_simbox_admin());
