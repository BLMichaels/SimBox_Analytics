# Reference case audit — SimBox_Penetrating_Trauma

**Repository inspected:** https://github.com/BLMichaels/SimBox_Penetrating_Trauma  
**Clone location used for this audit:** `/tmp/SimBox_Penetrating_Trauma` (shallow clone, 2026-08-19)  
**Published player:** Articulate Storyline 360 `3.105.35604.0` (`index.html` comment; `meta.xml` application version matches)  
**GitHub Pages URL:** https://blmichaels.github.io/SimBox_Penetrating_Trauma/

This audit records **what is actually in the published package**. No Storyline source `.story` file is present in the GitHub repository.

---

## 1. Files inspected

### Root

| File | Role |
|------|------|
| `index.html` | Storyline HTML5 shell: globals, device classes, script load order, bootstrapper |
| `analytics-frame.html` | Articulate **product** metrics iframe (posts to `https://metrics.articulate.com/v1/import`). Not SimBox usage analytics. |
| `meta.xml` | Publish metadata (title “SimBox Case”, duration, author, asset pointers) |
| `.gitattributes` | Git attributes only |

**Root-level JavaScript:** none. There is no `*.js` file at the repository root.

### `story_content/` (custom + generated)

| File | Role |
|------|------|
| `story_content/triggers.js` | `ExecuteScript(strId)` switch that dispatches Storyline Execute JavaScript trigger IDs to `Script1`–`Script6` |
| `story_content/user.js` | `InitUserScripts()` plus `window.Script1`–`window.Script6` **countdown timer** implementations |
| Other files in this folder | Media (mp3/mp4), `thumbnail.jpg`, `zoomIcon.png` — **not inspected as code**; not modified |

### `html5/` (generated player — inspected for trigger kinds only)

| File | Role |
|------|------|
| `html5/lib/hls/hls.min.js` | Video HLS library |
| `html5/lib/scripts/bootstrapper.min.js` | Player bootstrap (loaded last from `index.html`) |
| `html5/lib/scripts/slides.min.js` | Player runtime |
| `html5/lib/scripts/frame.desktop.min.js` / `frame.mobile.min.js` | Frame chrome |
| `html5/data/css/output.min.css` | Player CSS (linked from `index.html`) |
| `html5/data/js/data.js` | Course data: scenes, scoring, variables, player action groups |
| `html5/data/js/frame.js` | Frame layout (`chromeless: true`) |
| `html5/data/js/paths.js` | Asset paths |
| Slide JS | Per-slide JSON payloads (titles below) |

**Slide JS files and titles:**

| File | Slide title |
|------|-------------|
| `html5/data/js/6rMW77Q5Bvk.js` | Intro |
| `html5/data/js/6pbb4JVw6bA.js` | Prebrief |
| `html5/data/js/5iXEYhvIuOx.js` | Scenario Background |
| `html5/data/js/6IVoj92wIfN.js` | Case Preparation |
| `html5/data/js/5W2RpqpDfbE.js` | Triage and Vitals |
| `html5/data/js/5wBOn6JpYuo.js` | Step 1 |
| `html5/data/js/6B9cdQYx4Ee.js` | Step 2 |
| `html5/data/js/6ojoDsd6uJI.js` | Step 3 |
| `html5/data/js/5aNIF0c6vDb.js` | Step 4 |
| `html5/data/js/6Pv2ORu2N7H.js` | Sign Out |
| `html5/data/js/6JEHmVURKY0.js` | Debrief & Feedback |

### `mobile/`

Poster images and compressed mobile data (`mobile/data.json` referenced from `meta.xml`). No custom tracking scripts. **Not modified.**

### Searches performed

- Root `*.js` / `*.html` / `*.xml`
- `story_content/user.js`, `story_content/triggers.js`
- Slide JSON action `kind` values (parsed from `window.globalProvideData`)
- Strings: `SimBoxTracking`, `case_started`, `executejavascript`, LMS complete helpers

