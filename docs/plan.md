# Plan: Phase 1 — Foundation

## Context

This is a greenfield project with no source tree yet. Phase 1 establishes the frontend scaffold only. The Supabase setup (schema, RLS, storage) belongs in the Render/Python project — Render is the sole service that talks to Supabase. The frontend never calls Supabase directly.

Architecture:
```
Browser → Render API (Python) → Supabase
```

---

## Files to Create (frontend repo only)

| File | Purpose |
|---|---|
| `index.html` | Shell HTML; loads fonts; `<div id="app">` mount point |
| `style.css` | CSS custom properties for Paper theme, base resets |
| `app.js` | Render API client + minimal screen-switching skeleton |

The `supabase/` folder does NOT belong here — SQL scripts live in the Render/Python repo.

---

## Implementation Details

### `index.html`

- `<link>` for Google Fonts: IBM Plex Sans, IBM Plex Mono, Newsreader
- `<link>` for `style.css`
- `<div id="app"></div>` mount point
- `<script src="app.js">` — no Supabase CDN

### `style.css`

```css
:root {
  --bg:           oklch(0.965 0.008 75);
  --accent:       oklch(0.56 0.10 45);
  --font-body:    'IBM Plex Sans', sans-serif;
  --font-mono:    'IBM Plex Mono', monospace;
  --font-heading: 'Newsreader', serif;
}
```

Base resets: `box-sizing: border-box`, zero margins, `body` uses `--bg` and `--font-body`.

### `app.js`

```js
const RENDER_API_URL = 'YOUR_RENDER_API_URL';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${RENDER_API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function navigate(screen, params = {}) {
  // expanded in Phase 2+
}
```

No Supabase client. No screens rendered yet.

---

## Verification

1. Open `index.html` directly in a browser (no server needed)
2. DevTools console shows no errors on load
3. Confirm no Supabase CDN script tag is present in the page source

---
---

# Plan: Phase 2 — Auth (Login Screen)

## Context

Phase 1 (foundation scaffolding) is complete: `index.html` has a single `<div id="app">` mount, `style.css` has Paper theme CSS tokens, and `app.js` has an `api()` Render-API helper and a placeholder `navigate()`. The next task is Phase 2 — building the login screen and wiring it to auth.

**Architecture clarification (resolved during planning):** CLAUDE.md/PRD describe the frontend loading the Supabase JS client directly, but tasks.md Phase 1 states "Render is the sole service that talks to Supabase directly," and the existing `api()` helper already routes everything through Render. Confirmed: **the frontend never talks to Supabase directly.** Login POSTs credentials to a Render endpoint; Render validates against Supabase Auth and returns a JWT; the frontend stores that JWT and sends it as a Bearer token on all subsequent Render calls (via the existing `api()` helper). No Supabase JS client or CDN script is added to the frontend.

This is a deviation from CLAUDE.md/PRD as currently written — flagged for a doc update in a follow-up (not part of this implementation task).

---

## What to Build

### Login screen UI
- Full-page centered card on the Paper background
- Monospace header: `Biology Dept · Cell Archive` (IBM Plex Mono, small, muted)
- App title: `Cell Archive` (Newsreader serif, large heading)
- Username and password inputs
- `Log in` button (accent color)
- Error message area (hidden until auth fails)

### Auth flow (all through Render)
- Login button → `api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })`
  - `api()` already skips the Authorization header when no token exists, so this works unmodified for the login call itself
- On success: response is expected as `{ token: '<jwt>' }` → `localStorage.setItem('token', token)` → `navigate('experiments')`
- On failure: `api()` already throws on non-OK responses; catch and display the error message in the error area
- On app load: if `localStorage.getItem('token')` is present, skip the login screen and go straight to `navigate('experiments')` (no server-side validation round trip in this phase — kept simple for prototype status)
- Logout: clear `localStorage.removeItem('token')`, `navigate('login')`

### `navigate()` expansion (minimal, to support post-login routing)
- `navigate('login')` → render login screen
- `navigate('experiments')` → render a stub: `<p>Experiments — coming in Phase 4</p>` plus a "Log out" link (minimal chrome; full nav comes in Phase 3)
- Replaces `#app` innerHTML on each call

