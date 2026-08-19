# File manifest

## Documentation
- `README.md`
- `docs/reference-case-audit.md`
- `docs/add-new-case.md`
- `docs/testing.md`
- `docs/FILE_MANIFEST.md` (this file)

## Tracking adapter
- `public/simbox-tracking.js`
- `public/simbox-case-hooks.js` (Penetrating Trauma: start on Triage and Vitals, complete on Step 4)
- `public/index.html.snippet.html`

## Supabase
- `supabase/config.toml`
- `supabase/migrations/20260819180000_init_simbox_analytics.sql`
- `supabase/seed.sql`
- `supabase/sql/designate-first-admin.sql`
- `supabase/functions/_shared/eventPayload.ts`
- `supabase/functions/record-simbox-event/index.ts`

## Dashboard (`dashboard/`)
- Vite + React + TypeScript + Tailwind source under `dashboard/src/`
- Routes: `/login`, `/dashboard`, `/cases`, `/events`, `/help`
- `dashboard/.env.example`

## Configuration
- `.env.example` (repository root pointers)
- `.gitignore`

## Not included (on purpose)
- Storyline-generated case files (`html5/`, `story_content/`, `mobile/`)
- Service-role keys
- The cloned reference case (audited from GitHub; not vendored)