**Not present:** LMS/Tin Can runtime (`lmsPresent: false`, `tinCanPresent: false`, `cmi5Present: false` in `index.html`). Scoring in `data.js` is view-based (`type: "view"`, `viewThreshold: 11`) with **no custom complete/exit JavaScript**.

---

## 2. Existing start / end trigger code found

### Clarification (required)

**No dedicated SimBox “case started / case completed / case exited” tracking code exists in this published package.**

What *does* exist:

1. **Storyline Execute JavaScript triggers** — six scripts. All implement **in-case countdown timers**, not usage analytics.
2. **Player `onslidestart` / `onbeforeslidein`** — generated navigation/layout, not SimBox tracking.
3. **Articulate `analytics-frame.html`** — vendor telemetry to Articulate, with a **placeholder IP** `0.0.0.0` in the payload. This is not the SimBox pipeline and must not be reused or altered.
4. **Player finish chrome** — `data.js` `ActGrpOnFinishButtonClick` runs `trigger_slide_finish`. Frame is `chromeless: true`, so this is not a reliable case-completion hook.

**This platform therefore does not wrap `Script1`–`Script6`.** Wrapping them would fire tracking on timer slides (Steps 1–4, Case Preparation, Debrief) and would change timing behavior risk if those functions were rewritten.

If you intended different start/end triggers (for example unpublished Storyline triggers that did not survive this publish), say so before we attach `SimBoxTracking.start()` / `complete()` to a specific `ScriptN`.

### Exact custom JavaScript (verbatim role)

`story_content/triggers.js` dispatch map:

```text
6fyyJJFf6ac → Script1   (Case Preparation, timeline tick)
60jK7Dbq2Uu → Script2   (Step 1, onslidestart)
69m8hMOnYO5 → Script3   (Step 2, onslidestart)
6EwELsjFZAd → Script4   (Step 3, onslidestart)
6HaxnqvVJm7 → Script5   (Step 4, onslidestart)
6cd9FOtgnrB → Script6   (Debrief & Feedback, onslidestart)
```

| Script | What it does (from `user.js`) |
|--------|-------------------------------|
| `Script1` | 60-second `countdownText` interval timer |
| `Script2`–`Script5` | Duplicate `Time5Remaining` / `Timer5Text` countdown; starts once via `window.timer5IsRunning` |
| `Script6` | `TimeRemaining` / `TimerText` countdown; starts once via `window.timerIsRunning` |

There is **no** `complete()`, `exit()`, LMS `SetStatus`, or `SimBoxTracking` call in these files.

### Course structure (for future Storyline-authored triggers)

Scene order in `html5/data/js/data.js`:

1. **Intro** (`6rMW77Q5Bvk`) — first content slide; `onslidestart` has only a previous-button `if_action`. **Best candidate for a new Execute JavaScript trigger calling `SimBoxTracking.start()`** (add in Storyline, republish; do not edit generated slide JSON).
2. Prebrief → Scenario Background → Case Preparation → Triage and Vitals
3. Step 1 → Step 2 → Step 3 → Step 4
4. **Sign Out** (`6Pv2ORu2N7H`) — no `exe_javascript`
5. **Debrief & Feedback** (`6JEHmVURKY0`) — already runs `Script6` timer on `onslidestart`. **Best candidate for a *second* Execute JavaScript trigger calling `SimBoxTracking.complete()`**, kept separate from `Script6`.

Step 4 is the only step that links forward to Sign Out.

---

## 3. Current file-loading order in `index.html`

Head (before `</head>`):

1. Inline `window.DS` / `window.globals` configuration
2. Inline IE11 unsupported-browser branch
3. Empty Localization feature stub
4. Inline `window.THREE = { }`
5. `html5/lib/hls/hls.min.js`

Body:

