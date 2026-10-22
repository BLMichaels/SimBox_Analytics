-- Optional hospital / program registry.
-- Learner events may carry metadata.siteKey; ingest resolves that to display_name
-- when a matching active site exists. Network-org hospital detection does not
-- require rows here.

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  site_key text not null unique,
  display_name text not null,
  organization text,
  city text,
  region text,
  country text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_site_key_format check (site_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
  constraint sites_display_name_len check (char_length(display_name) between 1 and 160),
  constraint sites_organization_len check (organization is null or char_length(organization) <= 160),
  constraint sites_city_len check (city is null or char_length(city) <= 80),
  constraint sites_region_len check (region is null or char_length(region) <= 80),
  constraint sites_country_len check (country is null or char_length(country) <= 80),
  constraint sites_notes_len check (notes is null or char_length(notes) <= 500)
);

create index sites_active_key_idx on public.sites (site_key) where active = true;

create trigger sites_touch_updated_at
before update on public.sites
for each row execute function private.touch_updated_at();

alter table public.sites enable row level security;

revoke all on table public.sites from public, anon, authenticated;
grant select, insert, update on table public.sites to authenticated;

create policy sites_admin_select
  on public.sites for select
  to authenticated
  using (private.is_simbox_admin());

create policy sites_admin_insert
  on public.sites for insert
  to authenticated
  with check (private.is_simbox_admin());

create policy sites_admin_update
  on public.sites for update
  to authenticated
  using (private.is_simbox_admin())
  with check (private.is_simbox_admin());
