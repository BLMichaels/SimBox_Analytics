create table if not exists public.suppressed_event_keys (
  event_key text primary key,
  suppressed_at timestamptz not null default now(),
  constraint suppressed_event_keys_len check (char_length(event_key) between 1 and 180)
);

alter table public.suppressed_event_keys enable row level security;
revoke all on table public.suppressed_event_keys from public, anon, authenticated;
grant all on table public.suppressed_event_keys to service_role;