### `api()` — no changes needed
The existing implementation already reads the token from `localStorage.getItem('token')` and conditionally attaches the Bearer header — this already matches the Render-only architecture, so it's reused as-is.

---

## Files Modified

| File | Change |
|---|---|
| `app.js` | Added login screen renderer, auth wiring (login submit + error handling), minimal `navigate()` for `login`/`experiments`, app-load session check, logout handler |
| `style.css` | Added login card styles (centered layout, inputs, button, error text) |
| `index.html` | No change needed (no Supabase CDN script required) |

---

## Open Items Flagged

- Phase 11 (Python API / Render) task list did not include a `/auth/login` endpoint — added it to `tasks.md` Phase 11 so the Render side actually implements the endpoint this frontend work assumes.
- CLAUDE.md/PRD's "Frontend (GitHub Pages)" sections describe a direct Supabase JS client that the team has decided not to use — still needs a doc update in a follow-up so it doesn't mislead future work.

---

## Verification

1. Opened `index.html` in headless Chrome — login screen renders with correct Paper theme fonts/colors (screenshot-verified)
2. Submitted credentials — `api('/auth/login', ...)` fails against the still-placeholder `RENDER_API_URL`, and the inline error message displays correctly
3. Pre-set `localStorage.token` and reloaded — skips straight to the experiments stub
4. Clicked "Log out" — clears the token and returns to the login screen
5. Probed empty-field submission — blocked by native `required` validation before `api()` is called

---
---

# Plan: Phase 3 — Core Navigation

## Context

Phases 1–2 are complete. The current app renders whole-screen `innerHTML` swaps via `navigate()`: a login screen (no chrome) and an experiments stub. Phase 3 introduces the persistent authenticated "shell" — top bar, sidebar drawer, subheader — that all later screens (Experiments → Conditions → Cells) live inside.

## The core design shift

Every screen currently replaces all of `#app`. Phase 3's chrome must *persist* across screens and be context-sensitive (breadcrumb, back button, primary action). So a small navigation-state object plus a **shell renderer** draws the chrome once and swaps only the content region.

---

## What to Build

### 1. Navigation state + router refactor (`app.js`)
- Add a `state` object: `{ screen, experiment, condition }` (experiment/condition hold id + name for breadcrumbs; null until Phase 4/5 populate them).
- Rework `navigate(screen, params)` to update `state`, then dispatch:
  - `login` → `renderLogin()` (unchanged, no shell)
  - authenticated screens → `renderShell()` then fill the content area with that screen's stub.
- Keep the boot check and logout as-is.

