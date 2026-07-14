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

---
---

# Plan: Phase 8 — Count Screen

## Context

Phases 1–7 are complete. The Cells screen's "Count" CTA already calls `navigate('count', { cell: { id, name } })` ([app.js:937](app.js#L937)), which fell through to the generic `screenStub()` since `count` had no special case in `navigate()`. Phase 8 replaces that stub with the real full-screen counting interface from PRD §5.6.

This screen is structurally the closest sibling to Phase 7's Add Photos screen: both are full-screen, bypass the authenticated shell (like Login), hold their own screen-local state object reset on mount, and render a simulated-vs-real image in a `.canvas-frame`. The plan reuses that machinery directly:

- `renderPhotoPreviewSVG(seed)` already takes an arbitrary string and returns a deterministic dark fluorescence-frame SVG — called with `cell.id` as the seed, giving the Count screen a "processed image" placeholder for local test accounts.
- `.canvas-frame` / `.photo-preview-svg` / `.photo-preview-img` are already dark-styled and generic — reused as-is.
- `genLocalId()`, `clamp()`, `escHtml()`, `api()`, and the `refreshX()` full-re-render-on-mutate convention all carry over unchanged.

One real difference from Add Photos: markers are placed **and removed by clicking**, not dragged/resized — PRD 5.6 only calls for a numbered dot, not a resizable box. Simpler than Phase 7's box interactions.

## What was built (`app.js`)

- `navigate()` special-cases `count` alongside `login`/`addphotos`: `renderCount()` replaces `#app` entirely, bypassing the shell.
- The Cells "Count" CTA now passes `image_url` through in the `navigate('count', { cell })` call, so real cells can eventually show their actual processed image once Phase 11 populates it; local test cells fall back to the simulated SVG.
- `countState` — screen-local `{ cell, markers: [{ id, x, y }] }`, reset every `renderCount()` mount (same lifetime convention as `addPhotosState`). Marker `x`/`y` are 0–100 percentages marking the marker's **center** (`transform: translate(-50%, -50%)`), unlike `photo-box`'s top-left anchor.
- `renderCountHTML()` / `wireCount()` / `refreshCount()` — dark top bar (cell name, "Total: N", Cancel/Done) plus the canvas frame; reuses `renderPhotoPreviewSVG(cell.id)` and the existing `.canvas-frame`/`.photo-preview-*` classes unchanged.
- `addMarkerAt()` / `removeMarker()` — click the frame background to add a numbered marker at the click point; click an existing marker (`stopPropagation`) to remove it. Markers renumber contiguously by array position on removal, same convention as box renumbering.
- `finishCount()` — value is `countState.markers.length`. Local test token mutates the real fixture cell (found via `TEST_CONDITIONS[experiment][condition].cells`) by pushing `{ id, value }` onto `counts`; real token POSTs to the new assumed `POST /cells/{id}/counts`. Either way, success navigates back to Cells. On failure, an inline error shows and the user stays on-screen with markers intact (same convention as `confirmAddPhotos`).
- Unlike Add Photos' "Create N cells" (disabled at 0 boxes), **Done stays enabled at 0 markers** — a hand count of zero lipid droplets is a legitimate scientific measurement, not a meaningless no-op.
- `style.css` — added `.count-screen`/`.count-topbar`/`.count-cell-name`/`.count-total`/`.count-topbar-actions`/`.count-error`/`.count-canvas`/`.count-marker`, plus a **new dedicated** `.count-cancel-btn` ghost-button style rather than reusing `.modal-cancel` (which hard-codes a near-white hover background with `color: inherit` — would repeat the exact invisible-content bug from the Phase 7 refinement if reused on this dark screen).

## API assumption (Render, Phase 11 — new)

```
POST /cells/{cell_id}/counts
  body: { value: number }
  → creates a counts row (cell_id, value, counted_by from auth context, created_at default)
  → returns the created count object
```

## Verification

Screenshot- and DOM-verified via a temporary headless-Chrome harness (`_verify_count.html`, removed after use) served over a local `python -m http.server`, driving `navigate()`/`state`/`countState` directly as globals to reach the Count screen deterministically, then dispatching synthetic `MouseEvent`s on `#count-frame` at known percentage coordinates:

1. Screenshot of the empty screen — dark background, visible cell name, "Total: 0", visible Cancel/Done buttons, visible simulated fluorescence frame (no invisible-on-dark elements, the specific failure mode from the Phase 7 refinement).
2. Screenshot after 3 synthetic frame clicks — three correctly-positioned, numbered markers; "Total: 3".
3. Screenshot after removing marker #2 — remaining markers renumber to 1, 2; "Total: 2"; confirmed (via DOM) the removal click did not also place a new marker underneath.
4. DOM dump after Done with 3 markers — navigated back to Cells; Cell 1's status tag reads "1 count".
5. DOM dump after Done with 0 markers — status tag still reads "1 count" (a value-0 count was saved), confirming Done is not disabled at zero.
6. DOM dump after Cancel with markers placed — status tag stays "needs count" (nothing saved).
7. DOM dump with a non-local token and Done clicked against the real (unreachable in this environment) Render API — inline error "Could not save count. Check the API connection." shown, screen stays on `count`, Done button re-enabled with its original label.

---
---

# Plan: Phase 9 — Graph Screen

## Context

Phases 1–8 are complete. `SCREENS.graph = { title: 'Graph' }` currently falls through to the generic `screenStub()` inside the authenticated shell — Graph is a top-level sidebar destination (no back button, no subheader primary action), unlike Conditions/Cells. Phase 9 replaces that stub with the real interactive scatter from PRD §5.7.

Unlike Conditions' static per-experiment mini chart ([app.js:557](app.js#L557) `renderMiniScatterSVG`), Graph lets the user assemble a comparison **across experiments**: pick any Experiment + Condition pair and add it to the plot, one column per condition, dots colored by which experiment the condition came from. That "color by series" requirement plus a hover tooltip pushes this past what the mini chart's single-accent-color treatment can do, so this phase consulted the `dataviz` skill for the categorical color and interaction rules rather than improvising them.