6. Inline `isMobile` detection
7. `#focus-sink`, `#preso`
8. Inline device CSS class helper (`view-desktop` / `view-mobile` / …)
9. **`story_content/triggers.js`**
10. **`story_content/user.js`**
11. Slide loader dots (inline)
12. Mobile title overlay markup
13. Connection-warning CSS + markup + inline `DS.connection` logic
14. `html5/data/css/output.min.css`
15. After `</body>`: **`html5/lib/scripts/bootstrapper.min.js`**

`analytics-frame.html` is **not** referenced from `index.html`; the player loads it dynamically when Articulate analytics is not suppressed (`suppressAnalytics: false`).

---

## 4. Where custom JavaScript lives

**Both:**

- **Separate files:** `story_content/user.js` and `story_content/triggers.js` (Storyline’s standard publish of Execute JavaScript).
- **Embedded in generated slide JSON:** `exe_javascript` actions with IDs only (the script bodies are not inlined in slide files).
- **Not** a standalone `simbox-tracking.js` (this platform adds that file **beside** the package, referenced from `index.html`).

Articulate vendor analytics lives in `analytics-frame.html` (separate HTML document).

---

## 5. Likely safe insertion points

Safe for SimBox tracking **without** rewriting Storyline output:

| Location | Why it is safe |
|----------|----------------|
| New file at case repo root, e.g. `simbox-tracking.js` | Additive; republish can keep the file if it is not inside `story_content/` overwrite paths |
| `index.html` immediately **after** `story_content/user.js` (line 147) | Player has not bootstrapped yet; `SimBoxTracking` exists before Execute JavaScript runs |
| `index.html` immediately **before** `bootstrapper.min.js` | Also after user scripts; still before player start |

**Do not** insert tracking by editing:

- `html5/data/js/*.js` slide payloads
- `html5/lib/**`
- `story_content` media
- `mobile/**`
- `meta.xml`
- `analytics-frame.html`
- `user.js` / `triggers.js` timer scripts (republish overwrite + wrong semantics)

**Storyline authoring (recommended for start/complete):** add new Execute JavaScript triggers in the `.story` file, then republish. That updates `user.js` / `triggers.js` **via Storyline**, not by hand-editing generated IDs.

---

## 6. Risks of editing generated Storyline output

- **Republish wipe:** `index.html`, `html5/`, `mobile/`, `story_content/user.js`, `triggers.js`, and media are regenerated. Hand edits disappear unless reapplied.
- **Broken player:** reformatting minified `bootstrapper` / slide JSON can prevent load or media playback.
- **Broken timers:** changing `Script1`–`Script6` can stall scenario countdown UI.
- **Broken media:** renaming `story_content` assets breaks `assetLib` references.
- **Double analytics:** do not pipe Articulate `analytics-frame.html` into Supabase (it is a different product, and the payload shape includes fields we refuse to store).

---

## 7. iframe / delivery context implications

The published case is a static GitHub Pages origin (`https://blmichaels.github.io`). When Wix embeds the case, **the tracking script still runs on GitHub Pages inside the iframe**. Browser `Origin` for `fetch` / `sendBeacon` is therefore GitHub Pages for **both** direct and Wix viewers. Delivery context must be detected with `window.self !== window.top` (iframe ⇒ `wix_embedded`), not from `document.referrer` alone (often omitted).

CORS allowlists must include `https://blmichaels.github.io`. Wix site origins are extra (preview, or if a case is ever hosted on Wix).

---

## 8. Integration decision used by this platform

Because start/end **tracking** triggers were not found:

- `simbox-tracking.js` exposes `SimBoxTracking.start()`, `.complete()`, `.exit()`.
- It does **not** wrap `Script1`–`Script6`.
- It **does** attach a `pagehide` / `visibilitychange` listener for `exit` (there is no existing exit trigger).
- Start/complete must be called from **new** Storyline Execute JavaScript (documented in `docs/add-new-case.md`), or from optional `autoStartOnLoad` only as a documented fallback.
