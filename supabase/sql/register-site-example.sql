-- Register a hospital / program site code.
-- Use the same site_key in case URLs: ?simbox_site=EMORY_ED
-- Ingest will then set metadata.hospitalName from display_name.

insert into public.sites (site_key, display_name, organization, city, region, country, active)
values
  ('EMORY_ED', 'Emory University Hospital', 'Emory Healthcare', 'Atlanta', 'Georgia', 'United States', true)
on conflict (site_key) do update
set
  display_name = excluded.display_name,
  organization = excluded.organization,
  city = excluded.city,
  region = excluded.region,
  country = excluded.country,
  active = excluded.active,
  updated_at = now();
