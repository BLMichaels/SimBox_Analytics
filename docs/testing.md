# Testing

## Environments

| Marker | How it is set | Where it lives |
|--------|----------------|----------------|
| `production` | Default `metadata.environment` from the tracking adapter | Real GitHub Pages / Wix traffic |
| `test` | Append `?simbox_env=test` to the case URL, or set `environment: "test"` in config | Isolated in the dashboard unless “Include seed and test events” is on |
| `seed` | `supabase/seed.sql` | Local/dev database only; do not run against production |

The dashboard hides non-production events unless that checkbox is enabled (it defaults on in `npm run dev`).

## Unit tests

From `dashboard/`:

```bash
npm test
```

These cover event payload validation (types, size, disallowed metadata, elapsed range, timestamps).

## Manual procedures

### One start per new session

1. Open the case with a fresh tab (or DevTools → Application → Session Storage → clear `simbox.*`).
2. Trigger start (Intro Execute JavaScript, or `autoStartOnLoad`).
3. Confirm one `case_started` row.
4. Reload the same tab: no second start (idempotent `event_key` + session flags).
5. Open a second tab: a new anonymous `session_id` and a second start.

### Completion from the final Storyline trigger

1. Reach Debrief & Feedback (or the slide that calls `SimBoxTracking.complete()`).
2. Confirm one `case_completed` with `elapsed_seconds` ≥ 0.
3. Re-enter the slide: no second completion for that session.

### Exit when leaving the page

1. Start a case and close the tab (or navigate away) **before** complete.
2. Confirm one `case_exited` using sendBeacon/fetch.
3. Complete a different session and close the tab: no exit row (exit is skipped after complete).

### Idempotency

POST the same JSON `event_key` twice to `/functions/v1/record-simbox-event`. Both responses are 200; the table has one row.

### GitHub-direct vs Wix-embedded

1. Top-level Pages URL → `github_direct`.
2. iframe on Wix → `wix_embedded`.
3. `window.SIMBOX_TRACKING_CONFIG.debug = true` logs the detected context without sending extra PII.

### Dashboard filters and CSV

1. Sign in as an `admin_users` row.
2. Change Last 7 / Last 30 / custom range; KPIs and charts follow.
3. Filter one case, Wix only, mobile only.
4. Search a shortened session id’s prefix.
5. Export CSV: filename includes the date range; columns include local and UTC timestamps; only the filtered rows.

### Access denial

1. Signed out → `/login`.
2. Signed in but not in `admin_users` → “Not authorized”.
3. Sign out returns to login.

## Edge Function local check

```bash
supabase functions serve record-simbox-event --env-file supabase/.env.local
curl -i -X OPTIONS http://127.0.0.1:54321/functions/v1/record-simbox-event \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```
