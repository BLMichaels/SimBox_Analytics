# Add tracking to a new SimBox case

Use this after [the Penetrating Trauma audit](./reference-case-audit.md). Do not rewrite Storyline-generated folders.

## Repeatable checklist

1. Publish the Storyline case as HTML5 to its own GitHub repository.
2. Enable GitHub Pages from the repository root.
3. Register the case in the analytics dashboard **Cases** page. `case_key` must match the repository name (example: `SimBox_Penetrating_Trauma`).
4. Copy `public/simbox-tracking.js` and, for Penetrating Trauma, `public/simbox-case-hooks.js` to the **case repository root**. Do not place them inside `story_content/` or `html5/`.
5. In `index.html`, insert configuration + scripts **immediately after** `story_content/user.js` (see diff below). Do not move `bootstrapper.min.js`.
6. For Penetrating Trauma, `simbox-case-hooks.js` watches Storyline slides (no Storyline republish required):
   - **Start** on **Triage and Vitals** (the slide after the Case Preparation countdown).
   - **Complete** on **Step 4**.
   - Do **not** attach tracking to countdown scripts `Script1`–`Script6`.
7. Republish from Storyline, then restore the `index.html` snippet and tracking JS files if the republish overwrote the root HTML.
8. Open the GitHub Pages URL in a top-level browser tab. Confirm a `case_started` event with `github_direct`.
9. Open the same URL inside the Wix iframe. Confirm `wix_embedded`.
10. Complete the case once. Confirm `case_completed`. Leave mid-case in another session. Confirm `case_exited`.
11. Check Overview with “Include seed and test events” off for production.

## SimBox_Penetrating_Trauma — exact integration

### Files to add

At the **repository root** (same folder as `index.html`):

- `simbox-tracking.js`
- `simbox-case-hooks.js`

### `index.html` insertion (after line 147)

Current:

```html
  <script src='story_content/triggers.js' type=text/javascript></script>
<script src='story_content/user.js' type=text/javascript></script>
  <div class="slide-loader"></div>
```

Safe replacement:

```html
  <script src='story_content/triggers.js' type=text/javascript></script>
<script src='story_content/user.js' type=text/javascript></script>
  <script>
    window.SIMBOX_TRACKING_CONFIG = {
      caseKey: "SimBox_Penetrating_Trauma",
      endpointUrl: "https://ututhxkwvhpnoyrfjzbu.supabase.co/functions/v1/record-simbox-event",
      appVersion: "1.0.0",
      debug: false
    };
  </script>
  <script src="simbox-tracking.js"></script>
  <script src="simbox-case-hooks.js"></script>
  <div class="slide-loader"></div>
```

Replace `YOUR_PROJECT_REF` with the Supabase project ref. Copy the finished snippet from the Cases page.

### When does `SimBoxTracking.start()` fire?

`simbox-case-hooks.js` calls it when the learner reaches **Triage and Vitals** (`5W2RpqpDfbE`) — the slide immediately after **Case Preparation**, which runs the countdown (`Script1` / `countdownText`).

The published Storyline file sets that countdown to **60 seconds** (`user.js` `totalSeconds = 60`, variable `countdownText` default `01:00`). If your Storyline source is a 2-minute timer, the next-slide hook is still correct.

### When does `SimBoxTracking.complete()` fire?

When the learner reaches **Step 4** (`5aNIF0c6vDb`). Sign Out and Debrief after that do not send another completion.

### Should `pagehide` call `SimBoxTracking.exit()`?

**Yes.** The adapter already listens for `pagehide` and `visibilitychange`. There is no Storyline exit trigger in the published package. Exit is skipped if the session already completed, and it uses `navigator.sendBeacon()` with `fetch` fallback.

### Delivery context

| Viewer | Expected `delivery_context` |
|--------|-----------------------------|
| https://blmichaels.github.io/SimBox_Penetrating_Trauma/ as a top-level tab | `github_direct` |
| Same URL inside the Wix iframe | `wix_embedded` |

CORS Origin is still `https://blmichaels.github.io` in both cases.

## SimBox_Pediatric_Cardiac_Codes

This case records stage timings, clinical actions, and compression interruption stats (the same data shown on the Summary / Print Summary slide).

### Extra files (case repo root)

- `vendor/jspdf.umd.min.js` — required for Print Summary
- `simbox-tracking.js`
- `simbox-case-hooks.js`
- `simbox-cardiac-hooks.js` — polls Storyline variables and emits coded metrics

### `index.html`

1. Load jsPDF **before** `story_content/user.js`.
2. Insert the Pediatric snippet from `public/index.html.snippet.pediatric-cardiac.html` **after** `user.js`.

### What gets captured

| Source | Platform event |
|--------|----------------|
| Enter Stage 1 | `case_started` |
| Stage 1 / 2 / 3 / Debrief / Summary slides | funnel `case_checkpoint` |
| Storyline vars (`One1`…`Five3`, epi, defib, ROSC, …) | `case_checkpoint` with `metadata.kind=action`, `action`, `clock`, `stage` |
| `CompressionPauseCount` / Total / Average | `case_checkpoint` with `metadata.kind=compression` |
| Summary Slide | `case_completed` |

### Print Summary in Wix

jsPDF must be present (fixes the “PDF generator is not available” alert). Export uses a blob download / new-tab fallback when the iframe blocks `doc.save()`. If Wix still blocks downloads, open the GitHub Pages URL in a top-level tab and print there, or add `allow-downloads` on the Wix embed iframe.
