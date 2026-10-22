# SimBox → PECC Activities bridge

When a learner finishes a case (`case_completed`), SimBox Analytics POSTs to
the PECC Support Tool edge function `ingest-simbox-activity` if either:

1. the session has a mapped `siteKey` (`?simbox_site=CODE` or `SIMBOX_TRACKING_CONFIG.siteKey`), or
2. IP locality matches **one** hospital in the PECC directory at high confidence.
   A ZIP match counts only when that ZIP belongs to a single hospital **in the same city**.
   A network org match counts when it names a single campus in that city.

A city that contains exactly one hospital is stored on the analytics dashboard
as medium confidence and is **not** written to Activities. Cities with several
hospitals (Albany, Phoenix, Denver, and so on) stay unidentified.

Matching lives in `public.match_simbox_hospital` and is exposed as
`resolve-simbox-hospital`. High-confidence matches may send `facility_id`
without a site code.

## Configuration (already set on hosted projects)

| Project | Secret / var |
|---------|----------------|
| SimBox Analytics (`ututhxkwvhpnoyrfjzbu`) | `SIMBOX_INGEST_SECRET`, `PECC_SIMBOX_INGEST_URL` |
| ImPACTS / PECC (`ftpifgzzfwpujlvbqqhu`) | `SIMBOX_INGEST_SECRET` (must match) |

URL:
`https://ftpifgzzfwpujlvbqqhu.supabase.co/functions/v1/ingest-simbox-activity`

## Mapping

PECC table: `public.simbox_site_hospitals` (`site_key` → `hospitals.facility_id`)

Example seed rows: `EMORY_ED`, `SIMBOX_TEST` → facility `110010`

SimBox `public.sites` should use the same `site_key` values for local hospital naming.

## How to test

1. Open a case with a mapped site, e.g.  
   `https://blmichaels.github.io/SimBox_Pediatric_Cardiac_Codes/?simbox_site=SIMBOX_TEST`
2. Run through to debrief / completion so `case_completed` fires.
3. In PECC, open the hospital for facility `110010` → **Activities**.  
   Expect an auto-logged Simulation Facilitation entry with the SimBox case name and `session_id` in notes.

Unmapped site codes are ignored by PECC (404); analytics still records the event.