All data still loads through the same two endpoints already assumed by Conditions (Phase 5): `GET /experiments` and `GET /experiments/{id}/conditions` (which already returns each condition's `cells` with `counts`). No new Render endpoints needed — Graph is read-only.

---

## Color-by-series design (from the `dataviz` skill)

- **Series = experiment**, not condition — a column is one condition; its dots take the color of the experiment that condition belongs to, so mixing conditions from two experiments reads as two colors while conditions from the same experiment stay visually grouped.
- **If everything currently selected belongs to a single experiment, use the existing `--accent` color and show no legend** — same treatment as the Conditions mini-chart, and matches the skill's "a single series needs no legend box" rule.
- **As soon as a second experiment is added, switch to the categorical palette** from `references/palette.md`: slots assigned in fixed first-seen order (first experiment added → slot 1 blue, second → slot 2 aqua, …), never reassigned/recycled as items are removed and re-added within the same session. A legend row (swatch + experiment name) appears above the chart whenever ≥ 2 experiments are represented.
- **Column labels double as direct labels** (PRD already calls for "condition names and experiment labels below each column"), so identity is never carried by color alone even before the legend renders — satisfies the skill's redundant-encoding rule.
- Mean tick per column is stroked in that column's series color (bolder weight) rather than the neutral dark tick the mini-chart uses, so it still reads correctly once multiple series share one plot.
- **Table view requirement:** the skill calls for an accessible table alternative to any chart. Phase 10 (Raw Data) is exactly that table (all cells, all experiments/conditions, hand counts, average) — Graph doesn't need its own inline table, it relies on Raw Data as the existing alternative view.
- **Before finalizing hex values:** run `scripts/validate_palette.js` against the app's actual Paper background (`oklch(0.965 0.008 75)`, converted to hex) rather than the skill's default `#fcfcfb` surface, since the two aren't identical. Fix any slot that fails at that surface before wiring it into CSS.
- No dark-mode variant needed yet — Paper/Sage are swapped via a runtime prop (Phase 13), not an OS `prefers-color-scheme` toggle, and Sage isn't implemented yet.

---

## What to Build

### Sidebar (`.graph-sidebar`)
- Experiment `<select>` — populated from all experiments (first `<select>` element in the codebase; existing modals only use text/date/textarea inputs)
- Condition `<select>` — populated from the chosen experiment's conditions; disabled/empty until an experiment is picked. First option is **"All conditions"** (a sentinel value, not a real condition id), followed by each individual condition by name
- Single "Add to graph" button — reads the condition select's value: the `All conditions` sentinel adds every not-yet-added condition belonging to the chosen experiment in one click; any other value adds just that one condition (deduped by id)
- Selected-conditions list below the button: each row shows `[Experiment] › [Condition]` plus a `×` remove button; removing drops that condition from the plot (and its legend entry, if it was the last condition from that experiment)

### Main area (`.graph-main`)
- Title: "Lipid droplet counts by condition"
- **Empty state** ("No data — add a condition from the sidebar to begin.") when nothing is selected yet
- Otherwise: optional legend row (only when ≥ 2 experiments represented), then the scatter SVG — one column per selected condition in the order added, per-cell average dots, condition-mean tick per column, x-axis labels (condition name + experiment name), y-axis gridlines/ticks labeled "Lipid droplets / cell"
- Hover tooltip on any dot: experiment, condition, cell name, hand counts (e.g. "6, 6, 7"), average

---

## Implementation Details (`app.js`)

1. **`navigate()`** — add `if (screen === 'graph') initGraph();`
2. **`graphState`** — screen-local state, reset each `initGraph()` mount (same lifetime convention as `addPhotosState`/`countState`): `{ experiments: [], conditionsCache: {}, selectedExperimentId: null, selected: [] }`. `selected` is an array of `{ conditionId, conditionName, experimentId, experimentName, cells }`.
3. **`initGraph()`** — loading state in `.content`; loads experiments (local test token → `TEST_EXPERIMENTS`, else `api('/experiments')`); on success renders the sidebar + empty chart area and wires it; on failure renders `.error-state` (same pattern as `initConditions`/`initCells`).
4. **`renderGraphHTML(experiments)`** — `.graph-layout` wrapping `.graph-sidebar` (selects, buttons, selected list) and `.graph-main` (title + `#graph-chart-area` placeholder).
5. **`wireGraph(experiments)`**:
   - Experiment select `change` → fetch/cache that experiment's conditions (local test token → `TEST_CONDITIONS[id]`, else `api('/experiments/{id}/conditions')`, cached in `graphState.conditionsCache` to avoid refetching) → populate condition select with the `All conditions` sentinel option first, then each condition by id
   - "Add to graph" → reads the condition select's value: if it's the `All conditions` sentinel, push every condition of the chosen experiment not already in `graphState.selected`; otherwise push just the chosen condition (with parent experiment name/id) if not already present → re-render selected list + chart
   - Selected-list `×` → splice that entry out of `graphState.selected` → re-render
6. **`seriesColorForExperiment(experimentId)`** — looks up (or assigns, on first sight, in encounter order) a stable palette slot per experiment id; returns `--accent` directly when only one distinct experiment is currently selected.
7. **`renderGraphChartArea()`** — empty-state markup if `selected.length === 0`; else legend markup (only if > 1 distinct experiment) + `renderGraphScatterSVG(graphState.selected)`.
8. **`renderGraphScatterSVG(selected)`** — larger fluid SVG (viewBox sized for the wider `.graph-main` column, unlike the mini chart's fixed 240×120); one column per selected condition; per-cell dots carry `data-experiment`, `data-condition`, `data-cell`, `data-counts`, `data-average` attributes (read straight off the DOM by the tooltip handler instead of a parallel lookup table); mean tick per column; axis/gridlines; condition+experiment labels beneath each column. Reuses `cellAverage()`, `conditionMean()`, `escHtml()`, `truncateLabel()` as-is.
9. **`wireGraphTooltip()`** — one delegated `mouseover`/`mousemove`/`mouseout` listener on the chart container targeting `.graph-dot`, positioning a single shared `#graph-tooltip` div (appended once, `pointer-events: none` so it can't itself trigger `mouseout`) and filling it from the hovered dot's `data-*` attributes.

### Local test data
Add a second `TEST_EXPERIMENTS` entry with a small matching `TEST_CONDITIONS` fixture (1–2 conditions, a handful of cells) — purely so the multi-experiment color/legend path is exercisable via the local test account, same precedent as Phase 6 extending fixtures to hit new UI states. Kept intentionally small, not a full parallel dataset.

### `style.css` additions
- Eight categorical CSS custom properties (`--series-1` … `--series-8`) in `:root`, values from the dataviz skill's validated palette (re-checked against the Paper background per above)
- `.graph-layout`, `.graph-sidebar` (fixed width, like `.detail-panel`), `.graph-select`, `.graph-add-btn` (single button), `.graph-selected-list`, `.graph-selected-item` (+ remove ×)
- `.graph-main`, `.graph-chart-title`, `.graph-legend`, `.graph-legend-swatch`
- `.graph-scatter-svg`, `.graph-dot`, `.graph-mean-tick`, `.graph-gridline`, `.graph-axis-label`, `.graph-col-label`, `.graph-col-sublabel`
- `.graph-tooltip` — fixed-position floating card, mono font, small shadow/border, `pointer-events: none`

---

## API Assumptions

No new endpoints. Reuses the Phase 5 assumptions:
```
GET /experiments
GET /experiments/{id}/conditions
  → [{ id, name, dye, starvation, notes, icc,
       cells: [{ id, name, counts: [{ id, value, counted_by, created_at }] }] }]
```

---

## Scope boundaries

- No inline data table on this screen — Raw Data (Phase 10) is the accessible table alternative the `dataviz` skill calls for
- No persistence of the selected-conditions list across navigation away from Graph — resets on each visit, consistent with how Experiments/Conditions/Cells lose their card selection on remount
- Palette caps at 8 distinct experiment colors (the categorical palette's fixed slot count); a 9th distinct experiment in one graph is an edge case not handled specially in this phase

---

## Files Modified

| File | Change |
|---|---|
| `app.js` | Add `initGraph`, `renderGraphHTML`, `wireGraph`, `seriesColorForExperiment`, `renderGraphChartArea`, `renderGraphScatterSVG`, `wireGraphTooltip`; extend `TEST_EXPERIMENTS`/`TEST_CONDITIONS` with a second experiment fixture; update `navigate()` |
| `style.css` | Add categorical color custom properties, `.graph-*` layout/sidebar/chart/tooltip styles |
| `index.html` | No change |

---

## Verification

1. Log in with a local test account → Graph → empty state shown before anything is added
2. Pick Experiment A + a condition → "Add to graph" → single column appears, dots in `--accent` color, no legend
3. Select "All conditions" for Experiment A → "Add to graph" → remaining conditions' columns appear
4. Pick Experiment B (the new fixture) + a condition → "Add to graph" → a second color appears, legend row now shows both experiment names/swatches
5. Hover a dot → tooltip shows correct experiment, condition, cell name, hand counts, and average
6. Remove Experiment B's condition via the selected-list × → its column disappears and the legend reverts to no-legend/single-accent state
7. With API unavailable and no local token → clean `.error-state`, no console errors

---

## Final step (per project convention)

After implementation: check Phase 9 items in `docs/tasks.md`, append a Phase 9 entry to `docs/activity.md`.

---
---

# Plan: Phase 10 — Raw Data Screen

## Context

Phases 1–9 are complete. `SCREENS.rawdata = { title: 'Raw data' }` (no `action`/`back`, same shape as `graph`) currently falls through to the generic `screenStub()`. It's a top-level sidebar destination like Graph — no back button, no subheader primary action. PRD §5.8 wants a flat table: Experiment, Condition, Cell, Count 1, Count 2, Count 3, Average (average in accent color). This is the first `<table>` in the codebase.

No new Render endpoints needed — reuses the same data Graph (Phase 9) already assumes (`GET /experiments`, `GET /experiments/{id}/conditions`, each condition already carrying `cells: [{ id, name, counts }]`). Difference from Graph: Raw Data needs **every** experiment's conditions up front (a full cross-join, not user-selected), so real-API mode fans out with `Promise.all` across all experiments' condition fetches instead of fetching one at a time.

**Scope addition (user request during planning):** sorting and a filter, beyond what PRD §5.8 literally specifies.

## What to build (`app.js`)

- `navigate()` — add `if (screen === 'rawdata') initRawData();`
- `initRawData()` — loading state; local-test token flattens `TEST_EXPERIMENTS` × `TEST_CONDITIONS[expId]` × `cond.cells` directly; real token calls `api('/experiments')` then `Promise.all` over `api('/experiments/{id}/conditions')` per experiment, then flattens the same way; error state on failure (same convention as `initGraph`/`initConditions`)
- `rawDataState = { rows, sortKey, sortDir, filterText }` — screen-local, reset each mount
- `renderRawDataHTML()` / `renderRawDataRowsHTML()` / `renderRawDataHeaderCellHTML()` — filter input + sticky-header `<table>`; missing counts render `—`; average wrapped in `<span class="rawdata-average">` (accent color) when present; two empty-state messages (no data at all vs. no rows match filter)
- `visibleRawDataRows()` — pure derivation: live filter (case-insensitive substring across experiment/condition/cell name) then sort; doesn't mutate `rows`
- Sorting: click a `<th>` (or Enter/Space when focused, `role="button" tabindex="0"` — same convention as the folder-card grids) toggles asc → desc on repeat clicks of the same column, resets to asc on a new column; text columns via `localeCompare`, numeric columns (count1/2/3/average) numerically; **missing values always sort to the bottom regardless of direction**
- `refreshRawDataTable()` re-renders only the `<tbody>` + header arrows on every filter keystroke or header click — minimal-region re-render, same convention as `refreshGraphChartArea()`

## Styling (`style.css`)

New `.rawdata-*` rules: `.rawdata-filter` (reuses existing input styling), `.rawdata-table-wrap`/`.rawdata-table` (sticky header, zebra striping; mono font reserved for the numeric count/average columns, name columns use default body font matching `.detail-value`), `.rawdata-th-sortable` (hover tint, focus outline), `.rawdata-average`, `.rawdata-empty`.

## Scope boundaries

No CSV export (out of scope per PRD §11/Future), no per-column filter dropdowns (one free-text filter across the three name columns), no pagination — all rows render in one table.

## Verification

Screenshot-verified (not just a DOM dump, per the standing Phase 7 lesson) via a temporary headless-Chrome harness: all 15 fixture cells render correctly with `—` for missing counts; clicking the Average header twice sorts descending with the one null-average row correctly pinned to the bottom rather than jumping to the top; typing "Starved" into the filter narrows to only the Serum Starvation Timecourse rows while preserving the active sort.

## Final step (per project convention)

After implementation: check Phase 10 items in `docs/tasks.md`, append a Phase 10 entry to `docs/activity.md`, append this plan to `docs/plan.md`.

---
---

# Plan: Phase 11a — Render API: Auth + Core CRUD Endpoints

## Context

The frontend (Phases 1–10, `app.js`) is fully built against a set of **assumed** Render API endpoint shapes documented incrementally in this file as each screen was built. Every screen already degrades gracefully (clean `.error-state`) when those endpoints aren't reachable, and a `local:` test-account path (`docs/test-accounts.json`) fully exercises the UI without the API.

`api/main.py` currently only has a health check and an unscoped `GET /cells` smoke-test endpoint. `docs/tasks.md` Phase 11 lists 7 unchecked items, but that list — written before Phases 4–10 were built — only covers auth, the `.tif` image pipeline, counts, and ICC. It's missing the plain CRUD reads/writes for experiments/conditions/cells that Phases 4–6 already assumed and documented above. This task closes that gap: implement auth plus every non-image CRUD endpoint, so a real (non-`local:`) Supabase Auth account can log in and use the full workflow *except* uploading `.tif` photos and viewing computed ICC (those need `tifffile`/`Pillow`/`pingouin` image work and are a distinctly different, larger task — left for a follow-up).

Confirmed with user before writing this plan:
- The `experiments`/`conditions`/`cells`/`counts` tables and their RLS policies already exist in Supabase (created via the dashboard) — this task only writes application code, no schema/migration work.
- Data must be scoped per-researcher: since Render uses the **service-role key** (bypasses RLS per CLAUDE.md), the API itself must filter every read/write by the authenticated user's id.
- The login form's "Username" field is a Supabase Auth **email** (PRD §8.3 already states this) — `POST /auth/login` calls `supabase.auth.sign_in_with_password({"email": username, "password": password})`.

## Exact endpoint shapes the frontend already assumes

Traced directly from `app.js` call sites (line numbers as of Phase 11a):

| Endpoint | Called at | Request | Response shape expected |
|---|---|---|---|
| `POST /auth/login` | app.js:116 | `{ username, password }` | `{ token }` — stored raw in `localStorage`, sent back as `Authorization: Bearer <token>` |
| `GET /experiments` | app.js:394 | — | `[{ id, name, date, dye, notes, condition_count }]` |
| `POST /experiments` | app.js:542 | `{ name, date, dye, notes }` | any 2xx JSON (frontend refetches via `initExperiments()`, doesn't use the response body) |
| `GET /experiments/{id}/conditions` | app.js:648 | — | `[{ id, name, dye, starvation, notes, icc, cells: [{ id, name, image_url, counts: [{ id, value, counted_by, created_at }] }] }]` |
| `POST /experiments/{id}/conditions` | app.js:807 | `{ name, dye, starvation, notes }` | any 2xx JSON (frontend refetches) |
| `GET /conditions/{id}/cells` | app.js:889 | — | `[{ id, name, image_url, counts: [{ id, value, counted_by, created_at }] }]` |
| `DELETE /counts/{id}` | app.js:993 | — | any 2xx (body ignored) |
| `POST /cells/{id}/counts` | app.js:1468 | `{ value }` | any 2xx JSON (frontend only reads it to detect failure; see note below) |

Note: `finishCount()` at app.js:1468 doesn't destructure the response — it just awaits success/failure — so the exact returned shape isn't load-bearing, but the API still returns the full created row per tasks.md's stated intent (`cell_id`, `value`, `counted_by`, `created_at`).

All of these already go through the existing `api()` helper (`app.js:4`), which sends `Content-Type: application/json` and `Authorization: Bearer <token>` when a token is present, and throws on any non-2xx status — so error responses just need a non-2xx code; exact error body format isn't consumed by the frontend today.

## Design

### 1. Auth dependency (`api/main.py`)

A FastAPI dependency `get_current_user(authorization: str = Header(None))`:
- Extracts the bearer token, 401s if missing/malformed.
- Calls `supabase.auth.get_user(token)` (gotrue's `get_user` takes the JWT as an explicit argument, so it's safe to call on the shared service-role client — it doesn't touch that client's own session state). Returns the Supabase user (`.id`, `.email`). 401s if invalid/expired.

Used as a `Depends(get_current_user)` on every route below except `/` and `/auth/login`.

### 2. Ownership helpers

Since the service-role key bypasses RLS, application code must enforce "only your own experiment tree" manually. Small chain-lookup helpers, each raising `HTTPException(404)` if the row doesn't exist or isn't owned by `user_id` (404, not 403 — don't reveal existence of other researchers' data):

- `owned_experiment(experiment_id, user_id)` — `experiments.select("*").eq("id", ...).eq("created_by", user_id).single()`
- `owned_condition(condition_id, user_id)` — fetch condition, then verify its `experiment_id` via `owned_experiment`
- `owned_cell(cell_id, user_id)` — fetch cell, then verify its `condition_id` via `owned_condition`

`counts` DELETE needs the owning cell: fetch the count row for its `cell_id`, then `owned_cell`.

This is a few extra round-trips per request but keeps each query simple and easy to verify — appropriate for prototype scale (a college research tool, not high-throughput).

### 3. Routes to add, in `api/main.py`

```
POST   /auth/login
GET    /experiments
POST   /experiments
GET    /experiments/{id}/conditions
POST   /experiments/{id}/conditions
GET    /conditions/{id}/cells
POST   /cells/{id}/counts
DELETE /counts/{id}
```

Pydantic request models: `LoginBody`, `ExperimentBody`, `ConditionBody`, `CountBody` — one field set each, matching the tables in the exact shapes above.

**`GET /experiments`** — `condition_count` via PostgREST embedded count: `.select("*, conditions(count)")`, then flatten `row["conditions"][0]["count"]` into `condition_count` in the response (frontend wants a flat integer field, not the nested PostgREST shape).

**`GET /experiments/{id}/conditions`** — after ownership check, one nested select pulls the whole subtree in a single query: `.table("conditions").select("*, cells(*, counts(*))").eq("experiment_id", id)`. This matches the shape Phase 5/6 already assumed.

**`GET /conditions/{id}/cells`** — same pattern: `.table("cells").select("*, counts(*)").eq("condition_id", id)`.

**`POST /experiments`** — insert with `created_by = user.id` (this is what makes per-researcher scoping possible at all — every later ownership check hinges on this column being set correctly on creation).

**`POST /cells/{id}/counts`** — insert `{ cell_id, value, counted_by: user.id }` (`created_at` has a DB default per CLAUDE.md's schema).

### 4. `GET /cells` placeholder

Per `docs/activity.md`'s own note, this was a first smoke-test endpoint that doesn't match any shape the frontend assumes. Removed — `GET /conditions/{id}/cells` replaces it.

### 5. What's explicitly NOT in this task

- `POST /conditions/{id}/tif-preview`, `POST /conditions/{id}/cells/from-tif` — image rendering pipeline (`tifffile`/`Pillow`, LUT, cropping, Supabase Storage upload). Separate follow-up task.
- ICC computation (`pingouin`) and writing `conditions.icc`. Separate follow-up task (depends on having real counts flowing in first, which this task provides).
- Tightening CORS `allow_origins` — flagged in-file already, unrelated to this task's scope.

## Files Modified

| File | Change |
|---|---|
| `api/main.py` | Add `get_current_user` dependency, ownership helpers, Pydantic request models, and the 8 routes above; remove the placeholder `GET /cells` |
| `api/requirements.txt` | No change expected — `supabase` client already covers `.auth.get_user()` |
| `docs/tasks.md` | Check off the Phase 11 items this covers; add the previously-missing CRUD endpoint line items (flagged as an oversight, same as the Phase 2 plan did for `/auth/login`) so tasks.md matches what's actually assumed/built |
| `docs/activity.md` | Append a Phase 11a entry: endpoints added, ownership-scoping approach, what's still stubbed (image pipeline + ICC) |

## Verification

No Supabase credentials are available in the dev environment (`api/.env` is gitignored and not present locally), so this can't be run end-to-end against the real project outside the deployed service. Verification plan:

1. **Local smoke test without live credentials**: run `python -m py_compile api/main.py` (or import it with dummy `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env vars set to placeholder strings) to confirm the app boots and every route registers, catching syntax/import errors before pushing.
2. **Manual end-to-end check against the real deployment** (needs the user, since it requires real Supabase Auth credentials): after this pushes to `main` and Render redeploys, log into the live frontend with a real (non-`local:`) Supabase Auth account and confirm: login succeeds, Experiments/Conditions/Cells screens load real data, "Add experiment"/"New slide" create rows, hand-count Done/delete (×) round-trip through `POST /cells/{id}/counts` / `DELETE /counts/{id}`.
3. Confirm a second Supabase Auth account only sees its own experiments (the per-researcher scoping this task adds) — needs two real accounts, so this is also a manual check.

## Final step (per project convention)

After implementation: check the relevant Phase 11 items in `docs/tasks.md` (and add the previously-missing CRUD line items), append a Phase 11a entry to `docs/activity.md`.

---
---

# Plan: Phase 11b — Render API: `.tif` Image Pipeline + ICC

## Context

Phase 11a implemented auth and the plain CRUD endpoints on `api/main.py` — experiments/conditions/cells reads/writes and hand-count create/delete, all scoped per-researcher. What's left in `docs/tasks.md` Phase 11 is the part that actually needs image processing and statistics, not just CRUD:

- `.tif` → contrast-normalized, green-LUT PNG rendering (shared by two endpoints)
- `POST /conditions/{id}/tif-preview` — render-only, no DB writes, used by the Add Photos canvas
- `POST /conditions/{id}/cells/from-tif` — render + crop per box + upload each crop + create one `cells` row per box
- ICC computation with `pingouin`, written to `conditions.icc`

These are the last pieces standing between the app and a fully-functional real (non-`local:`) account. Every request/response shape below was already fixed by the frontend back in Phases 7/8 (`app.js`) — this task has no frontend changes, only wiring Render up to match what's already being called.

Confirmed with user before writing this plan: the `cell-images` Supabase Storage bucket already exists and is **public**. This matters because the frontend loads both preview and cell images via plain `<img src="...">` (app.js:1200, app.js:1410) with no auth header — the browser can't attach a bearer token to an `<img>` fetch, so the URLs returned by these endpoints must be publicly fetchable. A public bucket means `.storage.from_("cell-images").get_public_url(path)` is sufficient; no signed-URL logic needed.

## Exact shapes the frontend already assumes

| Endpoint | Called at | Request | Response |
|---|---|---|---|
| `POST /conditions/{id}/tif-preview` | app.js:1198 | multipart: `file` (raw `.tif`) | `{ preview_url }` — no DB write |
| `POST /conditions/{id}/cells/from-tif` | app.js:1316 | multipart: `file` (raw `.tif`) + `boxes` (JSON string: `[{x, y, width, height}]`, 0–100 percentages of the source image) | any 2xx (frontend doesn't consume the body — see `confirmAddPhotos()`, only checks success/failure) |

Both go through `apiUpload()` (app.js:1045), which attaches the Bearer token manually (multipart can't go through the JSON-only `api()` helper) and throws on non-2xx.

## Design

### 1. `api/imaging.py` — pure image-processing functions, no Supabase/network dependency

Split out from `main.py` because this is a genuinely different concern (numpy/array manipulation) from the HTTP/DB glue, and — unlike the DB-backed routes — these functions can be exercised in a real local test with no credentials, which is worth keeping easy to isolate.

- `render_tif_to_image(tif_bytes: bytes) -> PIL.Image.Image`
  - `tifffile.imread()` the bytes into a numpy array
  - Reduce to a single 2D plane: if already 2D, use as-is; if 3D, assume the smaller trailing/leading axis is a channel or z-stack and take the first plane/channel (documented assumption — this pipeline targets single-channel BODIPY captures, not multi-channel composites or z-stacks; a shape that can't be reduced to 2D raises a clear `ValueError` that the route turns into a 400)
  - Contrast-normalize: 1st/99.5th percentile stretch, clip, scale to `uint8` — a standard fluorescence "auto-contrast" that avoids a few hot/dead pixels blowing out the range
  - Apply the green false-color LUT: build an `(H, W, 3)` `uint8` array with the normalized intensity in channel 1 (green) and 0 elsewhere, matching CLAUDE.md's "green false-color LUT (BODIPY channel)"
  - Return a `PIL.Image` (`mode="RGB"`) — kept as an Image object, not encoded bytes, so `cells/from-tif` can crop it in-memory without a decode round-trip
- `encode_png(image: PIL.Image.Image) -> bytes`
- `crop_percent(image: PIL.Image.Image, x: float, y: float, width: float, height: float) -> PIL.Image.Image` — converts 0–100 percentages to a pixel rect against `image.size`, clamps to image bounds, `.crop(...)`

### 2. Storage helper (in `main.py`, next to the existing `supabase` client)

`upload_png(path: str, image: PIL.Image.Image) -> str` — encodes via `encode_png`, `supabase.storage.from_("cell-images").upload(path, png_bytes, {"content-type": "image/png"})`, returns `get_public_url(path)`. Paths: `previews/{condition_id}/{uuid4}.png` for previews, `cells/{condition_id}/{uuid4}.png` for cell crops — same bucket, prefixed so the two purposes don't collide, matching PRD §8.3's description of `cell-images` as the single bucket for "processed PNG exports."

### 3. `POST /conditions/{id}/tif-preview`

`file: UploadFile = File(...)`, scoped via the existing `owned_condition(condition_id, user.id)` (Phase 11a). Reads the upload, `render_tif_to_image`, uploads to `previews/{condition_id}/...`, returns `{ "preview_url": url }`. Invalid/unreadable `.tif` → 400. No DB writes, per the frontend's own comment at app.js:1198 (this is a preview only).

### 4. `POST /conditions/{id}/cells/from-tif`

`file: UploadFile = File(...)`, `boxes: str = Form(...)` (JSON-encoded array, parsed with a small `BoxPct` Pydantic model — `x, y, width, height: float`, validated 0–100). Scoped via `owned_condition`. Steps:
1. `render_tif_to_image` once
2. Look up the condition's current cell count (`supabase.table("cells").select("id", count="exact").eq("condition_id", ...)`) to continue the `Cell N` numbering — same convention the Phase 7 local-fixture path already uses in `app.js`'s `confirmAddPhotos()`
3. For each box: `crop_percent`, `upload_png` to `cells/{condition_id}/...`, insert one `cells` row (`condition_id`, `name: f"Cell {n}"`, `image_url`)
4. Return the list of created cell rows

### 5. ICC computation

**Trigger design (the one real judgment call here):** `docs/tasks.md` calls this an "endpoint," but nothing in `app.js` ever calls a dedicated ICC-trigger endpoint — the frontend just expects `conditions.icc` to already be populated whenever it fetches conditions (Phase 5's `iccQualityLabel()` reads `condition.icc` straight off the GET response). So `conditions.icc` has to be kept fresh automatically, not on-demand. Design:

- A shared helper `recompute_condition_icc(condition_id)` in `main.py`:
  - Fetches all cells + counts for the condition (same nested-select shape as `GET /conditions/{id}/cells`)
  - Includes **only cells with exactly 3 counts** — pingouin's ANOVA-based ICC estimator wants a fully-crossed balanced design (every target rated by every rater), and a cell that hasn't completed the 3-count blinded protocol yet shouldn't be averaged into the condition's reliability score anyway
  - Needs at least 2 such cells to compute anything; below that, sets `icc = None` (already handled by the existing `iccQualityLabel()` "—" fallback in `app.js`)
  - Builds a long-format `pandas.DataFrame` (`cell_id`, `rater` ∈ {1,2,3} assigned by each cell's `created_at` order, `value`), calls `pingouin.intraclass_corr(data=df, targets='cell_id', raters='rater', ratings='value')`, takes the `ICC3k` row (two-way mixed, average-measures, consistency — the natural fit since `cell.average` is already the mean of the fixed 3 count slots, and CLAUDE.md/PRD never describe raters as randomly sampled from a larger population)
  - `UPDATE conditions SET icc = ... WHERE id = condition_id`
- Called automatically at the end of `POST /cells/{id}/counts` and `DELETE /counts/{id}` (Phase 11a) for the affected cell's condition, so ICC self-updates as counts come in — no frontend change needed
- Also exposed as `POST /conditions/{id}/recompute-icc` (scoped via `owned_condition`) — satisfies tasks.md's literal "endpoint" item and gives a manual escape hatch, but isn't required for normal app usage

### 6. Dependencies (`api/requirements.txt`)

Add `tifffile`, `pillow`, `numpy`, `pingouin` (pulls in `pandas`/`scipy`/`statsmodels` transitively — a meaningfully heavier install than Phase 11a's; flagging since Render's free tier already has slow cold starts per CLAUDE.md, and this will also slow down build/deploy time, not just cold start).

## Files Modified

| File | Change |
|---|---|
| `api/imaging.py` (new) | `render_tif_to_image`, `encode_png`, `crop_percent` |
| `api/main.py` | `upload_png` storage helper; `POST /conditions/{id}/tif-preview`; `POST /conditions/{id}/cells/from-tif`; `recompute_condition_icc`; `POST /conditions/{id}/recompute-icc`; call `recompute_condition_icc` from the existing counts create/delete routes |
| `api/requirements.txt` | Add `tifffile`, `pillow`, `numpy`, `pingouin` |
| `docs/tasks.md` | Check off the remaining Phase 11 items |
| `docs/activity.md` | Append a Phase 11b entry |

## Verification

Unlike Phase 11a (pure CRUD, needed live Supabase to mean anything), the image-processing and ICC math here have **no Supabase dependency** and can be genuinely exercised locally:

1. `api/imaging.py` — generate a synthetic test `.tif` in-memory with `tifffile`/`numpy` (a small array with a known gradient), run it through `render_tif_to_image` + `encode_png`, assert: output decodes as a valid PNG, correct dimensions, red/blue channels are all zero, green channel reflects the contrast stretch (min≈0, max≈255). Run `crop_percent` with known box percentages and assert the output size matches the expected pixel rect.
2. ICC math — build a synthetic `pandas.DataFrame` with a known 3-rater/N-target structure (values chosen so the expected ICC is roughly known, e.g. near-identical raters → ICC near 1, wildly divergent raters → ICC near 0), call `pingouin.intraclass_corr` directly the same way `recompute_condition_icc` will, confirm it returns a sane `ICC3k` value and that the "only exactly-3-count cells, else None below 2 targets" filtering logic (tested as a standalone pure function) behaves correctly.
3. Same `TestClient` + placeholder-env-var approach as Phase 11a for the two new HTTP routes: confirm 401 with no auth, 404 when the condition isn't owned, 422 on a malformed `boxes` JSON string, and that a deliberately corrupt `.tif` upload produces a clean 400 rather than a 500.
4. Real end-to-end (an actual `.tif` through the deployed Render service, a real image appearing in the Add Photos canvas, a real condition's ICC populating after 3-count cells exist) still needs the user against the live Supabase project — same limitation as Phase 11a, flagged back to the user.

## Deviations from this plan during implementation

- `pg.intraclass_corr`'s `Type` column values turned out to be `"ICC(C,k)"` in the installed pingouin 0.6.1, not the `"ICC3k"` string this plan assumed (an older pingouin naming convention) — caught immediately by the local ICC test (a high-agreement dataset returned `None` instead of ~1) and fixed.
- The ICC filtering/compute logic was factored into a standalone pure function `compute_icc(cells)` (called by `recompute_condition_icc`) specifically so verification step 2 above could actually call the same code path the app uses, rather than a hand-duplicated copy of the logic in the test.
- Local venv setup hit two environment snags unrelated to the code: the disk was initially full ("No space left on device," resolved by the user freeing space), and the system's default `py` now resolves to Python 3.14, for which `pydantic_core` has no compatible wheel yet — the venv had to be pinned to `py -3.13`.
- Verification step 3's 404/422/400 sub-cases (condition ownership, malformed boxes, corrupt `.tif`) weren't reachable through `TestClient` without a live Supabase backend, same limitation already noted for Phase 11a — only the 401 (no/bad auth) paths were actually exercised.

## Final step (per project convention)

After implementation: check the remaining Phase 11 items in `docs/tasks.md`, append a Phase 11b entry to `docs/activity.md`, append this plan to `docs/plan.md`.

---
---

# Plan: Automated Droplet Count Suggestion (Gaussian blur → threshold → watershed)

## Context

PRD §12 (Future Considerations) lists "Automated counting: Integrate image analysis (e.g., `cellpose`, `skimage`) in the Python pipeline to suggest droplet locations" — explicitly out of v1 scope until now. The user wants to start building this using a classical (non-ML) pipeline: Gaussian blur → Otsu threshold → watershed segmentation, the standard `skimage` recipe for splitting touching/overlapping blob-like objects.

This came up because the existing display pipeline (`api/imaging.py`'s `render_tif_to_image`, built in Phase 11b) is unsuitable as analysis input: it's an 8-bit, percentile-clipped, false-colored (green-channel-only) PNG built purely for the browser's `<img src>` — the percentile clip throws away real intensity data exactly where droplet boundaries live, and the original raw `.tif` isn't persisted anywhere to re-derive from later.

**Decisions confirmed with the user before writing this plan:**
- **Trigger & persistence:** runs automatically inside the existing `POST /conditions/{id}/cells/from-tif` endpoint, analyzing the image while it's still in memory — before it gets compressed into the lossy 8-bit display PNG. Sidesteps the "8 vs 16-bit PNG" question entirely: analysis operates on the raw float plane directly, never round-tripping through any PNG format. Result saved as a new column on `cells`.
- **Output:** count only (an integer), not marker coordinates.
- Column name: the user ran the schema change themselves and named it `auto_count` (this plan originally proposed `suggested_count`).

## Design (as implemented)

### 1. `api/imaging.py` — split the render pipeline

`render_tif_to_image(tif_bytes)` split into `load_tif_plane(tif_bytes) -> np.ndarray` (raw float64 2D plane, no normalization) and `render_display_image(plane) -> Image.Image` (the existing percentile-stretch + green-LUT logic, now taking a plane). `render_tif_to_image` kept as a thin wrapper composing the two — `tif-preview` needed zero changes. Added `crop_array_percent(plane, x, y, width, height) -> np.ndarray`, sharing the same pixel-rect math as the existing `crop_percent` (factored into a shared `_crop_pixel_rect` helper) so the analysis crop and display crop stay spatially aligned.

### 2. `api/detection.py` (new)

`count_droplets(plane) -> int`: Gaussian blur → Otsu threshold → Euclidean distance transform → smoothed-distance-map peak-finding as watershed seeds → `skimage.segmentation.watershed` → `regionprops` filtered by minimum area. Pure function, no Supabase dependency.

### 3. `api/main.py` — wired into `cells_from_tif`

`load_tif_plane` once, `render_display_image(plane)` for display. Per box: `crop_percent` (display/upload, unchanged) + `crop_array_percent` + `count_droplets` (analysis) → `auto_count` included in the `cells` insert. Flows through existing `GET` endpoints automatically (both already `select("*", ...)` on `cells`) — no other endpoint changes needed.

### 4. Schema

`alter table cells add column auto_count integer;` — run directly by the user via the Supabase dashboard. `CLAUDE.md` updated to document the column and that it's excluded from `cell.average`/`condition.icc`.

### 5. Dependencies

Added `scipy` (explicit; was previously only transitive via `pingouin`) and `scikit-image` (new) to `api/requirements.txt`.

## Verification

1. `count_droplets` against synthetic Gaussian-bump images: 4 well-separated blobs → 4 (robust across 5 random noise seeds); a touching/overlapping pair → 2 (validated against a naive threshold+`regionprops` sanity check that returns 1 for the same input, confirming watershed is actually doing the splitting); flat/empty → 0.
2. `load_tif_plane`/`render_display_image`/`crop_array_percent` alignment: `render_tif_to_image` still exactly equivalent to the new two-step composition; `crop_array_percent` agrees with `crop_percent` on pixel dimensions for identical boxes, including edge-clamp cases.
3. `TestClient` regression pass confirming no Phase 11a/11b routes broke.
4. Not verifiable locally: real `auto_count` values against actual microscopy `.tif`s, and the column round-tripping through the live Supabase table.

## Deviations from this plan during implementation

- Column named `auto_count`, not `suggested_count` as originally proposed — the user ran the `ALTER TABLE` themselves and chose the name.
- The initial `count_droplets` implementation fed `peak_local_max` the raw (unsmoothed) distance transform. The local touching-pair test caught a real bug: the raw distance transform has a shallow local maximum right on the saddle ridge between two touching blobs (a classic watershed over-segmentation artifact), producing 3 seeds instead of 2 for a 2-droplet input. Fixed by smoothing the distance map (`scipy.ndimage.gaussian_filter`, `sigma=1.5`) before peak-finding, while still flooding the watershed on the *unsmoothed* distance map (smoothing that would blur real droplet boundaries).
- Same environment pattern as Phase 11b: venv pinned to `py -3.13` (system default `py` resolves to 3.14, which lacks a `pydantic_core` wheel); this time the install had enough disk headroom already, no repeat of the earlier "No space left on device" issue.

## Final step (per project convention)

After implementation: add/check the relevant items in `docs/tasks.md`, append an activity entry to `docs/activity.md`, append this plan to `docs/plan.md`.

---

# Bug fix — Add Photos crop cutting off part of the cell

**Report:** cropping a cell doesn't work — part of the cell gets cut off even when the drawn box fully contains the cell on screen.

## Diagnosis

`.canvas-frame` (`style.css`) is hardcoded to `aspect-ratio: 8 / 5` with `.photo-preview-img { object-fit: cover }`. `tif-preview` serves a full-resolution, unresized render of the source `.tif`, whose aspect ratio is whatever the microscopy capture happens to be — not necessarily 8:5. When it isn't, `object-fit: cover` crops the *displayed* image to fill the frame, but the box drag/resize code (`addBoxAt`, `startBoxDrag`, `startBoxResize`) records box position/size as percentages of the frame, and `confirmAddPhotos` sends those percentages straight to the backend. `crop_percent`/`crop_array_percent` (`api/imaging.py`) apply them against the full, uncropped original image. So a box that visually bounds the cell in the cover-cropped preview maps to a shifted rectangle in the true image, cutting off whatever `cover` had already trimmed from the display. Not reproducible via the `local:` test account because its simulated SVG preview is a fixed 640×400 (exactly 8:5) viewBox, so `cover` never actually crops there — only real, non-8:5 `.tif` captures trigger it.

## Fix

`app.js` — after `tif-preview` resolves, preload the returned PNG with `new Image()` to read `naturalWidth`/`naturalHeight`, store `${w} / ${h}` as `entry.aspectRatio`, and set it as the inline `aspect-ratio` style on `.canvas-frame` in `renderAddPhotosCanvasHTML` (falling back to the CSS default `8 / 5` while loading, or for `local:` fixtures which don't set it). With the frame's ratio always matching the real image, `object-fit: cover` degenerates to a uniform scale with no cropping, so frame-relative box percentages equal image-relative percentages — matching what the backend's crop math assumes.

## Verification

Not verifiable end-to-end locally — needs a real, non-8:5-ratio `.tif` through the deployed Render service, which this environment doesn't have. Reasoned through by hand: previously, for an image narrower/taller than 8:5, `cover` trimmed the sides in the display; a box drawn to fully bound a cell near that trimmed edge would translate to backend percentages overshooting the real image. With the frame ratio matched to the image, that mismatch is eliminated. Flagged to the user to confirm against a real oddly-proportioned capture after deploying.

## Final step (per project convention)

Activity entry appended to `docs/activity.md`. No `docs/tasks.md` items apply — this is a bug fix to already-shipped Phase 11 functionality, not a new checklist item.

---

# Display rendering — green false-color LUT → grayscale

**Request:** convert the `.tif` display render to a black-and-white PNG instead of green false-color.

## Change

`render_display_image` (`api/imaging.py`) keeps the existing percentile contrast stretch to `uint8` but now returns `Image.fromarray(normalized, mode="L")` — a true single-channel grayscale image — instead of building an `(H, W, 3)` RGB array with intensity only in the green channel. `render_tif_to_image`, `encode_png`, `crop_percent`, `crop_array_percent` are all channel-agnostic and needed no changes. Updated the two places documenting this as current design: `CLAUDE.md` ("Normalize contrast, render as grayscale, export as PNG") and the `.tif` pipeline comment in `api/main.py`. Historical references to the green LUT in `docs/PRD.md`, `docs/tasks.md`, and earlier `docs/activity.md`/`docs/plan.md` entries were left as-is — they're a record of what Phase 11 originally shipped, not living docs.

## Verification

Not verifiable end-to-end locally (no live Render/Supabase in this environment). By inspection: `"L"`-mode `PIL.Image` from a 2D `uint8` array is valid and PNG-encodes natively, so no downstream changes needed. Flagged to the user to confirm the rendered images look correct after deploying.

## Final step (per project convention)

Activity entry appended to `docs/activity.md`. No `docs/tasks.md` items apply — this changes already-shipped Phase 11 rendering behavior, not a new checklist item.

---

# Bug fix — Count screen still showing a mis-cropped image

**Report:** after the earlier Add Photos canvas-frame fix, the image is still not cropping properly and looks different on the cell count page.

## Diagnosis

The earlier fix only addressed `#canvas-frame` on the Add Photos screen (matching its aspect ratio to the source image while drawing boxes), which does make the crop percentages sent to the backend correct. `renderCountHTML`'s `#count-frame` — where the resulting `cell.image_url` crop is displayed for counting — reuses the same `.canvas-frame` CSS class but never set an aspect ratio, so it used the CSS default `aspect-ratio: 8 / 5`. A per-box crop's real aspect ratio is whatever the user drew, so `object-fit: cover` cropped it again just for display, making an already-correct crop look wrong on the count page.

## Fix

`app.js`, `wireCount()`: after mount, locate the `<img class="photo-preview-img">` inside `#count-frame` and set the frame's `aspect-ratio` inline from `img.naturalWidth`/`naturalHeight` (immediately if `img.complete`, else on `load`) — same technique as `addPhotoFile`'s Add Photos fix, applied to the second consumer of `.canvas-frame`. The SVG placeholder fallback (`local:` accounts / missing `image_url`) is untouched — its fixed 640×400 viewBox already matches the CSS default 8:5.

## Verification

Not verifiable end-to-end locally (no live Render/Supabase project, so no real non-8:5 `cell.image_url` to test against). By inspection: `naturalWidth`/`naturalHeight` reflect the PNG's real pixel dimensions independent of layout, so deriving the frame's `aspect-ratio` from them makes `object-fit: cover` a uniform scale with no cropping — mirroring the Add Photos fix. Flagged to the user to confirm against a real cropped cell image after deploying.

## Final step (per project convention)

Activity entry appended to `docs/activity.md`. No `docs/tasks.md` items apply — bug fix to already-shipped Phase 11 functionality.

---

# Cell crop pipeline — 16-bit normalized PNG replaces display-stretched crop

## Context

User wants hand counting to run on the same PNG stored for viewing (`cells.image_url`), and for that same image to become the base auto-count models operate on — collapsing today's two-track `cells_from_tif` design (an 8-bit percentile-stretched display crop for `image_url`, plus a separate raw-plane crop passed to `count_droplets` and never persisted). Per-model processing (blur, threshold, etc.) stays transient, computed at count time and not stored — only the base crop changes.

The open design question was what "minimal image processing" means for the stored crop, since after this change there's no raw `.tif` to fall back to if that step throws away data. Two options existed: keep `render_display_image`'s percentile clip (1st/99.5th) at 16-bit depth, or a plain linear min/max stretch. Confirmed with the user (`AskUserQuestion`): linear min/max stretch, since it's a non-clipping, strictly monotonic transform — no pixel data lost, and Otsu threshold + watershed give the same result on it as on the raw plane. Also confirmed scope: `tif-preview` (whole-frame render for the Add Photos box-drawing canvas) is unaffected, since it's never used for counting or analysis.

## Approach

`api/imaging.py`:
- New `normalize_to_uint16(plane)`: `(plane - plane.min()) / (plane.max() - plane.min()) * 65535` → `uint16`; degenerate flat crop → all zeros.
- New `encode_png_16(plane)`: `Image.fromarray(plane.astype(np.uint16))` (dtype alone is enough for PIL to infer 16-bit grayscale `"I;16"` — no explicit `mode=` needed) → PNG bytes.
- Remove `crop_percent` (PIL-Image-based crop) — no longer has a caller once `cells_from_tif` stops building a separate display crop.

`api/main.py`:
- `upload_png(path, png_bytes: bytes)`: takes raw bytes instead of a `PIL.Image`, so each call site encodes with whichever function matches its image (`encode_png` for `tif-preview`'s still-8-bit render, `encode_png_16` for cell crops).
- `cells_from_tif`: drop the `image = render_display_image(plane)` line. Per box: `crop_array_percent(plane, ...)` → `normalize_to_uint16` → `encode_png_16` → `upload_png` (→ `cells.image_url`); `count_droplets` runs on that same `normalized_crop`, not a separately-cropped raw plane.

## Verification

- Confirmed the sample TIF the user added (`assets/Image_43391.tif`) is `uint16`, `147–21973` — the easy, no-rescale-needed case, and representative of real fluorescence-camera output generally.
- `Image.fromarray(uint16_array)` → PNG → decode is bit-exact (`np.array_equal` True); used the mode-less form since explicit `mode="I;16"` triggers a Pillow 13 deprecation warning.
- Rendered a real normalized crop and viewed the actual PNG file: strong per-droplet contrast, clearly usable for hand counting (not washed out or near-black).
- Ran the full new path end-to-end against the sample TIF: decoded PNG bytes match the in-memory array exactly, and `count_droplets(normalized_crop) == count_droplets(raw_crop)` (57 == 57) — confirms the monotonic-transform invariance claim in practice.
- Not verifiable locally: real Supabase Storage upload/`image_url` round-trip, and `<img>` rendering of a 16-bit PNG from a real served URL (only verified the file directly, not via a live URL in a browser) — flagged to the user to confirm after deploying.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md` (written retroactively alongside the activity entry, after the normalization/scope questions were resolved with the user — small enough in surface area, two existing files, that a separate upfront planning pass wasn't needed before starting).

---

# Auto-count preprocessing — background flattening + CLAHE before thresholding

## Context

Follow-on to the 16-bit normalized-crop work above: with the stored `cells.image_url` now shared between hand-counting/viewing and the auto-count base image, the user wants the auto-count model to run its own additional processing on top of that shared crop — transient (computed at count time, not persisted back to the PNG), since future/different auto-count models may want different processing recipes. Asked which techniques; user chose both rolling-ball background subtraction and CLAHE.

## Approach

`api/detection.py`:
- `preprocess_for_detection(plane)`: `rolling_ball` background subtraction (radius `25`px, new `BACKGROUND_BALL_RADIUS_PX` constant) subtracted and clipped to `uint16` range, then `equalize_adapthist` (CLAHE, `clip_limit=0.01`, new `CLAHE_CLIP_LIMIT` constant).
- `count_droplets` calls it as the first step before the existing Gaussian blur → Otsu → watershed chain. No caller changes needed elsewhere.
- Kept preprocessing inside `count_droplets`'s own module rather than a separate call site in `api/main.py`, since there's only one auto-count model today — no premature abstraction for a plural "models" system that doesn't exist yet.

## Verification

- Timed both new steps on a real ~615×615 crop: `rolling_ball` ~1.3s, `equalize_adapthist` ~0.05s — acceptable per-box at cell-creation time.
- **Bug found and fixed before shipping:** `equalize_adapthist` fabricates full-range contrast (std 0.31) out of a genuinely flat/all-zero input — a tiling artifact of adaptive histogram equalization, not real signal — which made `count_droplets` hallucinate 56 droplets on an empty crop that should return 0. Fixed with a degenerate-input guard (checked pre- and post-background-subtraction) in `preprocess_for_detection` that skips CLAHE and falls through to `count_droplets`'s existing `threshold_otsu` `ValueError` → 0 path.
- Re-ran all previously-documented Phase 11c synthetic tests after the fix: flat/empty/all-zero crops → 0; 4 well-separated blobs → 4; naive threshold+`regionprops` (no watershed) on a touching pair → 1 (still shows watershed is doing real work).
- Investigated an apparent touching-pair regression from an ad hoc synthetic test; found the test itself was flawed (didn't reproduce a genuine split under the *original* algorithm either). Rebuilt it properly by sweeping blob separation: original and preprocessed both return 2 identically for separations 12–20px; only at the tightest 10–11px separation (at the original algorithm's own splitting limit) does CLAHE's local contrast maximization saturate the shallow saddle enough to merge them into 1.
- Real sample crop: auto-count 57 → 68 with preprocessing; visually confirmed the additional 11 are real dim droplets near the cell edges that background flattening + local contrast enhancement pulled out, not noise.
- Presented the net trade-off (broad gain on dim droplets vs. narrow loss at the tightest touching separations) to the user; decided to keep current defaults rather than guess-tune without real hand-count data to calibrate against.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Hand-counting image was still too dim — bake enhancement into the stored PNG

## Context

After deploying the linear min/max-normalized crop as `cells.image_url`, the user reported it was still too dim for hand counting — a linear stretch fixes a *clipped range* but not a *skewed distribution* (mostly dim pixels, sparse bright droplet peaks), which is what was actually going on. Asked the user whether to bake the already-proven `preprocess_for_detection` enhancement (rolling-ball + CLAHE) into the stored image, or add a separate display-only client-side enhancement and leave the stored/analysis image untouched. Chose to bake it in — reuse tested code over writing new frontend image manipulation.

## Approach

`api/detection.py`:
- `preprocess_for_detection` now always returns `uint16` (previously inconsistent: `float64` in `[0,1]` from the CLAHE branch vs. passthrough range from the two degenerate branches — didn't matter when the only consumer was `count_droplets`, but does now that the same array gets `encode_png_16`'d for storage).
- `count_droplets` no longer calls `preprocess_for_detection` internally — takes an already-processed array. Avoids running CLAHE twice (once for storage, again inside detection) now that both consumers share one array.

`api/main.py`: `cells_from_tif` calls `preprocess_for_detection` once per box; the result feeds both `encode_png_16` → `upload_png` (→ `cells.image_url`) and `count_droplets`. Same total per-box cost as before (one `rolling_ball` + one `equalize_adapthist` call), just relocated from inside `count_droplets` to the call site.

## Verification

- Re-ran flat/empty/all-zero-crop edge cases through the new `count_droplets(preprocess_for_detection(x))` call pattern: all still return 0.
- PNG round-trip on the real sample crop still bit-exact; `dtype uint16`, `min/max 0/65535`.
- `count_droplets` on the consolidated `processed` array still returns 68 for the real crop — matches the prior entry's value, confirming this was a behavior-preserving refactor, not a silent change.
- Viewed the actual PNG that now gets stored: same clearly-more-legible image already validated visually in the prior preprocessing entry.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Bug fix — stored hand-counting image was blurry after baking CLAHE in

## Context

User reported the stored `cells.image_url` looked "very blurry" right after the previous change baked `preprocess_for_detection` into storage. Needed to determine whether this was a real pixel-level effect or a perceptual/display one before touching any code.

## Diagnosis

Measured width-at-half-max (FWHM) of a real droplet peak at each pipeline stage: baseline (plain `normalize_to_uint16`) = 5px; after `preprocess_for_detection` at the shipped `CLAHE_CLIP_LIMIT=0.01` = 9px. Confirmed this is real: rolling-ball background subtraction leaves a soft skirt around each peak (geometric consequence of a ball rolling under a narrow spike), and CLAHE's local contrast stretch pulls that skirt up toward full brightness within each tile — genuinely widening the visible footprint, not a rendering artifact.

Tried two alternatives before settling on tuning CLAHE directly: global (non-adaptive) `equalize_hist` — far worse, FWHM 30px and auto-count 228 (amplifies noise globally with nothing to contain it locally); plain gamma correction — auto-count dropped below baseline (51 vs 57), since a uniform curve doesn't selectively lift *locally* dim regions the way CLAHE does.

## Approach

Swept `CLAHE_CLIP_LIMIT` (0.01 / 0.005 / 0.002) against both FWHM and real-crop auto-count, rendered each to a real PNG, and presented the trade-off numerically and visually to the user:

| clip_limit | FWHM | auto_count | |
|---|---|---|---|
| 0.01 (old default) | 9px | 68 | brightest, most smeared |
| 0.005 | 7px | 81 | balanced |
| 0.002 | 5px (= baseline) | 85 | sharpest, dimmer |

User chose 0.005. Changed `CLAHE_CLIP_LIMIT` in `api/detection.py` from `0.01` to `0.005`, with a comment recording the FWHM measurements as the rationale (skimage's own default of 0.01 is what caused the problem — worth flagging clearly so it isn't "corrected" back to the default later).

## Verification

- Re-ran flat/all-zero-crop edge cases with the new value: still 0.
- Re-verified PNG round-trip at `clip_limit=0.005`: bit-exact, `uint16`, `min/max 0/65535`.
- Confirmed final shipped pipeline's `count_droplets` returns 81 (up from 68 at the old default, 57 with no preprocessing).

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# `count_droplets` reworked to an ALDQ-style pipeline

## Context

User reported the auto-count image processing "isn't the best" and asked for it to match the ALDQ counting model: iterations of sharpening edges using a band-pass filter and difference of Gaussians, then counting local maxima, edge detection, and watershed. This replaces the existing Gaussian blur → Otsu threshold → distance-transform watershed chain in `api/detection.py`'s `count_droplets`.

## Approach

`preprocess_for_detection` (rolling-ball background subtraction + CLAHE) is unchanged — it's a separate concern (feeds both the stored display image and `count_droplets`'s input) and the user's request was specifically about the counting algorithm.

Read "band-pass filter" and "difference of Gaussians" as the same operation — DoG is the standard band-pass filter used in blob detection — and "iterations of sharpening edges" as repeated unsharp-mask passes that recompute the DoG on the progressively-sharpened image each time, so droplet edges get crisper each round:

1. **Sharpen** (`SHARPEN_ITERATIONS=3` passes): `sharpened += SHARPEN_STRENGTH * difference_of_gaussians(sharpened, DOG_LOW_SIGMA_PX=1.0, DOG_HIGH_SIGMA_PX=6.0)`. Low sigma rejects pixel noise, high sigma rejects structure wider than a droplet (droplet FWHM ~5-9px per `preprocess_for_detection`'s existing comments).
2. **Local maxima**: `peak_local_max` directly on the sharpened image, restricted to an Otsu-thresholded foreground mask — one seed per droplet center, replacing the old smoothed-distance-transform approach.
3. **Edge detection + watershed**: `sobel(sharpened)` as the watershed elevation map (flooding stops at high-gradient edges), replacing the old `-distance` landscape. Markers from step 2, mask from Otsu (same role as before).

Kept the Otsu-based mask since watershed still needs a foreground/background boundary to bound the flood — the user's description didn't call for removing thresholding, just changing how sharpening/seeding/flooding works.

## Verification

- Confirmed `difference_of_gaussians` and `sobel` exist in the installed scikit-image (0.26.0).
- Synthetic smoke test: 6 well-separated blobs → exact count of 6; empty array and flat/constant crop → 0.
- Spacing sweep on a synthetic touching pair: splits correctly at ≥8px center spacing (droplet radius ~3px), merges at 7px — same failure point as the *old* algorithm on the same extreme case, so not a regression, just a different mechanism reaching the same hard-case limit.
- Did not re-run against the real sample crop or real hand-count data yet — new constants are prototype defaults, not yet calibrated, consistent with this module's existing caveats.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# `api/detection.py` reworked to an explicit ImageJ-style binary pipeline

## Context

User specified a concrete 5-step image-processing pipeline to replace the ALDQ DoG/CLAHE approach, for both hand-count and auto-count images:

1. Subtract background — rolling ball radius 12px
2. Threshold to binary, dark background
3. Binary fill holes
4. Binary convert to mask
5. Binary watershed

The stored hand-count image (`cells.image_url`) should stop after step 2, not run the full chain.

## Approach

Split the pipeline into named steps rather than one monolithic function, since the hand-count and auto-count consumers now diverge partway through:

- `subtract_background(plane)` — `rolling_ball(plane, radius=12)` (radius constant dropped from the old `25`).
- `threshold_binary(flattened)` — Otsu threshold, `flattened > thresh` (dark background = foreground is the bright side of the threshold), returned as a boolean mask.
- `preprocess_for_hand_count(plane)` — `subtract_background` → `threshold_binary`, steps 1-2 only, returned as uint16 `0`/`65535`. Replaces `preprocess_for_detection` as the function whose output is stored as `cells.image_url`.
- `count_droplets(plane)` — full chain: `subtract_background` → `threshold_binary` → `scipy.ndimage.binary_fill_holes` (step 3; also serves as step 4's "convert to mask" since the filled result is already a clean boolean array) → distance-transform watershed (step 5): `distance_transform_edt` of the filled mask, `peak_local_max` on the distance transform for one marker per droplet center, `watershed(-distance, markers, mask=filled)`. This is the standard skimage recipe for ImageJ's Process > Binary > Watershed.

`count_droplets` takes the raw normalized crop and runs the full chain itself rather than accepting `preprocess_for_hand_count`'s output, since steps 3-5 need the boolean mask from step 2, not the uint16 display image — recomputing steps 1-2 inside `count_droplets` is cheap relative to `rolling_ball`'s own cost and keeps the two functions independently correct rather than coupling them through an intermediate representation.

`api/main.py`'s `cells_from_tif` calls both functions separately off the same `normalized_crop`.

Removed the now-dead CLAHE/DoG/Sobel code (`preprocess_for_detection`'s CLAHE step, the old sharpen-iteration loop, `sobel` elevation map) and their constants, since the user's 5-step spec doesn't use any of them.

## Verification

- Synthetic smoke test (4 Gaussian blobs, one close pair, noisy background): `preprocess_for_hand_count` output has exactly two unique values (`0`, `65535`) — confirmed binary. `count_droplets` runs end-to-end without error and returns a plausible count.
- `scipy` already in `api/requirements.txt`; `scipy.ndimage` is a new import, not a new dependency.
- Not yet verified: real sample crop, real hand-count calibration of `BACKGROUND_BALL_RADIUS_PX=12` or watershed peak-distance defaults, or how the now-binary stored hand-count image actually looks/reads for a researcher doing manual counting — flagged to the user as worth confirming post-deploy since this is a visible behavior change (grayscale → binary) to the stored image, not just an internal algorithm swap.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Threshold pushed stricter to try to separate clumped droplets

## Context

User reported droplets are "all clumping together and not becoming distinct" and asked whether thresholding could be adjusted so more of the image turns black — i.e. a stricter cutoff.

## Approach

Added a scaling factor to `threshold_binary` rather than replacing Otsu outright: `THRESHOLD_FACTOR = 1.3` multiplies `threshold_otsu(flattened)` before the `flattened > thresh` cutoff, so the mask keeps only brighter pixels as foreground. Otsu still auto-computes the base split per-crop; the factor just raises the bar above what Otsu alone would pick.

Before shipping, tested against two synthetic clumps (a 4-blob tight overlap, and a 3-droplet clump with a visible saddle) to check whether this would actually address the reported symptom. It didn't fully: raising the factor shrinks the foreground mask uniformly but doesn't split a connected blob into multiple watershed regions unless the shrinking happens to break the connected component apart. In both synthetic cases `auto_count` stayed at `1` across the whole factor sweep. Debugging further (printing the distance transform's raw local maxima) showed the real constraint is `MIN_PEAK_DISTANCE_PX=3` in `count_droplets` — it merges distance-transform peaks that are within 3px of each other into a single watershed seed, independent of how strict the threshold is. Confirmed by rerunning with `min_distance=1` on the identical thresholded mask: peaks went from 1 to the correct 3, and `auto_count` followed.

Presented this trade-off to the user directly (threshold changes area, peak-distance changes splitting) with the concrete synthetic numbers, and asked whether to also lower `MIN_PEAK_DISTANCE_PX`. They chose to ship only the threshold change for now, to see how it performs against real data before touching the second parameter — consistent with this module's pattern of incremental, user-confirmed tuning rather than changing multiple knobs at once.

## Verification

- Synthetic sweep of `THRESHOLD_FACTOR` (1.0 → 3.0) on two clump shapes: foreground pixel count drops monotonically as expected.
- Confirmed the underlying distance-transform peaks are real (not a test artifact) via direct `peak_local_max` calls at different `min_distance` values on the same mask.
- Not yet verified against real microscopy data — `THRESHOLD_FACTOR=1.3` is a prototype default, consistent with this module's existing "not yet calibrated" caveats on `BACKGROUND_BALL_RADIUS_PX` and the watershed constants.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# `cells.source_filename` — original .tif name stored as metadata

## Context

User asked to store the original `.tif` filename as metadata on a cell. `cells_from_tif` (`api/main.py`) already accepts the upload as a FastAPI `UploadFile`, so the original client filename was already available in-request via `.filename` — no new upload plumbing needed, just capturing and persisting it.

## Approach

Added `"source_filename": file.filename` to the insert dict in `cells_from_tif`'s per-box loop. Since one `.tif` upload can produce several cells (one per annotated box), every cell created from that upload gets the same `source_filename` — intentional, since they genuinely do share one source file.

The `cells` table lives in Supabase directly; this repo has no SQL migrations directory, so there's no version-controlled place to make the schema change. This environment also only has placeholder Supabase credentials, not real ones, so the column can't be added programmatically from here. Gave the user the exact `ALTER TABLE cells ADD COLUMN source_filename text;` to run themselves — this has to land before the updated `cells_from_tif` is deployed, or inserts will start failing (unknown column).

Updated the schema descriptions in `CLAUDE.md` and `docs/PRD.md` to list the new column, and in `CLAUDE.md` also corrected a stale description of `cells.auto_count`'s algorithm left over from the earlier ImageJ-pipeline rework (it still described the old DoG/CLAHE approach).

Did not add a frontend display for `source_filename` — the request was framed as storing metadata, not surfacing it in the UI, so left that as a follow-up question rather than assuming scope.

## Verification

- `python -m py_compile api/main.py`: passes.
- No live-database verification possible in this environment (no real Supabase credentials) — flagged as an open gap the user needs to close (run the `ALTER TABLE`) before this can be deployed and actually tested end-to-end.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# `cells.source_filename` surfaced on the Cells screen sidebar

## Context

Follow-up to the prior entry (`cells.source_filename` added as backend metadata): user asked to actually show the original `.tif` filename on the sidebar for a cell, i.e. the Cells screen's `#detail-panel`.

## Approach

`renderDetail` in `app.js` (inside `wireCells`) already builds the sidebar's HTML from a `cell` object and conditionally includes rows for optional fields (`cell.auto_count` is the existing precedent). Followed that pattern: added a conditional `detail-row` for `cell.source_filename`, positioned above "Average hand count" since it's identifying metadata about the cell rather than a count statistic, using the same CSS classes as the rest of the panel so no new styles were needed.

Since local dev mode (`local:` token) uses hardcoded test data rather than a live API response, added `source_filename` to a couple of the test cells so the new UI is actually exercisable without a real backend/database.

## Verification

Per this project's "screenshot-verify UI layout" convention, ran the app rather than just trusting the diff: no project-specific run skill existed for this static site, so served it with `python -m http.server` and drove it with Playwright's Python API (this environment didn't have `chromium-cli`, the normally-preferred driver, installed). Navigated the real click path — Experiments → a condition → Cells → click a cell card — and confirmed via an actual screenshot (not just innerHTML) that "Source file: Image_43391.tif" renders in the sidebar in the right position with the right styling, and that it's correctly absent for a cell without a source filename. No console errors during the run.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Watershed moved before the hand-count image too, not just auto-count

## Context

User asked to run watershed before the hand-count image as well. Previously `preprocess_for_hand_count` (stored as `cells.image_url`) stopped after background subtraction + threshold — deliberately, per an earlier explicit instruction that the hand-count image should be "taken after the first two steps" of the 5-step spec. This request reverses that: the hand-count image should now include watershed's droplet separation too, presumably because the clumping the user reported earlier is exactly what watershed is meant to fix, and it wasn't visible in the image researchers actually look at.

## Approach

The two pipelines (`preprocess_for_hand_count`'s 2-step version and `count_droplets`'s full 5-step version) already shared their first two steps as separate functions (`subtract_background`, `threshold_binary`). Extending the hand-count image through watershed meant they'd now be identical end-to-end, so rather than keeping two near-duplicate functions, consolidated into one shared segmentation step: `segment_droplets(plane)` runs the full chain once and returns a labeled region array; `render_hand_count_image(labels)` and `count_droplets(labels)` are both thin views over that same result (a binary render and a filtered region count, respectively).

The key mechanical change enabling the visual effect: `watershed(..., watershed_line=True)`. Without it, skimage's watershed assigns every mask pixel a nonzero label with no visible boundary between adjacent regions — fine for `count_droplets`, which only cares about region identity via `regionprops`, but useless for a human-facing image where two touching droplets need an actual visible gap to look separated. `watershed_line=True` burns that 1px gap in as label `0`, which is what makes `render_hand_count_image` show two blobs instead of one merged shape.

Restructuring this way also fixed a real performance issue introduced by the earlier ImageJ-pipeline rework: since `preprocess_for_hand_count` and `count_droplets` used to each independently call `subtract_background` (i.e. `rolling_ball`, the most expensive step in the whole pipeline), `cells_from_tif` was paying that cost twice per box. With `segment_droplets` computed once and shared, it's back to once per box.

## Verification

- Confirmed with a synthetic well-separated 2-droplet pair that `segment_droplets`'s raw label output has a visible 1px zero-valued line between the two regions, and that `render_hand_count_image` renders that line as black in the binary output — the actual behavior the user asked for.
- Re-ran the tight 3-droplet clump from the `THRESHOLD_FACTOR` investigation to confirm this change doesn't accidentally paper over the previously-identified `MIN_PEAK_DISTANCE_PX` limitation: it doesn't — clumps where the distance transform never produces multiple markers still render as one unbroken blob, since there's nothing for `watershed_line` to split between. That's expected and unchanged; still a known follow-up if the user wants it addressed.
- `python -m py_compile api/detection.py api/main.py`: passes.
- Not yet verified against a real sample crop or real hand-count data — still consistent with this module's "prototype defaults, not yet calibrated" status.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Count screen: red dot markers + zoom-in for closely-clustered droplets

## Context

User asked for two changes to the Count screen: turn the numbered count markers into small red dots, and add a zoom feature so small droplets sitting close together can be counted accurately.

## Approach

- **Red dots:** drop the per-marker index number entirely — `.count-marker` becomes a small solid red circle with no text content, since the number was only ever there to label the button, not convey information the user needs once it's an unlabeled tally mark.
- **Zoom:** resize `#count-frame`'s real `width`/`max-width` via inline styles (100%–300%, 50% steps) rather than a CSS `transform: scale()`. This keeps the existing click-to-place math (`getBoundingClientRect()`-based percentage offsets) correct at any zoom level with no changes, since the element's actual rendered box is what changes, not just its visual appearance. `.count-canvas`'s existing `overflow: auto` then provides panning for free once the frame genuinely overflows it.
- Refactored marker add/remove away from the screen's full `innerHTML` re-render (`refreshCount()`) to targeted DOM patches, since re-rendering the whole screen on every click would otherwise reset scroll position and zoom controls mid-count — directly undermining the reason to zoom in in the first place (counting a tight cluster one click at a time).

## Verification

- Ran the app end-to-end via Playwright's Python bindings (no `node`/`chromium-cli` in this environment) rather than just reading the diff, per this project's screenshot-verification convention.
- Caught a real bug this way: the first pass didn't actually zoom anything — `.canvas-frame`'s default `flex-shrink: 1` let `.count-canvas` (a flex container) silently shrink the "zoomed" frame back down to fit, so it never overflowed and there was nothing to pan. Found via direct `getBoundingClientRect()`/`scrollWidth` measurement, not just eyeballing a screenshot (visually the frame still filled its space either way). Fixed with `flex-shrink: 0`.
- Also fixed a related flexbox trap: `.count-canvas`'s default centered alignment (`align-items`/`justify-content: center`) makes part of an overflowing child unreachable by scroll (the browser can't scroll to the negative offset needed to reach the centered content's near edge). Added `.count-canvas.is-zoomed { align-items/justify-content: flex-start }`, toggled whenever zoom > 100%.
- After both fixes: measured the frame's rendered width scaling correctly (880px → 1320px → 1760px across 100/150/200%), confirmed genuine horizontal overflow and panning via `scrollLeft` (`.count-canvas` scrolls horizontally; vertical overflow instead grows the whole page since `.count-canvas` has no fixed height — expected, not a bug), confirmed marker removal preserves zoom state (no full re-render), and confirmed the zoom buttons disable correctly at the 100% floor and 300% ceiling. No console errors through the full interaction.

## Final step (per project convention)

`docs/tasks.md` Phase 8 updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Un-shared watershed between hand-count image and auto-count

## Context

The immediately prior change (see previous plan entry) consolidated the hand-count image and auto-count into a single shared `segment_droplets` computation, since both had converged on running the exact same 5-step pipeline. The user then asked to reverse that: watershed for the hand-count image should be exclusive to that stored image, and the auto-count pipeline should independently start from its own subtract-background + threshold pass rather than reusing the hand-count's watershed result. Before implementing, explained both pipelines back to the user to confirm the request was understood correctly, since this is a case where the "obviously more efficient" shared version was explicitly not what was wanted.

## Approach

Reverted `segment_droplets(plane) -> labels` (one function, two consumers) back into two independent full-pipeline functions: `render_hand_count_image(plane)` and `count_droplets(plane)`. Each calls `subtract_background` and `threshold_binary` itself — these two step-functions stay shared as building blocks (they're pure, stateless transforms with no reason to duplicate their logic), but each pipeline invokes them independently rather than one call feeding both consumers. Each then runs its own fill-holes → watershed pass on its own mask instance.

Kept a private `_fill_and_watershed(mask, watershed_line)` helper for the fill-holes/distance-transform/watershed mechanics, since duplicating that code verbatim in both functions would be pure repetition with no benefit — the point of the user's request was that the two pipelines shouldn't share a *computed result*, not that the *code* implementing watershed had to be textually duplicated. `render_hand_count_image` calls it with `watershed_line=True` (needs the visible gap for the rendered image); `count_droplets` calls it with `watershed_line=False` (doesn't need a visible gap, just region identity for counting).

`api/main.py`'s `cells_from_tif` now calls both functions separately again, each on the same `normalized_crop` input but computing its own result independently — reintroducing the double `rolling_ball` cost per box that the prior change had eliminated. Flagged this explicitly rather than silently reintroducing a known-eliminated inefficiency, but didn't second-guess the request — the user was explicit about wanting independence, and that's a reasonable priority (each pipeline can be tuned or changed later without touching the other).

## Verification

- Synthetic 2-droplet pair test (reused from the prior entry): confirmed `render_hand_count_image` still shows the watershed split line and `count_droplets` still correctly returns `2` after being un-shared — the refactor didn't silently break either pipeline.
- Re-ran empty-array/flat-crop edge cases through both functions independently.
- `python -m py_compile api/detection.py api/main.py`: passes.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---
---

# Plan: Phase 6d — Three-dot edit/remove menu on Experiments, Conditions, and Cells cards

## Context

Experiments, Conditions, and Cells all render as `.folder-card` grids (`renderExperimentsHTML`/`renderConditionsHTML`/`renderCellsHTML` in `app.js`) with an "Add"-style modal per screen (`openAddExperimentModal`/`openAddConditionModal`, plus `navigate('addphotos')` for Cells) but no way to edit or delete an existing item once created. The user asked for a three-dot menu at the top-right of each card with Edit (metadata popup) and Remove (confirmation popup) actions, across all three screens.

No `PUT`/`DELETE` endpoints exist yet for `experiments`/`conditions`/`cells` themselves (only `DELETE /counts/{id}` exists, for individual hand counts) — these need to be added to `api/main.py`.

## What to build

### `api/main.py` — new endpoints

- `PUT /experiments/{id}` (reuses `ExperimentBody`) / `DELETE /experiments/{id}` — delete manually cascades `counts` → `cells` → `conditions` → the experiment, since DB-level cascade isn't confirmed
- `PUT /conditions/{id}` (reuses `ConditionBody`) / `DELETE /conditions/{id}` — cascades `counts` → `cells` → the condition
- `PUT /cells/{id}` (new `CellUpdateBody`, `name` only — the rest of a cell's fields are pipeline-written) / `DELETE /cells/{id}` — deletes `counts` then the cell, then calls `recompute_condition_icc`
- All reuse `owned_experiment`/`owned_condition`/`owned_cell` for the same 404-not-403 ownership check every other route uses

### `app.js` — shared card-menu machinery, then per-screen wiring

- `cardMenuHTML(id)` / `wireCardMenus(grid, { onEdit, onRemove })` / `closeAllCardMenus` / `openConfirmModal({ title, message, confirmLabel, onConfirm })` — one shared implementation, reused by all three screens rather than duplicated three times. The dropdown toggle uses `stopPropagation` so it doesn't also trigger the card's own click-to-select; a single document-level "click closes any open menu" listener is torn down/reattached per render, same pattern as `wireShell`'s `escHandler`
- `openEditExperimentModal`/`openEditConditionModal`/`openEditCellModal` — each mirrors its screen's existing Add-modal pattern (same fields, same local-test-vs-API branching) but pre-fills from the existing item and calls `PUT` instead of `POST`
- `deleteExperiment`/`deleteCondition`/`deleteCell` — call the new `DELETE` endpoint (or mutate the `TEST_EXPERIMENTS`/`TEST_CONDITIONS` fixtures directly for local test accounts), then re-run the screen's `init*()` to refresh

### `style.css`

`.card-menu`/`.card-menu-btn`/`.card-menu-dropdown`/`.card-menu-item`/`.card-menu-item-danger` for the menu itself; `.modal-confirm-message`/`.modal-danger` for the reusable confirm modal (reuses `.modal`/`.modal-form`/`.modal-actions` rather than a new modal variant); `padding-right` added to `.folder-name` so long names don't run under the new button.

## Verification

Serve the site locally (`python -m http.server`) and drive it with Playwright's Python bindings against a real Chrome install (`channel="chrome"`) — no Node/npm/chromium-cli in this environment. Log in with the local test account, and on each of Experiments/Conditions/Cells: open the ⋮ menu, Edit → confirm fields prefill and Save updates the card, Remove → confirm the confirmation modal names the right item and removal actually removes it. Screenshot at each step (not just a DOM dump, per the standing project lesson from the Phase 7 refinement) and check for console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 6d added and checked off. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.

---

# Plan: Login boot-popup (Render cold-start notice)

## Context

Render's free tier spins the API down after inactivity; the first request after idle can take 30-60s to wake it. The user asked that if login takes longer than 3 seconds, a popup tell them to wait 1-2 minutes while the site boots up.

## Approach

- `app.js` — add `showBootPopup()`/`hideBootPopup()` helpers that inject/remove a small overlay (mirrors the existing `.modal-backdrop`/`.modal` pattern rather than inventing a new UI system)
- In the login submit handler's real-API branch (`mode === 'login'`, after the local `test-accounts.json` shortcut has already returned), start `setTimeout(showBootPopup, 3000)` right before the `api('/auth/login', ...)` call, and clear the timer + hide the popup in a `finally` so it's dismissed on both success and failure
- `style.css` — add `.boot-popup-backdrop`/`.boot-popup`, styled like the existing modal but with a higher `z-index`

## Verification

Read through the control flow to confirm the timer always gets cleared. Not screenshot-verified against a real cold Render instance (can't force a 30-60s cold start in this environment) — recommend the user do a manual check after a period of Render inactivity.

## Final step (per project convention)

`docs/tasks.md` Phase 2 item added and checked off. Activity entry appended to `docs/activity.md`. This plan entry appended to `docs/plan.md`.
