# SimBox Analytics

Anonymous, aggregate usage analytics for SimBox Articulate Storyline cases hosted on GitHub Pages and embedded on Wix.

The dashboard is hosted at **https://simbox-analytics.vercel.app** and uses the `SimBox_Analytics` Supabase project (`ututhxkwvhpnoyrfjzbu`).

## Privacy

The system stores only:

- case started / completed / exited
- case key
- anonymous session id (sessionStorage, not localStorage)
- timestamps and elapsed seconds
- delivery context (`github_direct` | `wix_embedded` | `unknown`)
- broad device category
- app version
- optional non-sensitive structured metadata (for example `environment`)

It never collects names, emails, employee ids, IP addresses, PHI, free text, full user-agent strings, fingerprints, or identifying cookies.

Learners never receive a service-role key. GitHub Pages talks only to the public Edge Function.

## Architecture

```
Storyline case (GitHub Pages, maybe inside a Wix iframe)
  → public/simbox-tracking.js
  → POST /functions/v1/record-simbox-event
  → service role insert into case_events (RLS still on; anon has no table rights)

Admin dashboard (Vite)
  → Supabase Auth
  → admin_users gate
  → read cases, case_events, reporting views
```

### RLS (also in the migration comments)

| Role | `cases` | `case_events` | reporting views | `admin_users` |
|------|---------|---------------|-----------------|---------------|
| `anon` | none | none | none | none |
| `authenticated` not in `admin_users` | denied by policy | denied | denied | denied |
| `authenticated` in `admin_users` | select/insert/update | select | select | select |
| Edge Function (service role) | lookup by key | insert | — | — |

`anon` is revoked at the GRANT level as well as RLS. Views use `security_invoker = true` so they cannot bypass RLS.

Authorization for the dashboard is the `admin_users` table, **not** JWT `user_metadata` (that claim is user-editable).

## Local commands

```bash
# Dashboard
cd dashboard
cp .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable/anon only)
npm install
npm run dev          # http://localhost:5173
npm test
npm run build

# Database (requires Supabase CLI)
supabase start
supabase db reset    # applies migrations + supabase/seed.sql
```

## Create, link, and deploy Supabase

1. Create a project in the Supabase dashboard (or CLI `supabase projects create`).
2. From this repo: `supabase link --project-ref YOUR_PROJECT_REF`.
3. `supabase db push` to apply `supabase/migrations/`.
4. **Do not** run `seed.sql` on production. Use it on a preview/dev database, or load it once for demos.
5. Authentication → enable Email provider. Register the first admin on `/login`, then run `supabase/sql/designate-first-admin.sql` in the SQL editor (replace the email).
6. Edge Function secrets (`supabase secrets set`):
   - `ALLOWED_ORIGINS` — comma-separated, for example  
     `https://blmichaels.github.io,https://www.emergencysimbox.com,https://emergencysimbox.com,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to functions on hosted Supabase. For local serve, put them in a gitignored env file.
7. Deploy: `supabase functions deploy record-simbox-event --no-verify-jwt`  
   (`verify_jwt` is already false in `config.toml` because learners are anonymous.)
8. Confirm the function URL:  
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/record-simbox-event`

Rate limiting: rely on payload caps, CORS, idempotent `event_key`, and the platform gateway (configure ~60 req/min/IP on the function if available). The function does not store client IPs.

## Deploy the dashboard

The dashboard is a static Vite app.

**Vercel / Netlify**

1. Set the project root to `dashboard/` or the build command `npm --prefix dashboard ci && npm --prefix dashboard run build` with output `dashboard/dist`.
2. Environment variables (public):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (publishable key only)
   - optional `VITE_TRACKING_ENDPOINT` if the Cases snippet should show a non-default function URL
3. Add the dashboard origin to Supabase Auth redirect URLs and to `ALLOWED_ORIGINS` only if the dashboard itself will call the tracking function (it normally does not).
4. Deploy.

## Add tracking to a future case

Follow `docs/add-new-case.md`. Short version: copy `simbox-tracking.js`, patch `index.html` after `user.js`, add Storyline Execute JavaScript `SimBoxTracking.start()` / `complete()`, register the case key, test GitHub and Wix.

## Manual tests required on GitHub Pages and Wix

See `docs/testing.md`. At minimum:

- Start once per tab session on Pages and inside the Wix iframe
- Complete from the Debrief trigger
- Exit on tab close before complete
- `github_direct` vs `wix_embedded`
- Duplicate trigger does not duplicate rows
- Dashboard filters, CSV, login, and non-admin denial

## Reference-case integration summary

Existing custom JS in Penetrating Trauma is **countdown timers**, not usage tracking. This platform does not wrap `Script1`–`Script6`. Start/complete require new Storyline Execute JavaScript; exit uses `pagehide`. Articulate’s `analytics-frame.html` is vendor telemetry and is left untouched.