### 2. Top bar
- App title (`Cell Archive`, from a config constant so Phase 13's `appTitle`/`prototypeBadge` props slot in later), a "Prototype" badge, a hamburger button (left), and a user-avatar circle (right, initial derived from the stored token/username).
- Hamburger toggles the sidebar drawer.

### 3. Sidebar drawer
- Off-canvas panel with a translucent backdrop, `transform: translateX` slide-in animation.
- Links: Experiments, Graph, Raw Data, About, Help. Each calls `navigate(...)` to a **stub** screen and closes the drawer. Clicking the backdrop or Esc closes it.

### 4. Subheader (breadcrumb + context action)
- Breadcrumb built from `state`: `Experiments`, `Experiments / [Exp]`, `Experiments / [Exp] / [Condition]`.
- Right-aligned primary action button whose label/handler is context-sensitive (e.g. "Add experiment" on Experiments, "New slide" on Conditions). For Phase 3 these are wired to no-op stubs with the correct labels; real behavior comes with each screen's phase.

### 5. Back-button logic
- Back button appears in the subheader only on Conditions and Cells screens; pops one level up the hierarchy using `state` (Cells → Conditions → Experiments).

### 6. Styling (`style.css`)
- Add `.topbar`, `.badge`, `.avatar`, `.hamburger`, `.sidebar`/`.sidebar-backdrop` (slide transition), `.subheader`, `.breadcrumb`, `.primary-action`, `.back-btn`, and a `.content` wrapper — all using existing Paper tokens (mono for labels/breadcrumb, accent for the action button).
- Replace the temporary `.app-shell` stub styling with the real shell.

---

## Scope boundary

The Experiments/Graph/Raw Data/About/Help destinations remain **stubs** this phase — Phase 3 is only the chrome and navigation wiring. The stubs render inside the new shell so the breadcrumb, back button, and drawer are all demonstrably functional.

---

## Verification

Open `index.html`, log in (test account), then confirm: hamburger opens/closes the drawer (animation, backdrop, Esc); each sidebar link swaps content and updates the breadcrumb; the primary action button label changes per screen; the back button appears only inside Conditions/Cells and steps up correctly.

---

## Final step (per project convention)

After implementation: check Phase 3 items in `tasks.md`, append a Phase 3 entry to `activity.md`, and keep this plan in `plan.md`.

---
---

# Plan: Phase 4 — Experiments Screen

## Context

Phases 1–3 are complete. The authenticated shell (top bar, sidebar drawer, subheader with breadcrumb/back button/primary action) is in place. Every authenticated screen currently renders a stub via `screenStub()`. Phase 4 replaces the stub for the `experiments` screen with the real Experiments UI.

The current code structure to note:
- `renderShell(screen)` renders the chrome (top bar, subheader, sidebar) and puts stub content in `<main class="content">`
- `wireShell(screen)` wires chrome interactions; its primary-action handler is currently a no-op stub
- `navigate(screen, params)` calls `renderShell()` then nothing further — Phase 4 hooks in a screen-specific initializer after that call

All data goes through `api()` → Render API → Supabase. No direct Supabase calls.

---

## What to Build

### Layout

The experiments content area is a two-column layout:
- **Left:** scrollable grid of folder cards
- **Right:** detail panel — hidden until a card is selected

```
┌────────────────────────────┬────────────────────┐
│  [Card] [Card] [Card]      │  [Detail panel]    │
│  [Card] [Card]             │  Name, date, dye   │
│                            │  condition count   │
│                            │  notes             │
│                            │  [Open experiment] │
└────────────────────────────┴────────────────────┘
```

### Folder cards

Each card shows: experiment name (prominent), dye type, condition count ("N conditions"), and date. A selected card gets an accent-outlined/highlighted state. Cards have a folder-tab aesthetic using the Paper accent color.

### Interactions

- **Single click** on a card → mark card selected, populate detail panel (show if hidden)
- **Double click** on a card → `navigate('conditions', { experiment: { id, name } })`
- **"Open experiment" button** in detail panel → same navigation as double-click
- Clicking a card that's already selected → no change (detail panel stays open)

### Add Experiment modal

Triggered by the "Add experiment" primary action button (subheader). The modal has:
- Overlay backdrop
- Form fields: **Name** (text, required), **Date** (date, required), **Dye** (text), **Notes** (textarea)
- "Save" → `api('/experiments', { method: 'POST', body })` → close modal, reload experiments list
- "Cancel" → close without saving
- Dismiss by clicking backdrop

### Loading & error states

- Show a loading spinner/text inside `.content` while the fetch is in flight
- Show an error message if the API call fails (API not yet deployed; this is expected in dev)

---

## Implementation Details

### `app.js` — changes and additions

**1. `navigate()` — add initializer dispatch**
```js
function navigate(screen, params = {}) {
  // ... existing state update and login check ...
  renderShell(screen);
  if (screen === 'experiments') initExperiments();
}
```

**2. `wireShell()` — remove no-op primary-action stub**  
Delete the `if (action) action.addEventListener(...)` no-op stub at the bottom. Each screen now wires its own primary action in its initializer.

**3. `initExperiments()` — async screen initializer**  
- Sets `.content` to a loading state
- Calls `api('/experiments')` — expects `[{ id, name, date, dye, notes, condition_count }]`
- On success: renders the experiments layout and wires interactions
- On error: renders an error message

**4. `renderExperimentsHTML(experiments)` — returns HTML string**  
Builds the two-column layout. If `experiments` is empty, shows an "Add your first experiment" empty state in the left column. Detail panel starts hidden.

**5. `wireExperiments(experiments)` — wires card and panel interactions**  
- Single click → set `data-selected` on card, populate and show detail panel
- Double click → `navigate('conditions', { experiment: { id, name } })`
- "Open experiment" button in detail panel → same navigate call
- Primary action button (`#primary-action`) → `openAddExperimentModal(() => initExperiments())`

**6. `openAddExperimentModal(onSuccess)` — modal**  
- Appends modal HTML to `document.body` (so it layers over the shell)
- Form submit → `api('/experiments', POST)` → `removeModal()` → `onSuccess()`
- Cancel / backdrop click → `removeModal()`

### `style.css` — additions

- `.experiments-layout` — `display: flex; gap`; full height of `.content`
- `.folder-grid` — `flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap`; overflow-y scroll
- `.folder-card` — border, cursor pointer, folder-tab aesthetic (pseudo-element tab on top using accent color); hover lift; `&.selected` — accent border + background tint
- `.folder-tab`, `.folder-name`, `.folder-meta` — typography using mono for metadata
- `.detail-panel` — `width: 280px; flex-shrink: 0; display: none; &.visible { display: block }`; border-left, padding
- `.detail-label`, `.detail-value`, `.detail-open-btn` (accent button)
- `.modal-backdrop` — fixed overlay, `rgba(0,0,0,0.4)`
- `.modal` — centered card, Paper background, max-width 440px
- `.modal-header`, `.modal-field`, `.modal-actions` — standard form layout
- `.loading-state`, `.error-state`, `.empty-state` — inline feedback styles

---

## API Assumptions

`GET /experiments` returns:
```json
[{ "id": "uuid", "name": "...", "date": "2024-01-15", "dye": "BODIPY", "notes": "...", "condition_count": 3 }]
```

`POST /experiments` accepts:
```json
{ "name": "...", "date": "2024-01-15", "dye": "...", "notes": "..." }
```
Returns the created experiment object.

These are assumptions for the Render API (Phase 11). The frontend will degrade gracefully if the endpoint isn't deployed yet (shows error state).

---

## Scope

- Only the `experiments` screen is built this phase
- `navigate('conditions', ...)` still lands on the Phase 3 stub — real conditions screen is Phase 5
- No server-side pagination; all experiments loaded in one fetch for v1

---

## Files Modified

| File | Change |
|---|---|
| `app.js` | Add `initExperiments`, `renderExperimentsHTML`, `wireExperiments`, `openAddExperimentModal`; update `navigate()`; remove primary-action no-op stub from `wireShell()` |
| `style.css` | Add folder grid, card, detail panel, modal, and feedback state styles |
| `index.html` | No change |

---

## Verification

1. Log in → Experiments screen loads (loading state visible briefly, then grid or error state)
2. With API unavailable: error state renders cleanly; no JS errors in console
3. (When API available) Cards render with correct name/dye/date/condition count
4. Single-click → card highlights, detail panel appears with correct data
5. Double-click / "Open experiment" → navigates to Conditions stub with correct breadcrumb (`Experiments / [Name]`)
6. "Add experiment" button opens modal; Cancel closes it; Save POSTs and refreshes the grid
7. Back in the Conditions stub, back button returns to Experiments

---

# Plan: Phase 5 — Conditions Screen

## Context

Phase 4 is complete: Experiments screen has a two-column folder grid + detail panel, plus an Add Experiment modal, all wired through `initExperiments()` / `renderExperimentsHTML()` / `wireExperiments()` / `openAddExperimentModal()`. `navigate('conditions', { experiment })` currently lands on the Phase 3 `screenStub()`.

Phase 5 replaces that stub with the real Conditions screen, scoped to `state.experiment`. Cells (Phase 6) will need the identical two-column shell, so this phase also generalizes the shared layout/card/panel CSS instead of duplicating it a second time.

All data still goes through `api()` → Render API → Supabase; the Render API (`api/main.py`) currently only exposes `/` and `/cells`, so the real endpoints assumed below are not deployed yet — same "degrade to a clean error state" posture as Phase 4.

---

## What to Build

### Layout

Same two-column shell as Experiments: scrollable folder grid (left) + detail panel (right, hidden until a card is selected). Breadcrumb: `Experiments / [Experiment Name]`.

### Rename shared layout class

`.experiments-layout` → `.folder-layout` in `style.css`, updated in `renderExperimentsHTML()`. Purely a rename (no rule changes) so Conditions (and Phase 6 Cells) can reuse it without a second copy of the same three rules.

### Folder cards

Each card shows: condition name (prominent), dye, starvation length (e.g. "6 hr"), and cell count.

### Detail panel

- Condition name, dye, starvation length, cell count
- ICC value + quality label, using standard Koo & Li (2016) buckets:
  - `< 0.5` → Poor
  - `0.5–0.75` → Moderate
  - `0.75–0.9` → Good
  - `> 0.9` → Excellent
- Mini scatter chart (per PRD 5.3): **one column per condition in the current experiment** (not just the selected one) — dots are per-cell averages, a bar/line marks each condition's mean. This is a static preview; the interactive version with hover tooltips is Phase 9 (Graph screen).
- "Open condition" button → same navigation as double-click

### Add Condition modal

Triggered by the "New slide" primary action button. Fields: **Name** (text, required), **Dye** (text), **Starvation length** (number, hours), **Notes** (textarea). Save → POST → close modal → refresh grid. Same backdrop/cancel/dismiss behavior as the Add Experiment modal.

### Local test data

Extend the existing local-test-account pattern (`TEST_EXPERIMENTS`) with a `TEST_CONDITIONS` fixture, keyed by experiment id, each condition including a small set of fake per-cell averages — so the screen (grid, detail panel, ICC label, mini chart) is fully exercisable via the `local:` test-account token without the Render API deployed.

### Loading & error states

Same `.loading-state` / `.error-state` / `.empty-state` classes as Experiments.

---

## Implementation Details

### `app.js` — changes and additions

**1. `navigate()`** — add `if (screen === 'conditions') initConditions();`

**2. `initConditions()`** — async screen initializer
- Loading state in `.content`
- If local test token: read `TEST_CONDITIONS[state.experiment.id]`
- Else `api(`/experiments/${state.experiment.id}/conditions`)`
- On success: render + wire; on error: error state

**3. `renderConditionsHTML(conditions)`** — two-column layout using `.folder-layout`; empty state if no conditions

**4. `wireConditions(conditions)`**
- Single click → select card, populate detail panel (name/dye/starvation/cell count/ICC+label) and render the mini scatter chart (all conditions in the experiment, not just selected)
- Double click / "Open condition" → `navigate('cells', { condition: { id, name } })`
- Primary action (`#primary-action`) → `openAddConditionModal(() => initConditions())`

**5. `iccQualityLabel(icc)`** — returns `{ label, }` per the buckets above; handles `null`/undefined ICC (not enough counts yet) by returning "—"/no label

**6. `renderMiniScatterSVG(conditions)`** — builds an inline SVG string: one x-axis column per condition, per-cell average dots (small deterministic horizontal jitter so same-value dots don't fully overlap), a short horizontal tick/bar at each condition's mean height. Pure presentation helper, no interactivity.

**7. `openAddConditionModal(onSuccess)`** — mirrors `openAddExperimentModal`; POSTs `{ name, dye, starvation, notes }` to `/experiments/${state.experiment.id}/conditions`

### `style.css` — additions

- Rename `.experiments-layout` → `.folder-layout`
- `.mini-chart` container + SVG column/dot/mean-bar styles (reuse accent color for dots/bars)
- `.icc-value`, `.icc-label` (quality label as a small pill, color varies: muted for Poor/Moderate, accent for Good/Excellent)

---

## API Assumptions

```
GET /experiments/{id}/conditions
[{ "id": "uuid", "name": "...", "dye": "...", "starvation": 6, "notes": "...",
   "icc": 0.82, "cells": [{ "id": "uuid", "name": "...", "average": 4.3 }, ...] }]
```

```
POST /experiments/{id}/conditions
{ "name": "...", "dye": "...", "starvation": 6, "notes": "..." }
```
Returns the created condition object.

---

## Scope

- Only the `conditions` screen is built this phase
- `navigate('cells', ...)` still lands on the Phase 3 stub — real Cells screen is Phase 6
- Mini chart is static (no hover tooltip, no click-to-filter) — interactive Graph is Phase 9
- ICC thresholds are fixed client-side constants, not configurable

---

## Files Modified

| File | Change |
|---|---|
| `app.js` | Add `initConditions`, `renderConditionsHTML`, `wireConditions`, `iccQualityLabel`, `renderMiniScatterSVG`, `openAddConditionModal`, `TEST_CONDITIONS`; update `navigate()`; rename `.experiments-layout` usage to `.folder-layout` |
| `style.css` | Rename `.experiments-layout` → `.folder-layout`; add mini-chart and ICC label styles |
| `index.html` | No change |

---

## Verification

1. Log in with a local test account → Experiments → open the seeded experiment → Conditions grid loads from `TEST_CONDITIONS`
2. Cards show name, dye, starvation, cell count
3. Single-click → detail panel shows ICC value, correct quality label, and a mini chart with one column per condition
4. Double-click / "Open condition" → navigates to Cells stub with breadcrumb `Experiments / [Experiment] / [Condition]`
5. "New slide" → modal opens; Cancel closes it; Save posts and refreshes the grid (against local fixture or clean error state if hitting the real API)
6. Back button returns to Experiments
7. With API unavailable and no local token: clean error state, no console errors

---

## Final step (per project convention)

After implementation: check Phase 4 items in `tasks.md`, append a Phase 4 entry to `activity.md`.

---
---

# Plan: Phase 6 — Cells Screen

## Context

Phases 1–5 are complete. Conditions screen has the two-column `.folder-layout` grid + detail panel, an Add Condition modal, and a static mini scatter chart. `navigate('cells', { condition })` currently lands on the Phase 3 `screenStub()`.

Phase 6 replaces that stub with the real Cells screen, scoped to `state.condition`.

## Data model correction

CLAUDE.md/PRD are explicit that `cell.average` is derived from hand counts (`AVG(counts.value)`), never stored. The Phase 5 `TEST_CONDITIONS` fixture took a shortcut and hardcoded `average` directly on each cell. Cells needs real per-count data to list/delete individual counts, so this gets fixed at the source before building Cells:

- Add `cellAverage(cell)` — mean of `cell.counts[].value`, `null` if empty
- Update Phase 5's `conditionMean()` and `renderMiniScatterSVG()` to call `cellAverage(cell)` instead of reading `cell.average`, filtering out cells with no counts yet
- Change fixture cells to `counts: [{ id, value }, …]` (0–3 entries) instead of a flat `average` number; add a 4th cell to `0 Hr Starved` so all four states (0/1/2/3 counts) are exercisable in one condition

## What to build

- `initCells()` — async initializer mirroring `initConditions()`: local-test path reads `TEST_CONDITIONS[experiment].cells` scoped to `state.condition`, else `GET /conditions/{id}/cells`
- `renderCellsHTML()`/`wireCells()` — reuse `.folder-layout`; cards show a simulated thumbnail, name, and a status-tag pill via `cellCountStatus()` ("needs count" / "N counts")
- `renderCellThumbnailSVG(cell)` — deterministic inline-SVG placeholder (green droplets on dark rect), seeded by cell id via a small PRNG so it's stable across re-renders. Real image rendering is Phase 11's job
- Detail panel: prominent average, count list with × delete buttons, "Count" CTA only when `counts.length < 3`
- Delete-count: local mode mutates the fixture in place; API mode calls `DELETE /counts/{id}` first. No confirmation dialog — matches the rest of the prototype
- "Count" CTA → `navigate('count', { cell })`; "Add photos" → `navigate('addphotos')`. Both get minimal `SCREENS` entries (title only, no `back`/`action`) so they fall through to the generic stub — Phase 7/8 build the real destinations, which are likely full-screen layouts bypassing the shell entirely (like Login), so back-button wiring is deliberately deferred to those phases
- Add `state.cell`; `navigate()` accepts a `cell` param

## API assumptions (Render, Phase 11)

```
GET /conditions/{condition_id}/cells
  → [{ id, name, image_url, counts: [{ id, value, counted_by, created_at }] }]
DELETE /counts/{id}
```

## Scope boundaries

- No real image rendering — thumbnails stay simulated
- No delete-confirmation dialog on counts
- No drill-down double-click — Cells is a leaf screen

## Verification

Log in with a local test account → Experiments → seeded experiment → "0 Hr Starved" condition → Cells grid loads from the fixture; cards show correct thumbnail/status tag per state; selecting a cell shows average + count list + working × delete that live-updates the tag and average; Count CTA appears only under 3 counts; "Add photos"/"Count" navigate to stub screens cleanly; back button still returns to Conditions; API-unavailable path shows a clean error state.

## Final step (per project convention)

After implementation: check Phase 6 items in `tasks.md`, append a Phase 6 entry to `activity.md`.

---
---

# Plan: Phase 7 — Add Photos Screen

## Context

Phases 1–6 are complete: the authenticated shell, Experiments/Conditions/Cells screens all work against local test-account fixtures (`TEST_EXPERIMENTS`/`TEST_CONDITIONS` in [app.js](app.js)) and degrade to a clean error state when the real Render API isn't reachable (it isn't yet — [api/main.py](api/main.py) only has `/` and `/cells`).

The Cells screen's "Add photos" button already calls `navigate('addphotos')` ([app.js:989](app.js#L989)), which currently falls through to the generic `screenStub()`. Phase 7 replaces that stub with the real full-screen annotation tool from PRD §5.5.

**Real pipeline (confirmed with user):** when a `.tif` is selected, Render converts it to a contrast-normalized, false-color PNG immediately (a "preview" render, not yet tied to any cell). The user draws boxes over that PNG. On confirm, each box is a crop region — Render crops the PNG per box, uploads each crop to the `cell-images` bucket, and creates one `cells` row per box with `image_url` set (server-to-server, per [CLAUDE.md](CLAUDE.md) — the frontend never touches Supabase directly). None of this exists on the Render side yet (Phase 11), so this phase adds two new **assumed** endpoints — documented the same way Phases 4–6 documented their assumed endpoint shapes — and the local test-account path substitutes a simulated deterministic preview image (reusing the seeded-PRNG fluorescence pattern from `renderCellThumbnailSVG` in Phase 6) so the whole flow is exercisable without Render deployed.

Like Login, this screen is full-screen and bypasses the standard shell chrome (top bar/sidebar/breadcrumb) — Phase 6's activity log already flagged this as the expected shape for Phase 7/8.

---

## What to build (`app.js`)

### Routing
- `navigate()`: add `if (screen === 'addphotos') return renderAddPhotos();` alongside the existing `login` bypass, before the `renderShell()` path. `addphotos` stays in `SCREENS` only for its title metadata (unused once it bypasses the shell) — no functional change needed there.

### Screen-local state
A plain object, reset each time `renderAddPhotos()` runs (not part of the persistent `state`, same lifetime rule as e.g. modal-local state elsewhere):
```js
{
  files: [ { id, name, status: 'loading'|'ready'|'error', previewSvg, boxes: [{ id, x, y, w, h }] } ],
  activeFileId: null,
}
```
`x/y/w/h` are percentages (0–100) of the canvas frame — resolution-independent, and Render can convert percentage rects to pixel rects itself once it knows the source image dimensions.

### Empty state → file picker
Hidden `<input type="file" multiple accept=".tif,.tiff">` triggered by a "Choose .tif files" button when `files.length === 0`. A smaller "Add files" affordance in the sidebar header appends more files later (appends to `files`, doesn't replace).

### Per-file preview render (on file add)
- Local test token: synthesize immediately (no network) — new helper `renderPhotoPreviewSVG(name)` mirrors `renderCellThumbnailSVG`'s `seededRandom(hashStringToInt(...))` pattern but seeded by filename, sized for a full-frame canvas rather than a small thumbnail. Mark `status: 'ready'` synchronously.
- Real token: `status: 'loading'` first (sidebar shows a loading placeholder), then POST the raw file to `/conditions/{condition_id}/tif-preview` (multipart) → `{ preview_url }`. This bypasses the existing `api()` helper (it always sends `Content-Type: application/json` + `JSON.stringify`), so this needs a small dedicated fetch that still attaches the Bearer token from `localStorage`. On failure, `status: 'error'` and the sidebar/canvas show an inline "Could not render preview" message for that file only — other files are unaffected.

### Sidebar
Thumbnail list: each entry shows the filename, a small preview swatch (or loading/error indicator), and `${boxes.length} box(es)`. Clicking an entry sets `activeFileId` and re-renders the canvas.

### Canvas
- `.canvas-frame` holds the active file's preview (SVG or `<img>`) plus one absolutely-positioned `.photo-box` div per box (positioned via the percentage coordinates).
- Click on the frame background (not on a box or its handle) → compute click position as a percentage of frame width/height, push a new box centered there (default ~20% × 20%, clamped so it stays inside 0–100), re-render.
- Each `.photo-box` has: a numbered label (position in that file's `boxes` array, 1-based — renumbered whenever a box is removed), a drag handle (the box body — mousedown starts a drag, tracked via document-level `mousemove`/`mouseup` listeners that are attached on drag-start and removed on drag-end, same cleanup discipline as the existing `escHandler` pattern in `wireShell`), a resize handle (bottom-right corner, `stopPropagation` so it doesn't also trigger the parent's drag), and a `×` remove button.
- Dragging/resizing clamps the box within the 0–100 frame bounds and enforces a minimum size (~5%).
- Removing a box splices it out and renumbers the remaining boxes in that file.

### Top bar (screen-specific, not the shared `subheaderHTML`)
- Left: condition name (`state.condition.name`) + short instruction text ("Click anywhere to box a cell").
- Right: "Cancel" (→ `navigate('cells')`, discarding all screen-local state) and "Create N cells" where N is the live total (`files.flatMap(f => f.boxes).length`), disabled when N is 0.

### Confirm ("Create N cells")
- Local test token: for each file, for each box, push a new cell into `TEST_CONDITIONS[experiment][condition].cells` — `{ id: crypto.randomUUID()-style local id, name: 'Cell ' + nextNumber, counts: [] }`, continuing the numbering from `cond.cells.length`. No network calls. Then `navigate('cells')`.
- Real token: per file with boxes, POST to `/conditions/{condition_id}/cells/from-tif` (multipart: original file + `boxes` JSON array of the percentage rects) → creates one `cells` row per box server-side with a cropped `image_url`. Same dedicated-fetch-with-auth-header approach as the preview call. On success for every file, `navigate('cells')`. On any failure, show an inline error banner and keep the user on the screen (don't discard their annotation work).

---

## Styling (`style.css`)

New rules, namespaced `.addphotos-*` (or similarly scoped), reusing existing tokens (`--accent`, `--font-mono`, `--font-heading`) and the same visual language as the modal/detail-panel components already in the sheet:
- Full-viewport layout: custom top bar, left sidebar (file list), main canvas area — no `.shell`/`.sidebar`/`.topbar` reuse since this bypasses the authenticated chrome.
- `.photo-box` (dashed accent border, semi-transparent fill), `.photo-box-label`, `.photo-box-handle` (corner resize grip), `.photo-box-remove` (× button, top-right of the box).
- Loading/error swatch states for sidebar thumbnails, matching the existing `.loading-state`/`.error-state` visual tone.

---

## Documentation updates (per project convention)

- `docs/tasks.md`: check off all Phase 7 items.
- `docs/activity.md`: append a Phase 7 entry — new functions added, the two new assumed Render endpoints (`POST /conditions/{id}/tif-preview`, `POST /conditions/{id}/cells/from-tif`) and their shapes, and the same "not verified in an actual browser" caveat prior phases used if applicable.
- `docs/plan.md`: append this plan.

---

## Scope boundaries

- No real `.tif` decoding in the browser — previews are simulated for local test accounts; real accounts call the (not-yet-deployed) Render preview endpoint and show a clean per-file error if it's unreachable.
- Cropping/PNG storage/cell-row creation happens server-side in Render (Phase 11's job) — the frontend only sends percentage-based box rects, never manipulates image pixels itself.
- No drag-select multi-box or copy/paste — one box per click, matching PRD §5.5 exactly.

---

## Verification

1. Log in with a local test account → Experiments → seeded experiment → a condition → Cells → "Add photos".
2. Choose 2+ arbitrary files (content is irrelevant since only filename seeds the simulated preview) → sidebar lists both immediately with a simulated preview and "0 boxes".
3. On file 1's canvas, click three times → three numbered, draggable, resizable boxes appear; sidebar count updates to "3 boxes".
4. Drag a box and resize it via the corner handle → both persist visually.
5. Remove the middle box via × → remaining boxes renumber 1, 2.
6. Switch to file 2 in the sidebar → canvas swaps to file 2's (empty) boxes; switching back to file 1 shows its boxes preserved.
7. "Create N cells" label reflects the live total across both files; with 0 total boxes it's disabled.
8. Click "Create N cells" → new cells appear in the Cells grid with "needs count" status; "Cancel" instead discards everything and returns to Cells unchanged.
