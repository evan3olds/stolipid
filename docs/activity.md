# Activity Log

## Phase 1 — Foundation ✓

**Status:** Complete

### Frontend scaffold created

- `index.html` — shell HTML with Google Fonts (IBM Plex Sans, IBM Plex Mono, Newsreader) and a `<div id="app">` mount point
- `style.css` — Paper theme CSS tokens (`--bg`, `--accent`, `--font-body`, `--font-mono`, `--font-heading`) and base resets
- `app.js` — `RENDER_API_URL` constant and `api()` fetch helper that attaches a Bearer token from `localStorage` on every request; empty `navigate()` skeleton

### Architecture decisions locked in

- The frontend calls Render's API only — no Supabase JS client in the browser
- Render (Python) is the sole service that reads/writes Supabase
- Supabase schema, RLS policies, and storage setup belong in the Render/Python repo, not here

### Verified

- `index.html` opens in browser with no console errors
- No Supabase CDN script present in the page source

---

## Phase 2 — Auth ✓

**Status:** Complete

### Login screen built

- `app.js` — `renderLogin()` renders the login card (eyebrow, heading, username/password fields, submit button, error area) and wires the form submit handler
- `app.js` — `renderExperimentsStub()` renders a placeholder shell with a "Log out" link, standing in for Phase 4's real Experiments screen
- `app.js` — `navigate()` now routes between `'login'` and `'experiments'`; on boot, checks `localStorage.getItem('token')` to decide which screen to show first
- `style.css` — added `.login-screen`, `.login-card`, `.login-field`, `.login-submit`, `.login-error`, and `.app-shell` styles in the Paper theme

### Auth flow

- Login submits to `api('/auth/login', { method: 'POST', body: { username, password } })` — reuses the existing Render `api()` helper unchanged
- On success: stores `{ token }` in `localStorage`, navigates to the Experiments stub
- On failure: displays "Login failed. Check your username and password." in the error area
- Logout clears the stored token and returns to the login screen
- Added `POST /auth/login` to `tasks.md` Phase 11 — this endpoint doesn't exist on the Render side yet, so login will fail against the real backend until it's built

### Verified

- Login screen renders correctly (Paper theme colors, fonts, layout) — confirmed via headless Chrome screenshot
- Submitting credentials against the still-placeholder `RENDER_API_URL` fails as expected and shows the inline error message
- Pre-setting a token in `localStorage` and reloading skips the login screen and shows the Experiments stub
- Logout clears the token and returns to the login screen
- Empty-field submission is blocked by native HTML `required` validation before it reaches `api()`

---

## Phase 3 — Core Navigation ✓

**Status:** Complete (chrome only — Experiments/Graph/Raw Data/About/Help remain stubs pending their own phases)

### Persistent authenticated shell built

- `app.js` — introduced a `state` object (`{ screen, experiment, condition }`), a `CONFIG` props holder (`appTitle`, `prototypeBadge`), a `SCREENS` metadata map (per-screen title / primary-action label / back-button flag), and a `NAV_LINKS` list for the drawer
- `app.js` — reworked `navigate(screen, params)` to update `state` then dispatch: `login` renders the bare login card; all other screens render through `renderShell()`, which swaps only the content region while the chrome persists
- `app.js` — `renderShell()` composes `topbarHTML()`, `subheaderHTML()`, a content `screenStub()`, and `sidebarHTML()`, then wires events in `wireShell()`
- `app.js` — removed the old `renderExperimentsStub()`; the generic `screenStub()` now backs every not-yet-built screen
- `style.css` — replaced the temporary `.app-shell` styles with full shell chrome (`.topbar`, `.badge`, `.avatar`, `.hamburger`, `.subheader`, `.breadcrumb`/`.crumb`, `.primary-action`, `.back-btn`, `.content`, and the `.sidebar`/`.sidebar-backdrop` drawer with a `translateX` slide transition)

### Chrome behavior

- **Top bar:** app title from `CONFIG.appTitle`, "Prototype" badge (toggled by `CONFIG.prototypeBadge`), hamburger button, and a user-avatar circle showing the logged-in user's initial (parsed from the stored token)
- **Sidebar drawer:** slides in over a translucent backdrop; links route via `navigate()` and close the drawer; backdrop click and Esc also close it. The Esc handler lives on `document` and is detached before each re-render to avoid accumulation. Active screen is highlighted
- **Subheader:** breadcrumb built from `state` (`Experiments` → experiment → condition), with earlier crumbs clickable to navigate up; right-aligned primary action button whose label is context-sensitive per screen (no-op handlers this phase — real behavior lands with each screen's phase)
- **Back button:** rendered only on Conditions and Cells screens; steps one level up the hierarchy (Cells → Conditions → Experiments)

### Verified

- Headless-Chrome screenshots (temporary `_verify.html` harness, since removed): the Experiments shell renders correctly in the Paper theme — top bar, breadcrumb, "Add experiment" action, content stub
- Deep-screen check: navigating to Cells with a seeded experiment/condition shows the full breadcrumb and "Add photos" action; opening the drawer dims the backdrop and lists all five nav links plus Log out
- Fixed a layout bug found during verification — sidebar nav links flowed inline and wrapped; added `flex-direction: column` to `.sidebar-nav` so they stack

---

## Phase 4 — Experiments Screen ✓

**Status:** Complete (frontend only — reads/writes go to Render API which is not yet deployed; error state renders cleanly when API is unreachable)

### Experiments grid and detail panel built

- `app.js` — `initExperiments()`: async screen initializer called from `navigate()` after `renderShell()`; fetches `GET /experiments`, renders the grid, or shows an error state if the API is unreachable
- `app.js` — `renderExperimentsHTML(experiments)`: returns the two-column layout HTML (folder-card grid + hidden detail panel aside)
- `app.js` — `wireExperiments(experiments)`: single-click selects a card and populates the detail panel; double-click navigates to the Conditions stub with correct breadcrumb; Enter key support on cards for keyboard navigation
- `app.js` — `wireExperimentsAction()`: wires the "Add experiment" primary-action button in the subheader; separated so it runs in both the success and error paths
- `app.js` — `openAddExperimentModal(onSuccess)`: appends a modal overlay to `document.body`; form fields Name/Date/Dye/Notes; POSTs to `api('/experiments')`; on success closes modal and re-runs `initExperiments()`; on failure shows inline error and re-enables Save
- `app.js` — `escHtml()` and `formatDate()` helpers added; `navigate()` updated to call `initExperiments()` for the experiments screen; removed the no-op primary-action stub from `wireShell()`
- `style.css` — added `.experiments-layout` (flex row), `.folder-grid` (auto-fill grid), `.folder-card` with pseudo-element folder tab and selected/hover states, `.detail-panel` (sticky right column, hidden until `.visible`), `.detail-name/.detail-row/.detail-label/.detail-value/.detail-notes/.detail-open-btn`, `.loading-state/.error-state/.empty-state`, and full modal styles (`.modal-backdrop`, `.modal`, `.modal-header`, `.modal-form`, `.modal-field`, `.modal-error`, `.modal-actions`, `.modal-cancel`, `.modal-save`)

### API shape assumed (Render, Phase 11)

- `GET /experiments` → `[{ id, name, date, dye, notes, condition_count }]`
- `POST /experiments` → `{ name, date, dye, notes }`

---

## Phase 5 — Conditions Screen ✓

**Status:** Complete (frontend only — reads/writes go to Render API which is not yet deployed; error state renders cleanly when API is unreachable)

### Shared layout generalized

- `style.css` — renamed `.experiments-layout` → `.folder-layout` (no rule changes) so Conditions, and later Cells (Phase 6), reuse the same grid + detail-panel shell instead of duplicating it
- `app.js` — `renderExperimentsHTML()` updated to use `.folder-layout`

### Conditions grid and detail panel built

- `app.js` — `initConditions()`: async screen initializer called from `navigate()`; uses `TEST_CONDITIONS[state.experiment.id]` for local test-account logins, otherwise fetches `GET /experiments/{id}/conditions`
- `app.js` — `renderConditionsHTML(conditions)` / `wireConditions(conditions)`: folder cards show name, dye, starvation length, cell count; single-click populates the detail panel; double-click / "Open condition" navigates to the Cells stub with the full breadcrumb
- `app.js` — `iccQualityLabel(icc)`: maps ICC to Poor/Moderate/Good/Excellent using the standard Koo & Li (2016) buckets (`<0.5`, `0.5–0.75`, `0.75–0.9`, `>0.9`); renders as a pill next to the numeric ICC value
- `app.js` — `renderMiniScatterSVG(conditions)` + `conditionMean()` / `truncateLabel()`: static inline-SVG preview chart — one column per condition **in the current experiment** (per PRD 5.3, not just the selected condition), per-cell average dots with deterministic jitter, a mean tick per column; no interactivity (that's Phase 9's Graph screen)
- `app.js` — `openAddConditionModal(onSuccess)`: mirrors the Phase 4 modal pattern; fields Name/Dye/Starvation (number, hours)/Notes; POSTs to `api('/experiments/{id}/conditions')`
- `app.js` — `TEST_CONDITIONS` fixture added (3 conditions under `test-exp-001`, each with per-cell averages) so the full screen — grid, ICC pill, mini chart — is exercisable via the local test-account login without the Render API deployed
- `style.css` — added `.icc-pill` + tier variants (`-none/-poor/-moderate/-good/-excellent`), `.mini-chart`/`.mini-chart-svg`/`.mini-chart-dot`/`.mini-chart-mean`/`.mini-chart-label`

### API shape assumed (Render, Phase 11)

- `GET /experiments/{id}/conditions` → `[{ id, name, dye, starvation, notes, icc, cells: [{ id, name, average }] }]`
- `POST /experiments/{id}/conditions` → `{ name, dye, starvation, notes }`

### Verified

- Static assets (`index.html`, `app.js`, `style.css`, `docs/test-accounts.json`) served correctly over a local `python -m http.server` (all 200, expected content/sizes)
- Manual trace of the new control flow (`navigate` → `initConditions` → `renderConditionsHTML`/`wireConditions` → detail panel + mini chart) against the `TEST_CONDITIONS` fixture; bracket/brace/paren counts in `app.js` balanced as a syntax sanity check
- **Not verified in an actual browser** — this environment has no Node.js, `chromium-cli`, or Playwright install, so the click-through (select a condition, open the modal, confirm the mini chart renders) could not be visually confirmed this session. Recommend opening `index.html` locally (or via a static server) and logging in with a `docs/test-accounts.json` account to confirm before treating this phase as fully done.

---

## Phase 6 — Cells Screen ✓

**Status:** Complete (frontend only — reads/writes go to Render API which is not yet deployed; error state renders cleanly when API is unreachable)

### Data model correction (small Phase 5 refactor)

- Per CLAUDE.md/PRD, `cell.average` is derived from hand counts, never stored. Phase 5's `TEST_CONDITIONS` fixture had shortcut it by hardcoding `average` directly on each cell — Phase 6 needed real per-count data (to list and delete individual counts), so this got fixed at the source:
  - `app.js` — added `cellAverage(cell)`: mean of `cell.counts[].value`, `null` if empty
  - `app.js` — `conditionMean()` and `renderMiniScatterSVG()` (both Phase 5) now call `cellAverage(cell)` instead of reading `cell.average`, and filter out cells with no counts yet so they don't plot as zero
  - `app.js` — `TEST_CONDITIONS` fixture cells now carry `counts: [{ id, value }, …]` (0–3 entries) instead of a flat `average` number. The `test-exp-001` / `0 Hr Starved` condition got a 4th cell added specifically so all four card states (0/1/2/3 counts) are exercisable within a single condition

### Cells grid and detail panel built

- `app.js` — `initCells()`: async screen initializer; local-test path reads `TEST_CONDITIONS[experiment].cells` scoped to `state.condition`, otherwise fetches `GET /conditions/{id}/cells`
- `app.js` — `renderCellsHTML(cells)` / `wireCells(cells)`: reuses the shared `.folder-layout` grid + detail panel; cards show a thumbnail, name, and a status-tag pill (`cellCountStatus()`: "needs count" / "N counts")
- `app.js` — `renderCellThumbnailSVG(cell)` + `seededRandom()` / `hashStringToInt()`: deterministic inline-SVG placeholder — green droplets on a dark rect, seeded by cell id so the same cell always renders the same fake thumbnail across re-renders. Real image rendering is Phase 11's job once `image_url` is populated
- Detail panel (`renderDetail()` inside `wireCells`): prominent average (`cellAverage()`, "—" if no counts), a list of individual counts each with a × delete button, and a "Count" CTA button shown only when `counts.length < 3`
- Deleting a count (`deleteCount()`): local-test mode mutates the fixture cell's `counts` array in place; API mode calls `DELETE /counts/{id}` first. Either way it re-renders the detail panel and live-updates the card's status tag (`updateCardStatus()`) — no confirmation dialog, matching the rest of the prototype's lack of delete-confirmation UI elsewhere
- "Count" CTA → `navigate('count', { cell })`; "Add photos" primary-action button → `navigate('addphotos')`. Both are new `SCREENS` entries with only a `title` (no `back`/`action`) so they fall through to the existing generic `screenStub()` — Phase 7/8 build the real full-screen destinations, which per PRD 5.5/5.6 are likely full-screen layouts that bypass the standard shell chrome entirely (like Login does), so back-button wiring for them was deliberately left for those phases
- `app.js` — `state.cell` added alongside `state.experiment`/`state.condition`; `navigate()` now accepts a `cell` param and dispatches `initCells()` for the `cells` screen
- `style.css` — added `.cell-thumbnail`/`.cell-thumb-svg`/`.cell-thumb-bg`/`.cell-thumb-droplet`, `.status-tag` + `-needs`/`-counted` variants, `.detail-average`, `.count-list`/`.count-list-item`/`.count-delete-btn`, `.count-cta-btn`

### API shape assumed (Render, Phase 11)

- `GET /conditions/{condition_id}/cells` → `[{ id, name, image_url, counts: [{ id, value, counted_by, created_at }] }]`
- `DELETE /counts/{id}`

### Verified

- Brace/paren/backtick counts in `app.js` and brace counts in `style.css` balanced as a syntax sanity check (no Node.js available in this environment to run a real parser)
- Manual trace of `navigate` → `initCells` → `renderCellsHTML`/`wireCells` → detail panel/thumbnail/status-tag/delete flow against the updated `TEST_CONDITIONS` fixture, covering all four count states (0/1/2/3) seeded on the `0 Hr Starved` condition
- **Not verified in an actual browser** — same environment limitation as Phase 5 (no Node.js, `chromium-cli`, or Playwright). Recommend opening `index.html` locally, logging in with a `docs/test-accounts.json` account, and clicking through Experiments → the seeded experiment → "0 Hr Starved" → Cells to confirm thumbnails render, status tags are correct, and count deletion live-updates the average and tag before treating this phase as fully done.

### Refinement: confirm before deleting a count

- `app.js` — clicking a count's × no longer deletes immediately. It swaps that `<li>` in place for a "Delete this count?" prompt with Cancel/Delete buttons; Cancel re-renders the detail panel back to normal, Delete calls the existing `deleteCount()` flow
- `style.css` — added `.count-confirm-label`, `.count-confirm-actions`, `.count-confirm-btn` (danger-colored), `.count-cancel-btn`

---

## Phase 7 — Add Photos Screen ✓

**Status:** Complete (frontend only — the two Render endpoints this phase assumes don't exist yet; local test accounts get a fully working simulated pipeline instead)

### Full-screen annotation tool built

- `app.js` — `navigate()` now special-cases `addphotos` the same way it already special-cases `login`: `renderAddPhotos()` replaces `#app` entirely, bypassing `renderShell()`/the authenticated chrome (top bar, sidebar, breadcrumb) — this was flagged as the expected shape back in the Phase 6 entry
- `app.js` — `addPhotosState` is a screen-local object (`{ files: [{ id, name, rawFile, status, previewSvg, boxes: [{ id, x, y, w, h }] }], activeFileId }`), reset every time `renderAddPhotos()` mounts; box coordinates are stored as 0–100 percentages of the canvas frame so they're resolution-independent and don't depend on pixel layout
- `renderAddPhotosHTML()` / `renderAddPhotosSidebarHTML()` / `renderAddPhotosCanvasHTML()` / `wireAddPhotos()` / `refreshAddPhotos()` — render/wire the top bar (condition name, instructions, Cancel, "Create N cells"), the file sidebar, and the canvas; `refreshAddPhotos()` does a full re-render on every state change **except** drag/resize, which mutate the box element's inline style directly per `mousemove` for smooth dragging and only commit to `addPhotosState` on drop (nothing else needs to re-render mid-drag)

### File handling and preview rendering

- `addPhotoFile(file)`: appends a new file entry immediately (status `loading`), then renders its preview:
  - Local test token: synthesizes a deterministic full-frame simulated fluorescence SVG via a new `renderPhotoPreviewSVG(name)` (mirrors Phase 6's `renderCellThumbnailSVG` — same `seededRandom`/`hashStringToInt` seeded-by-name pattern, just a bigger frame with more droplets), status flips to `ready` synchronously
  - Real token: POSTs the raw file to the (not-yet-deployed) `POST /conditions/{id}/tif-preview` via a new `apiUpload()` helper — a dedicated multipart fetch, since the existing `api()` always JSON-encodes its body and can't send a `FormData`/file. On success shows the returned `preview_url` as an `<img>`; on failure that file's status flips to `error` and the sidebar/canvas show an inline "Could not render preview" message scoped to just that file
- Sidebar supports adding more files after the first batch ("+ Add files"), not just an initial pick

### Box interactions

- Click on the canvas frame (not on an existing box) → `addBoxAt()` adds a box centered at the click point, default 20%×20%, clamped to the frame
- `startBoxDrag()` / `startBoxResize()` — attach `mousemove`/`mouseup` listeners to `document` on `mousedown` and remove them on drop, same cleanup discipline as the existing `escHandler` pattern in `wireShell`; resize is triggered from a corner handle with `stopPropagation` so it doesn't also start a drag
- `removeBox()` splices the box out and box labels are recomputed from array position, so remaining boxes always renumber contiguously (1, 2, 3, …)

### Confirm flow

- "Create N cells" reflects the live total across all files and is disabled at 0
- Local test token: `confirmAddPhotos()` pushes one new cell per box directly into `TEST_CONDITIONS[experiment][condition].cells`, named `Cell N` continuing the existing sequence, then navigates to Cells — no network calls
- Real token: for each file with boxes, POSTs the original file + a `boxes` JSON array (percentage rects) to the assumed `POST /conditions/{id}/cells/from-tif` via `apiUpload()`; navigates to Cells only if every file succeeds, otherwise shows an inline error and leaves the user on the screen with their annotations intact
- "Cancel" discards `addPhotosState` entirely and returns to Cells

### API shapes assumed (Render, Phase 11 — added to `tasks.md`)

- `POST /conditions/{id}/tif-preview` (multipart `.tif`) → `{ preview_url }` — preview only, no DB writes
- `POST /conditions/{id}/cells/from-tif` (multipart: original `.tif` + `boxes: [{x, y, width, height}]` as 0–100 percentages) → crops each region server-side, uploads to `cell-images`, creates one `cells` row per box with `image_url` set

### Verified

Built a temporary headless-Chrome harness (`_verify_addphotos.html`, removed after use — same pattern as the Phase 3 `_verify.html`) that drove the full flow programmatically (Chrome is present in this environment even though Node/npm/Playwright are not): logged in as a local test account → Experiments → seeded experiment → "0 Hr Starved" → Cells → Add Photos. Confirmed: "Create cells" is disabled with 0 files; two simulated files load with `ready` status; three canvas clicks produce three numbered boxes and the sidebar count updates to match; dragging a box changes only its `x`/`y`; resizing via the corner handle changes only its `w`/`h`; removing the middle box renumbers the remaining two to 1, 2; switching files shows each file's boxes independently and preserves them when switching back; "Create 2 cells" pushes 2 new cells into the condition fixture (`Cell 5`, `Cell 6`, continuing from the existing 4) and returns to the Cells screen, where the new cards render correctly with "needs count" status.

This initial pass only inspected the DOM structure/state (no screenshot), which missed a real rendering bug — caught afterward when the user reported the sidebar and top bar were entirely invisible during actual use.

### Refinement: sidebar/top bar invisible (absolutely-positioned SVG escaping its thumbnail)

- Root cause: `renderPhotoPreviewSVG()`'s output is reused verbatim in both the canvas (`.canvas-frame`, which has `position: relative`) and the sidebar thumbnail (`.addphotos-file-thumb`, which didn't). `.photo-preview-svg` is `position: absolute; inset: 0`, so inside the thumbnail — with no positioned ancestor — it resolved against the viewport instead, rendering full-screen and painting over the static in-flow top bar/sidebar content (positioned elements paint above static ones regardless of DOM order)
- Confirmed visually with a headless-Chrome `--screenshot` capture (not just a DOM dump) — the fix was to add `position: relative` to `.addphotos-file-thumb` so the thumbnail correctly contains its preview image; re-screenshotted to confirm the top bar and sidebar are now both visible
- Lesson for future phases with absolutely-positioned children: DOM-structure verification isn't sufficient for layout bugs — take an actual screenshot

---

## Phase 8 — Count Screen ✓

**Status:** Complete (frontend only — the new assumed Render endpoint doesn't exist yet; local test accounts get a fully working simulated pipeline instead)

### Full-screen dark-mode counting interface built

- `app.js` — `navigate()` now special-cases `count` the same way it already special-cases `login`/`addphotos`: `renderCount()` replaces `#app` entirely, bypassing the authenticated shell
- `app.js` — the Cells screen's "Count" CTA (`wireCells()` → `renderDetail()`) now passes `image_url` through in the `navigate('count', { cell })` call, so real (non-local) cells can eventually show their actual processed image once Phase 11 populates it; local test cells have no `image_url` and fall back to a simulated frame
- `app.js` — `countState` is a screen-local object (`{ cell, markers: [{ id, x, y }] }`), reset every time `renderCount()` mounts — same lifetime convention as Phase 7's `addPhotosState`. Marker coordinates are 0–100 percentages of the frame marking the marker's **center** (CSS `transform: translate(-50%, -50%)`), unlike `photo-box`'s top-left anchor
- `renderCountHTML()` / `wireCount()` / `refreshCount()` — render/wire the dark top bar (cell name, "Total: N", Cancel/Done), and the canvas frame; reuses Phase 7's `renderPhotoPreviewSVG(seed)` unchanged, called with `cell.id` as the seed, and reuses the existing `.canvas-frame`/`.photo-preview-svg`/`.photo-preview-img` classes as-is (already dark-styled and generic)
- `addMarkerAt()` / `removeMarker()`: click the frame background to add a numbered marker at the click point; click an existing marker (`stopPropagation` so it doesn't also add a new one underneath) to remove it. Markers renumber contiguously by array position on removal, same convention as Phase 7's box renumbering. No drag/resize — PRD 5.6 only calls for place/remove, simpler than Phase 7's box interactions
- `finishCount()`: value is `countState.markers.length`. Local test token mutates the real fixture cell (found via `TEST_CONDITIONS[experiment][condition].cells`) by pushing a new `{ id, value }` onto its `counts` array; real token POSTs to the new assumed `POST /cells/{id}/counts` endpoint. Either way, success navigates back to Cells, which re-reads the same fixture/API data the Phase 6 detail panel and status tag already depend on. On failure, an inline error shows and the user stays on-screen with markers intact (same non-destructive-error convention as `confirmAddPhotos`)
- Unlike Add Photos' "Create N cells" (disabled at 0 boxes), **Done stays enabled at 0 markers** — a hand count of zero lipid droplets is a legitimate scientific measurement, not a meaningless no-op
- `style.css` — added `.count-screen`/`.count-topbar`/`.count-cell-name`/`.count-total`/`.count-topbar-actions`/`.count-error`/`.count-canvas`/`.count-marker`, plus a **new dedicated** `.count-cancel-btn` ghost-button style rather than reusing `.modal-cancel` — `.modal-cancel` hard-codes a near-white hover background with `color: inherit`, which would repeat the exact invisible-content bug from the Phase 7 refinement above if used on this dark screen

### API shape assumed (Render, Phase 11 — added to `tasks.md`)

- `POST /cells/{id}/counts` (body `{ value }`) → creates a `counts` row (`cell_id`, `value`, `counted_by` from auth context, `created_at` default), returns the created count object

### Verified

Screenshot-verified per the standing lesson from the Phase 7 refinement above (DOM/state checks alone previously missed a real invisible-content bug). Logged in with a local test account → Experiments → seeded experiment → "0 Hr Starved" → Cells → "Cell 1" → Count: confirmed the dark screen renders with visible cell name, "Total: 0", visible Cancel/Done buttons, and a visible simulated fluorescence frame (nothing invisible against the dark background). Three frame clicks placed three numbered, correctly-positioned markers and "Total: 3" updated; removing marker #2 renumbered the remaining two to 1, 2 without also placing a new marker underneath; "Done" returned to Cells with the new count reflected in the status tag and average; a 0-marker "Done" correctly saved a count of value 0 (confirming Done is not disabled at zero); "Cancel" mid-count discarded markers and returned to Cells unchanged; counting a cell up to 3 counts correctly hid its "Count" CTA back on the Cells screen.

---

## Phase 9 — Graph Screen ✓

**Status:** Complete (frontend only, read-only — reuses the Phase 5 assumed endpoints, no new Render endpoints needed)

### Interactive scatter built inside the authenticated shell

- `app.js` — `navigate()` now calls `initGraph()` for the `graph` screen, alongside the existing `experiments`/`conditions`/`cells` dispatch — unlike Add Photos/Count, Graph stays inside the standard shell (no back button, no subheader primary action; the sidebar's own controls do the work)
- `graphState` — screen-local state reset every `initGraph()` mount: `{ conditionsCache, selectedExperimentId, selected, colorAssignments }`. `selected` is the ordered list of `{ conditionId, conditionName, experimentId, experimentName, cells }` currently plotted
- Sidebar: an Experiment `<select>` (first `<select>` in the codebase — prior modals only used text/date/textarea) and a Condition `<select>` populated on `change`, with an **"All conditions" sentinel option** (`__all__`) in place of a separate button — per a mid-review change, one "Add to graph" button reads the condition select's value and either adds every condition of the chosen experiment or just the one picked
- Selected-conditions list below the controls, each row removable via `×`; removing re-renders both the list and the chart

### Color-by-series (consulted the `dataviz` skill before writing any chart code)

- Series = **experiment**, not condition. `seriesColorForExperiment()`: if only one experiment is currently represented in `selected`, every dot/mean-tick uses the plain `--accent` color and no legend renders — same treatment as the Phase 5 mini-chart. As soon as a second experiment is added, every column switches to the skill's validated 8-slot categorical palette (`--series-1`…`--series-8` in `style.css`), assigned in fixed first-seen order and cached in `graphState.colorAssignments` so a removed-then-re-added experiment keeps its original color rather than being reassigned
- Converted the app's actual Paper background (`oklch(0.965 0.008 75)` → `#f7f3ee`) to compare against the skill's documented contrast numbers, since no Node.js runtime was available in this environment to run `validate_palette.js` directly. The three slots the skill already flags as sub-3:1 on its own `#fcfcfb` surface (aqua, yellow, magenta) remain sub-3:1 here too — mitigated the same way the skill prescribes: direct column labels (condition + experiment name under every column) plus the Raw Data screen (Phase 10) as the accessible table view, rather than color alone
- Column labels double as direct labels regardless of legend state; the legend (swatch + experiment name) only appears once ≥ 2 experiments are mixed

### Chart + tooltip

- `renderGraphScatterSVG()` — larger fluid SVG than the Phase 5 mini-chart (900×420 viewBox), one column per selected condition, y-axis gridlines/ticks/"Lipid droplets / cell" label, per-cell dots (jittered like the mini-chart to avoid full overlap) carrying `data-experiment`/`data-condition`/`data-cell`/`data-counts`/`data-average` attributes read directly by the tooltip handler, and a colored mean tick per column
- `wireGraphTooltip()` — attaches `mouseenter`/`mousemove`/`mouseleave` per dot (re-wired on every chart re-render, matching this codebase's existing re-query-after-innerHTML convention rather than a single delegated listener), positioning one shared `#graph-tooltip` div (`position: fixed`, `pointer-events: none`) from the hovered dot's `data-*` attributes

### Local test data extended

Added a second `TEST_EXPERIMENTS` entry ("Oleic Acid Loading Panel", Nile Red, 2 conditions) purely so the multi-experiment color/legend path is exercisable via the local test account — same precedent as Phase 6 extending fixtures to hit new UI states. This experiment is also browsable end-to-end through Experiments/Conditions/Cells since it shares the same fixture tables.

### Verified

No Node.js/npm/Playwright/chromium-cli in this environment, but Chrome itself is installed, so verification used a temporary headless-Chrome harness (`_verify_graph*.html`, removed after use) served over `python -m http.server`, driving `navigate()`/`graphState` directly as globals and dispatching synthetic `change`/`click`/`MouseEvent`s, screenshotted via `chrome.exe --headless=new --virtual-time-budget=...` (needed a dedicated `--user-data-dir` — without one, Chrome silently forwarded the URL to the already-running GUI Chrome instead of actually launching headless):

1. Fresh visit to Graph — empty state ("No data — add a condition from the sidebar to begin."), condition select and "Add to graph" both disabled until an experiment is chosen
2. Added all 3 conditions of "Serum Starvation Timecourse" — three columns, dots/mean-ticks in plain `--accent`, no legend
3. Added a condition from "Oleic Acid Loading Panel" — a 4th column appears in a distinct color (green), a legend row appears with both experiment names and correctly colored swatches
4. Hovered a dot — tooltip correctly read "Serum Starvation Timecourse / 0 Hr Starved / Cell 2 / Counts: 4 / Average: 4.0", matching that cell's fixture data exactly
5. Removed the Oleic Acid entry via its selected-list `×` — chart reverted to the single remaining condition, dot color reverted to `--accent`, legend disappeared

---

## Phase 10 — Raw Data Screen ✓

**Status:** Complete (read-only, frontend only — reuses the Phase 5/9 assumed endpoints, no new Render endpoints needed). Scope grew beyond the base PRD §5.8 table during planning: sorting and a filter input were added at the user's request.

### Flat, sortable, filterable table built

- `app.js` — `navigate()` now calls `initRawData()` for the `rawdata` screen, alongside the existing `experiments`/`conditions`/`cells`/`graph` dispatch — stays inside the standard shell like Graph (no back button, no subheader primary action)
- `rawDataState` — screen-local state reset every `initRawData()` mount (same lifetime convention as `graphState`/`addPhotosState`): `{ rows, sortKey, sortDir, filterText }`. `rows` is a flat array of `{ experimentName, conditionName, cellName, counts, average }`, one per cell across **every** experiment/condition — unlike Graph's user-selected subset, this is a full cross-join computed once at load
- `initRawData()`: local-test path builds `rows` from `TEST_EXPERIMENTS` × `TEST_CONDITIONS[expId]` × `cond.cells` directly (no network calls); real-API path calls `api('/experiments')` then fans out with `Promise.all` over `api('/experiments/{id}/conditions')` per experiment (a new access pattern — prior screens only ever fetched one experiment's conditions at a time) before flattening the same way. Either path reuses `cellAverage()` unchanged. Failure at either the experiments or conditions fetch renders the shared `.error-state`
- `renderRawDataHTML()` / `renderRawDataRowsHTML()` / `renderRawDataHeaderCellHTML()` — builds the filter input, a `<table>` (first one in the codebase) with a sticky `<thead>`, and a `<tbody>` of one `<tr>` per row; missing counts render as `—`; the average cell wraps its value in `<span class="rawdata-average">` (accent-colored, per PRD §5.8) only when a cell has at least one count
- Two distinct empty states: zero rows across all experiments ("No cells recorded yet.") vs. zero rows after filtering ("No rows match your filter.") — the filter input stays visible in the second case so it's obvious a filter is active and can be cleared

### Sorting and filtering (scope added mid-planning at user request — not in the original PRD §5.8)

- `RAWDATA_COLUMNS` — ordered column metadata (`key`, `label`) driving both the header row and the per-row cell order
- `visibleRawDataRows()` — pure derivation from `rawDataState`: applies the live filter (case-insensitive substring match across experiment/condition/cell name) then the active sort, without mutating the source `rows` array
- Sorting: clicking a `<th>` (or Enter/Space when focused — same `role="button" tabindex="0"` + keydown convention as the folder-card grids in Experiments/Conditions/Cells) toggles ascending → descending on repeat clicks of the same column, or resets to ascending on a new column. Text columns sort via `localeCompare`; numeric columns (`count1`/`count2`/`count3`/`average`) sort numerically. **Missing values always sort to the bottom regardless of direction** — a deliberate choice so cells with no counts yet don't jump to the top under descending sort
- `refreshRawDataTable()` re-renders only the `<tbody>` and the header sort-arrow text on every filter keystroke or header click — same "re-render the minimal region" convention as `refreshGraphChartArea()`/`refreshAddPhotos()`, not a full-screen re-render
- `style.css` — added `.rawdata-screen`/`.rawdata-filter`/`.rawdata-table-wrap`/`.rawdata-table` (sticky header, zebra striping, mono font reserved for the numeric count/average columns only — name columns use the default body font, matching the `.detail-value` convention elsewhere)/`.rawdata-th-sortable` (hover tint, focus outline)/`.rawdata-average`/`.rawdata-empty`

### Verified

Screenshot-verified via a temporary headless-Chrome harness (`_verify_rawdata.html`/`_verify_rawdata2.html`, removed after use, served over `python -m http.server`) — per the standing project convention, not just a DOM dump:
1. Logged in with the local test account → Raw Data renders all 15 cells across both fixture experiments in a sticky-header table; a 0-count cell shows `—` in every count column and no average
2. Clicked the Average header twice (ascending, then descending) — confirmed descending order by value with the one null-average row correctly pinned to the bottom rather than jumping to the top
3. Typed "Starved" into the filter — table narrowed to only the Serum Starvation Timecourse rows (all three "N Hr Starved" conditions), correctly excluding the Oleic Acid Loading Panel's "Untreated"/"Oleic Acid 24hr" conditions; sort state from the prior step was preserved through the filter

### Refinement: both-arrows-by-default sort indicator

- Every column header now shows both a muted ▲ and ▼ stacked (via a new `rawDataSortArrowsHTML(col)` helper) so it's discoverable that any column is sortable, not just the currently-active one. Once a column becomes the active sort, only the arrow matching the current direction remains, in accent color — the other arrow is omitted rather than just dimmed further, so the direction reads unambiguously at a glance
- `renderRawDataHeaderCellHTML()` and `refreshRawDataTable()` both now call the shared helper instead of each having their own inline arrow logic (previously duplicated)
- `style.css` — added `.rawdata-sort-arrows` (stacked flex column, small gap) and `.rawdata-sort-arrow`/`.rawdata-sort-arrow.active`
- Screenshot-verified: unsorted columns (Experiment, Condition, Cell, Count 1–3) show both muted arrows stacked; after clicking "Average" once, it shows only an accent-colored ▲ while every other column still shows its muted pair
- Follow-up fix: at the original `gap: 1px`/`line-height: 0.6`, the two stacked arrows nearly touched and read as a single merged blob rather than two distinct triangles at normal table-header size (only visible by screenshotting at 10x device-scale-factor — invisible at a normal screenshot resolution). Increased to `gap: 3px` with `line-height: 1` on each arrow individually (removed the squeezing line-height from the wrapper) so the two triangles render as clearly separate shapes stacked one above the other

---

## Phase 11 — Python API (Render) — started

**Status:** In progress. Project scaffolded and deployed with a live Supabase connection; individual endpoints assumed by Phases 4–9 are not implemented yet.

### Project scaffold (`api/`)

- `api/main.py` — FastAPI app with permissive CORS (`allow_origins=["*"]`, flagged in-file to tighten to the GitHub Pages origin later); a Supabase client created from `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env vars; `GET /` health check; `GET /cells` (unscoped, returns all rows — a first smoke-test endpoint, not one of the shapes assumed by the frontend phases)
- `api/requirements.txt` — `fastapi`, `uvicorn`, `supabase`, `python-multipart`
- `api/.env.example` — documents the two required env vars

### Render ↔ Supabase connection live

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set in Render's environment variables, so the deployed service can reach Supabase with the service-role key (server-to-server, per the CLAUDE.md architecture — the frontend still never talks to Supabase directly)

### Not yet done

- None of the specific endpoints assumed by Phases 4–9 exist yet: `POST /auth/login`, `POST /conditions/{id}/tif-preview`, `POST /conditions/{id}/cells/from-tif`, `POST /cells/{id}/counts`, ICC computation, or the `experiments`/`conditions` CRUD endpoints
- `app.js`'s `RENDER_API_URL` constant has not been pointed at the live Render URL yet — the frontend still degrades to its error states / local test-account fixtures against this deployment
- `GET /cells` is unscoped and doesn't match any endpoint shape the frontend assumes (Cells is always fetched scoped to a condition) — likely a placeholder to be replaced or removed once real endpoints land

---

## Phase 11a — Render API: Auth + Core CRUD Endpoints

**Status:** Auth plus every non-image CRUD endpoint the frontend assumes is implemented in `api/main.py`. The `.tif` image pipeline (preview render, crop-to-cells) and ICC computation are still not built — separate follow-up task, since they need `tifffile`/`Pillow`/`pingouin` image work rather than plain CRUD.

### Endpoints added (`api/main.py`)

- `POST /auth/login` — `supabase.auth.sign_in_with_password({"email": username, "password": password})` (the login form's "Username" field is a Supabase Auth email, per PRD §8.3); returns `{ token: session.access_token }`; 401 on bad credentials
- `get_current_user` dependency — reads the `Bearer` token, calls `supabase.auth.get_user(token)` to validate it and return the Supabase user; 401 on missing/malformed header or invalid/expired token (network errors talking to Supabase during validation also degrade to 401 rather than a 500)
- `GET /experiments` / `POST /experiments` — list scoped to `created_by = user.id`; `condition_count` flattened out of a PostgREST embedded `conditions(count)` select; create sets `created_by` from the authenticated user
- `GET /experiments/{id}/conditions` / `POST /experiments/{id}/conditions` — list does one nested select (`conditions(*, cells(*, counts(*)))`-shaped) to return the whole subtree in one round trip, matching the shape Phases 5/6 already assumed
- `GET /conditions/{id}/cells` — same nested-select pattern for `cells(*, counts(*))`
- `POST /cells/{id}/counts` / `DELETE /counts/{id}` — insert sets `counted_by` from the authenticated user; delete looks up the count's owning cell first for the ownership check

### Per-researcher scoping

Render authenticates to Supabase with the service-role key, which bypasses RLS (per CLAUDE.md), so `api/main.py` enforces "only your own experiment tree" in application code instead: `owned_experiment(id, user_id)` / `owned_condition(id, user_id)` / `owned_cell(id, user_id)` each walk up to the owning experiment and raise a 404 (not 403, to avoid revealing that a resource exists under someone else's account) if the row isn't there or isn't owned by the requesting user. Every route besides `/` and `/auth/login` calls one of these before touching data.

### Removed

- The placeholder `GET /cells` (unscoped, didn't match any shape the frontend assumes) — replaced by the real `GET /conditions/{id}/cells`.

### Verification

No Supabase credentials are available in the dev environment (`api/.env` is gitignored, not present locally), so this couldn't be run against the real project directly. Instead:

- Built a throwaway venv, installed `api/requirements.txt`, and imported `main.py` with placeholder `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env vars — confirmed the app boots and all 8 new routes register with the right methods/paths
- Ran `TestClient` assertions against that same import: `GET /` → 200; `GET /experiments` and `POST /experiments` with no `Authorization` header → 401; `GET /experiments` with a garbage bearer token → 401 (including the case where `get_user()` fails on a network error against the placeholder URL — confirmed it degrades to 401 rather than crashing); `POST /auth/login` with a body missing `password` → 422 from Pydantic validation; `DELETE /counts/{id}` with a bad token → 401
- Real end-to-end verification (login with a real Supabase Auth account, confirming per-researcher scoping with two accounts, full create/read/delete round trips against live data) still needs to happen against the actual Supabase project after this deploys to Render — flagged back to the user, not done in this session

---

## Phase 11b — Render API: `.tif` Image Pipeline + ICC

**Status:** All remaining Phase 11 items are done. The `.tif` render/crop pipeline and automatic ICC computation are implemented and locally verified (the image-processing and stats math have no Supabase dependency, so — unlike Phase 11a — these could actually be exercised end-to-end without live credentials).

### `api/imaging.py` (new)

Pure functions, no Supabase/network dependency:
- `render_tif_to_image(tif_bytes)` — `tifffile.imread()`, reduces to a single 2D plane (documented assumption: single-channel BODIPY captures, not multi-channel composites or z-stacks — a 3D array takes the first plane along its smallest axis; anything that can't reduce to 2D raises `ValueError`), contrast-normalizes via a 1st/99.5th-percentile stretch to `uint8`, applies the green false-color LUT (intensity into the green channel only), returns a `PIL.Image`
- `encode_png(image)` — PNG bytes
- `crop_percent(image, x, y, width, height)` — converts 0–100 percentages to a clamped pixel rect and crops

### `api/main.py` additions

- `upload_png(path, image)` — encodes + uploads to the (already-existing, public) `cell-images` Supabase Storage bucket, returns the public URL. Preview renders go to `previews/{condition_id}/{uuid}.png`, cell crops to `cells/{condition_id}/{uuid}.png` — same bucket, prefixed so the two purposes don't collide
- `POST /conditions/{id}/tif-preview` — render-only, no DB writes, per the frontend's own comment at app.js:1198; returns `{ preview_url }`; a bad/corrupt `.tif` → 400 (`render_tif_to_image`'s `ValueError`)
- `POST /conditions/{id}/cells/from-tif` — renders once, crops per box (`BoxPct` Pydantic model, each field `0–100`), uploads each crop, and creates one `cells` row per box named `Cell {n}` continuing from the condition's existing cell count (same numbering convention the Phase 7 local-fixture path already uses)
- `compute_icc(cells)` — pure function (extracted specifically so it's testable without Supabase): only includes cells with **exactly 3 counts** (pingouin's ANOVA-based estimator wants a fully-crossed balanced design; a still-in-progress cell shouldn't count against a condition's reliability), needs ≥ 2 such cells or returns `None`, otherwise builds a long-format `pandas` frame (rater slot 1–3 assigned by each cell's count `created_at` order) and reads pingouin's `ICC(C,k)` row — two-way mixed, average of the 3 fixed count slots, consistency (not absolute agreement), matching `cell.average` already being the mean of those same 3 slots
- `recompute_condition_icc(condition_id)` — fetches cells+counts, calls `compute_icc`, writes the result to `conditions.icc`
- **Trigger design:** nothing in `app.js` ever calls a dedicated ICC-trigger endpoint — it just expects `conditions.icc` to already be populated on `GET .../conditions`. So `recompute_condition_icc` is called automatically at the end of `create_count`/`delete_count`, keeping it self-updating. Also exposed as `POST /conditions/{id}/recompute-icc` (satisfies tasks.md's literal "endpoint" wording; not required for normal app usage)

### `api/requirements.txt`

Added `tifffile`, `pillow`, `numpy`, `pingouin` (the last pulls in `pandas`/`scipy`/`statsmodels` transitively — a noticeably heavier install than Phase 11a's, worth keeping in mind given Render's free-tier cold-start/build-time constraints already noted in CLAUDE.md).

### Verification

Unlike Phase 11a, this work has no Supabase dependency and was genuinely exercised locally end-to-end (in a throwaway venv — deleted after use):

- `render_tif_to_image`/`encode_png`/`crop_percent` against a synthetic in-memory `.tif` (a numpy gradient with a deliberate hot-pixel outlier): confirmed the output is a valid RGB PNG of the correct size, red/blue channels are all zero, the percentile stretch correctly clips the hot pixel (green channel spans exactly 0–255 rather than being crushed by the outlier), and `crop_percent` produces correctly-sized crops including clamped edge cases (a box past the 100% boundary, a zero-size box clamped to 1×1)
- `compute_icc` against synthetic rater data: a high-agreement dataset (raters within ~1 of each other per cell, cells clearly distinct) → `ICC(C,k) > 0.99`; a low-agreement dataset (raters wildly disagree per cell) → `ICC(C,k) < 0` (as expected — worse than chance); a mix of complete (3-count) and incomplete cells → the incomplete ones are correctly excluded while the complete ones still produce a value; fewer than 2 complete cells → `None`
- Caught a real bug this way: initially matched on the `Type` string `"ICC3k"` (an older pingouin naming convention), but the installed pingouin 0.6.1 actually labels rows `"ICC(C,k)"` — the test caught this immediately (`compute_icc` returned `None` for data that obviously should've produced a high ICC) rather than it silently shipping as a no-op that always wrote `null` to `conditions.icc`
- `TestClient` regression pass: all Phase 11a assertions still hold (no import/route breakage from the new code), plus the three new routes (`tif-preview`, `cells/from-tif`, `recompute-icc`) all correctly 401 with no/garbage auth
- Environment note: the local venv creation initially failed with "No space left on device" (system disk was nearly full, unrelated to this task) — resolved after the user freed space. A second, unrelated snag: the system's default `py` now resolves to Python 3.14, for which `pydantic_core` doesn't yet have a compatible wheel; the venv had to be pinned to `py -3.13` explicitly
- Not verifiable locally: an actual `.tif` through the deployed Render service, a real image appearing in the Add Photos canvas, ownership/404 checks against a real owned/not-owned condition, and a real condition's `icc` populating after 3-count cells exist — all need the live Supabase project, same limitation as Phase 11a, flagged back to the user

---

## Phase 11c — Automated Droplet Count Suggestion (`cells.auto_count`)

**Status:** Backend done — `cells_from_tif` now writes an automatic per-cell droplet count suggestion at creation time. No frontend UI surfaces it yet (not in scope this pass — see `docs/tasks.md`). Confirmed with the user first: runs automatically (not on-demand), analyzes the image in memory before the lossy display-PNG compression step (no new persisted image format needed), and produces a count only (no marker coordinates) — the user ran the schema change directly and named the column `auto_count`.

### `api/imaging.py` — split the render pipeline

`render_tif_to_image(tif_bytes)` was a single lossy pipeline (load → percentile-stretch → green LUT) with no way to get at the pre-stretch data. Split into `load_tif_plane(tif_bytes)` (raw float64 2D plane, no normalization) and `render_display_image(plane)` (the existing stretch/LUT logic, now taking a plane instead of raw bytes); `render_tif_to_image` is now a thin wrapper composing the two, so `tif-preview` didn't need to change at all. Added `crop_array_percent(plane, x, y, width, height)` — the same pixel-rect math as the existing `crop_percent`, but slicing a numpy array instead of a `PIL.Image`, so the analysis crop and display crop stay spatially aligned for the same box.

### `api/detection.py` (new)

`count_droplets(plane)`: Gaussian blur (denoise) → Otsu threshold (automatic foreground/background split) → Euclidean distance transform on the binary mask → local maxima of the distance transform as watershed seeds → `skimage.segmentation.watershed` → `regionprops`, filtered by a minimum area, counted. Pure function, no Supabase dependency — same rationale as `imaging.py`'s original split (testable in isolation, and this is exactly what caught a real bug this time too).

**Bug caught by the local test:** the initial version fed `peak_local_max` the *raw* distance transform directly. For two touching/overlapping synthetic droplets, the raw distance transform has a shallow local maximum right on the saddle ridge between the two true centers (distance-to-background only marginally lower than the real peaks), so `peak_local_max` found 3 seeds instead of 2 — a classic watershed over-segmentation artifact. Fixed by smoothing the distance map (`scipy.ndimage.gaussian_filter`, `sigma=1.5`) before peak-finding, while still running the actual watershed flood on the *unsmoothed* distance map (smoothing the elevation surface itself would blur real droplet boundaries, not just suppress spurious peaks). Two tunable constants (`MIN_DROPLET_AREA_PX`, `MIN_PEAK_DISTANCE_PX`) are prototype defaults, not calibrated against real microscopy images.

### `api/main.py` — `cells_from_tif`

Now calls `load_tif_plane` once instead of `render_tif_to_image`, derives the display image via `render_display_image(plane)`. Per box: keeps the existing `crop_percent` for the display crop/upload, adds `crop_array_percent` + `count_droplets` for the analysis crop, and includes `auto_count` in the `cells` insert alongside `condition_id`/`name`/`image_url`. Since `GET /conditions/{id}/cells` and `GET /experiments/{id}/conditions` both already `select("*", ...)` on `cells`, the new column flows through to the frontend automatically — `app.js` doesn't read it yet, that's future work.

### Schema

User ran (via the Supabase dashboard, not something this pipeline can do itself): `alter table cells add column auto_count integer;`. `CLAUDE.md`'s `cells` schema line updated to match, with a note that `auto_count` is machine-suggested and excluded from `cell.average`/`condition.icc`.

### `api/requirements.txt`

Added `scipy` (explicit now — was only pulled in transitively via `pingouin` before) and `scikit-image` (new).

### Verification

Same "pure algorithm, no Supabase needed" pattern as Phase 11b's ICC work — genuinely exercised locally:

- `count_droplets` against synthetic Gaussian-bump "droplets": 4 well-separated blobs → count 4 (robust across 5 random noise seeds); a flat/constant crop → 0; an empty array → 0
- The touching-pair case specifically validates watershed is doing something, not just the threshold step: two overlapping blobs (which a plain threshold+`regionprops` merges into a single connected component — confirmed as a sanity check, that naive path returns 1) → `count_droplets` correctly returns 2, both before and after the smoothing fix described above
- `load_tif_plane`/`render_display_image`/`crop_array_percent` alignment: confirmed `render_tif_to_image` (used by `tif-preview`) is still exactly equivalent to the new two-step composition (regression check), and that `crop_array_percent` and the existing `crop_percent` agree on pixel dimensions for identical box percentages, including the same edge-clamp cases tested in Phase 11b
- `TestClient` regression pass: all prior Phase 11a/11b route assertions still hold, confirming the `imaging.py` refactor and new `detection.py` import didn't break anything else in `main.py`
- Not verifiable locally: real `auto_count` values against actual microscopy `.tif`s (no sample data in this environment to calibrate `MIN_DROPLET_AREA_PX`/`MIN_PEAK_DISTANCE_PX` against), and confirming the `auto_count` column round-trips through the real Supabase table — needs the user, after deploying

---

## Phase 11c follow-up — Surface `auto_count` on the Cells screen

- `app.js`'s `renderDetail(cell)` (Cells screen detail panel) now shows an "Auto count" row between "Average hand count" and "Hand counts," rendered only when `cell.auto_count != null` (so cells without it — e.g. every `local:` test-account fixture cell except the two seeded below, or any real cell created before this backend feature shipped — don't show an empty/misleading row). Reuses the existing `.detail-row`/`.detail-label`/`.detail-value` classes, no new CSS
- Seeded `auto_count` on two `TEST_CONDITIONS` fixture cells (`test-cell-001`: 3, no hand counts yet; `test-cell-003`: 5, alongside its 2 existing hand counts) so the new row is exercisable via the local test account, matching the project's established convention of extending fixtures to hit new UI states

---

## Bug fix — Add Photos crop cutting off part of the cell

**Symptom:** boxes drawn around a cell in the Add Photos canvas, fully containing the cell on screen, still produced a crop with part of the cell missing after `cells/from-tif`.

**Root cause:** `.canvas-frame` (`style.css`) is hardcoded to `aspect-ratio: 8 / 5` with `.photo-preview-img { object-fit: cover }`. The preview PNG served by `tif-preview` is a full-resolution, unresized render of the source `.tif` — whatever aspect ratio the microscopy capture actually has. Whenever that ratio isn't 8:5, `object-fit: cover` silently crops the *displayed* image to fill the frame (e.g. trims the left/right or top/bottom edges), but box coordinates are recorded as percentages of the frame and sent to the backend as-is. `crop_percent`/`crop_array_percent` (`api/imaging.py`) apply those percentages against the full, uncropped original — so a box that visually bounds the cell in the letterbox-free but *cover*-cropped preview maps to a shifted/scaled rectangle in the real image, cutting off whatever the display had already trimmed away. The local `local:` test account never surfaced this because its simulated SVG preview has a fixed 640×400 (exactly 8:5) viewBox, so `cover` never actually cropped anything there.

**Fix (`app.js`):** after `tif-preview` returns, preload the preview PNG with `new Image()` to read `naturalWidth`/`naturalHeight`, store it as `entry.aspectRatio`, and set `.canvas-frame`'s `aspect-ratio` inline to that value in `renderAddPhotosCanvasHTML` (falling back to the CSS default `8 / 5` while loading or for `local:` fixtures). With the frame's aspect ratio always matching the actual image, `object-fit: cover` no longer crops anything — it's a uniform scale — so frame-relative box percentages line up exactly with the image percentages the backend crops against.

### Verification

Not verifiable end-to-end locally (needs a real non-8:5 `.tif` through the deployed Render service, which this environment doesn't have). Reasoned through the fix by hand: for an image narrower/taller than 8:5, `cover` previously cropped the sides; a box drawn to fully bound a cell near an edge in that cropped view would translate to backend percentages that overshoot the actual cell in the true image. With the frame ratio matched, the same box's frame-relative percentages now equal the image-relative percentages 1:1, matching what `crop_percent` assumes. Flagged to the user to confirm against a real oddly-proportioned capture after deploying.

---

## Display rendering — green false-color LUT → grayscale

Per user request, `render_display_image` (`api/imaging.py`) no longer applies the green false-color LUT to the BODIPY channel. It still does the same 1st/99.5th-percentile contrast stretch to `uint8`, but now returns a single-channel `PIL.Image` in `"L"` (grayscale) mode instead of building an `(H, W, 3)` RGB array with the intensity only in the green channel. `render_tif_to_image`, `encode_png`, `crop_percent`, and `crop_array_percent` are all unaffected (none of them assume a specific channel count/mode). Updated the two places that documented the old behavior as current design: `CLAUDE.md`'s Python API section and the `api/main.py` `.tif` pipeline comment. Left `docs/PRD.md`, `docs/tasks.md`, and earlier `docs/activity.md`/`docs/plan.md` entries untouched — those are historical records of what shipped in Phase 11, not living documentation of current behavior.

### Verification

Not verifiable end-to-end locally (no live Render deployment or Supabase project in this environment, same limitation as prior `.tif`-pipeline work). By inspection: `Image.fromarray(normalized, mode="L")` with `normalized` already a 2D `uint8` array is a valid grayscale `PIL.Image`, and `PNG` supports `"L"` mode natively, so `encode_png`/Storage upload need no changes. Flagged to the user to confirm the rendered preview/cell images look correct (grayscale, not green) after deploying.
- Screenshot-verified (not just a DOM dump, per the standing Phase 7 lesson) via Playwright driving the system's installed Chrome (`chromium-cli` and Node weren't available in this environment, so used the Python `playwright` package pointed at `chrome.exe` directly, no browser download needed) against a local `python -m http.server`: logged in with the `test`/`test` local account, navigated to the seeded experiment's "0 Hr Starved" condition, selected Cell 1 (needs count, no hand counts) → panel shows "Auto count 3" above "No counts yet."; selected Cell 3 (2 hand counts) → panel shows "Auto count 5" above the hand-count list (3, 2), with "Average hand count 2.5" still correct above it. No console errors. Confirms no layout overlap/collision between the new row and the existing Average/Hand counts rows

---

## Login screen — email label, create account, forgot password

**Request:** the Login screen said "Username" instead of "Email", and had no way to create an account or reset a forgotten password.

### Frontend (`app.js`, `style.css`)

- `renderLogin(mode)` now takes a mode (`'login'` | `'signup'` | `'forgot'`) instead of always rendering the same fixed form. The username field is gone — all three modes share a single `type="email"` field labeled "Email" (`autocomplete="email"`), matching what the backend already expected (see below). `login`/`signup` also show a password field (`autocomplete="new-password"` for signup vs `current-password` for login); `forgot` shows only email
- Below the submit button, `login` mode shows two new `.login-link` buttons — "Forgot password?" and "Create account" — that swap the form to the other two modes; `signup`/`forgot` show a single "Back to log in" link instead
- `signup` posts to a new Render endpoint `POST /auth/signup`; if the response includes a `token` (Supabase project has email confirmation disabled) it logs straight in, otherwise shows "Check your email to confirm your account, then log in." in a new `.login-message` area
- `forgot` posts to a new `POST /auth/reset-password`; always shows the same generic confirmation message regardless of outcome, so the UI itself doesn't leak whether an email is registered
- `docs/test-accounts.json`'s fixture account changed from `{ username: "test" }` to `{ email: "test@example.com" }` to match; the local-account fallback check in `renderLogin` now matches on `email`
- `style.css` — added `.login-message` (green confirmation text) and `.login-links`/`.login-link` (underlined inline text buttons, `--accent` colored)

### Backend (`api/main.py`)

- `LoginBody.username` renamed to `LoginBody.email` (the field was already being passed to Supabase as `email` — this was a display-only mismatch, not a behavior change)
- Added `POST /auth/signup` (`SignupBody { email, password }`) — calls `supabase.auth.sign_up`; returns `{ token }` if Supabase returns a session immediately, else `{ message }` prompting email confirmation
- Added `POST /auth/reset-password` (`ResetPasswordBody { email }`) — calls `supabase.auth.reset_password_for_email`, swallowing any exception so the response is identical whether or not the email exists

### Verification

- `python -m py_compile api/main.py` passes
- Screenshot-verified all three modes (`login`, `signup`, `forgot`) via a temporary `_verify_login.html` harness (`renderLogin(mode)` called directly, served over `python -m http.server`, removed after use) — Paper theme renders correctly, no layout issues, links show/hide per mode as expected
- Screenshot-verified the full local-account login round trip end-to-end: a second temporary harness (`_verify_login_flow.html`, also removed) pre-filled `test@example.com`/`test` and dispatched the form's `submit` event programmatically (headless Chrome can't type/click), confirming the `docs/test-accounts.json` email-based match still logs in and lands on the Experiments screen with both fixture experiments visible
- Not verifiable end-to-end: the real `/auth/signup`/`/auth/reset-password` calls against live Supabase (no deployed Render/Supabase project in this environment) — flagged to the user to confirm behavior (especially whether their Supabase project has email confirmation enabled, which determines whether signup logs straight in or shows the "check your email" message) after deploying

## Final step (per project convention)

`docs/tasks.md` updated (Phase 2 checklist item added for the two links; Phase 11 endpoint list updated for the renamed/added auth endpoints; removed "Password reset UI" from the Future/out-of-scope list since it's now implemented). This entry appended to `docs/activity.md`. No plan was written to `docs/plan.md` ahead of time — this was a small, well-scoped UI + matching-endpoint change implemented directly rather than planned first.

---

## Bug fix — Count screen still showing a mis-cropped image

**Report:** after the earlier Add Photos canvas-frame aspect-ratio fix, the image still looked wrong ("not cropping properly") specifically on the cell count page.

**Root cause:** the earlier fix (see the "Add Photos crop cutting off part of the cell" entry above) only matched `#canvas-frame`'s aspect ratio to the source image while *drawing* boxes, which does make the crop sent to the backend correct. But `renderCountHTML`'s `#count-frame` — the counting screen that displays the resulting `cell.image_url` crop — reuses the same `.canvas-frame` class and never set an aspect ratio at all, so it fell back to the CSS default `aspect-ratio: 8 / 5`. Since a per-box crop's aspect ratio is whatever the user drew (rarely exactly 8:5), `object-fit: cover` cropped it *again* purely for display on the count screen — so even a correctly-cropped `cell.image_url` could appear to have part of the cell missing there.

**Fix (`app.js`, `wireCount`):** after mount, find the `<img class="photo-preview-img">` inside `#count-frame` and set the frame's `aspect-ratio` inline from `img.naturalWidth`/`naturalHeight` (immediately if already `img.complete`, otherwise on `load`) — the same approach as `addPhotoFile`'s fix for the Add Photos canvas, applied to the second place that reuses `.canvas-frame` with a real image. The `local:` test-account / no-`image_url` fallback (`renderPhotoPreviewSVG`, fixed 640×400 = 8:5 viewBox) is untouched and still matches the CSS default, so no aspect mismatch there.

### Verification

Not verifiable end-to-end locally (no live Render/Supabase project in this environment, so no real `cell.image_url` with a non-8:5 aspect ratio to test against). By inspection: `img.naturalWidth`/`naturalHeight` reflect the actual PNG's pixel dimensions regardless of how the `<img>` is laid out, so setting the frame's `aspect-ratio` from those values makes `object-fit: cover` a no-op crop (uniform scale only) on the count screen, mirroring the Add Photos fix. Flagged to the user to confirm against a real cropped cell image after deploying.

---

## Bug fix — Password-reset email link didn't show a reset form

**Report:** clicking the "reset your password" link in the email redirects to `https://evan3olds.github.io/stolipid/#access_token=...&expires_at=...&expires_in=3600&refresh_token=...`, but the app just showed the normal login screen — no way to actually set a new password.

**Root cause:** `POST /auth/reset-password` correctly triggers `supabase.auth.reset_password_for_email`, and Supabase's default (implicit-flow) redirect puts the new session directly in the URL *fragment* rather than a query string or route. `app.js`'s boot line (`navigate(localStorage.getItem('token') ? 'experiments' : 'login')`) never looked at `window.location.hash` at all, so the token was silently ignored and the user always landed on the ordinary login screen with no indication anything had happened.

**Fix:**
- `app.js`: boot now parses `window.location.hash` first. If it contains `access_token`, the hash is stripped from the URL (`history.replaceState`) and then: `type=recovery` renders a new `renderResetPassword(accessToken)` screen (new password + confirm fields, client-side match check, posts to `/auth/update-password` with the recovery token as the bearer, then stores the token and navigates to Experiments on success); any other `access_token` (e.g. a signup-confirmation redirect) is treated as an already-valid session and logs the user straight in. With no `access_token` present, boot falls through to the existing logged-in/logged-out check unchanged.
- `api/main.py`: added `POST /auth/update-password` (`UpdatePasswordBody { password }`). It reuses the existing `get_current_user` dependency to validate the bearer token (works for a recovery `access_token` the same way it works for a normal session token, since both are validated via `supabase.auth.get_user`), then sets the new password via the service-role admin client (`supabase.auth.admin.update_user_by_id`) rather than trying to establish a server-side session from the recovery token.

### Verification

Installed Playwright (`pip install playwright && playwright install chromium`) and drove the static site (`python -m http.server`) headlessly, one fresh browser context per case to force a real top-level navigation (a same-tab `page.goto` that only changes the hash is treated by Chromium as a same-document navigation and doesn't rerun the boot script — not representative of a real email link opening a fresh tab):
- `#access_token=...&type=recovery` → shows the "Set a new password" form, no login form present, hash stripped from the URL, no `token` written to `localStorage` yet, no console/page errors
- `#access_token=...&type=signup` → hash stripped, logs straight into the Experiments shell (topbar renders), `token` written to `localStorage`
- No hash, no stored token → ordinary login screen with the "Forgot password?" link intact
- Mismatched password/confirm on the reset form → client-side "Passwords do not match." error, no network call made
- Not verifiable end-to-end: the real `/auth/update-password` call against live Supabase (no deployed Render/Supabase project in this environment) — flagged to the user to confirm after deploying, especially that the Supabase project's redirect URL allow-list includes the GitHub Pages origin.

---

## Cell crop pipeline — 16-bit normalized PNG replaces display-stretched crop

**Request:** hand counting and the Cells-screen viewing image should both run off the same stored per-cell PNG that also serves as the base image for auto-count models, instead of today's split (an 8-bit percentile-stretched display crop for viewing, and a separate raw-plane crop used only transiently for `count_droplets`). Per-model processing (e.g. the existing Gaussian blur/Otsu/watershed) stays transient — computed at count time, never persisted — but the "minimal" normalization baked into the stored PNG had to be picked carefully, since after this change there's no raw `.tif` left to fall back to if it clips data.

**Approach (`api/imaging.py`):**
- `normalize_to_uint16(plane)` — linear min/max stretch of the crop's own actual min→max to fill the full 16-bit range. Chosen over a percentile clip (what `render_display_image` still does for `tif-preview`) specifically because it's a strictly monotonic, non-clipping transform: no pixel data is discarded, so `count_droplets`'s Otsu threshold + watershed give the identical result on the normalized crop as on the raw plane (verified below), while still giving good per-crop contrast for hand counting.
- `encode_png_16(plane)` — `Image.fromarray(plane.astype(np.uint16))` (PIL infers 16-bit grayscale `"I;16"` mode from the dtype) → PNG bytes. PNG natively supports 16 bits/channel, so this is lossless.
- Removed `crop_percent` (PIL-based crop of the display-rendered image) — dead code once `cells_from_tif` no longer builds a separate display crop.

**`api/main.py`:**
- `upload_png(path, png_bytes)` now takes raw bytes instead of a `PIL.Image`, so callers pick their own encoder (`encode_png` for the still-8-bit `tif-preview` render, `encode_png_16` for cell crops). `tif-preview` itself is unchanged — still `render_display_image`'s percentile-clip 8-bit render, since it's only ever used for drawing boxes, never for counting or analysis.
- `cells_from_tif`: per box, `crop_array_percent(plane, ...)` → `normalize_to_uint16` → `encode_png_16` → `upload_png` (this becomes `cells.image_url`, used for both hand counting and the Cells-screen thumbnail), and `count_droplets` now runs on that same `normalized_crop` array rather than a separate raw crop — one crop, one image, feeding both consumers.

### Verification

Confirmed against a real microscopy capture (`assets/Image_43391.tif`, user-provided): `2048×2048`, `uint16`, actual value range `147–21973` (well inside `0–65535`, no clipping needed for the full-frame case either).
- `Image.fromarray(uint16_array)` → PNG → decode round-trips bit-exact (`np.array_equal` True) — confirmed both with an explicit `mode="I;16"` (which triggers a Pillow 13 deprecation warning) and the mode-less form that infers `"I;16"` from dtype (no warning) — used the latter in `encode_png_16`.
- Rendered an actual normalized crop (center 30% of the sample frame) to a real PNG and viewed it directly: droplets are clearly visible with strong per-droplet contrast against the cell body, confirming the per-crop min/max stretch produces a usable image for hand counting, not a washed-out or near-black one.
- Ran the full new code path (`load_tif_plane` → `crop_array_percent` → `normalize_to_uint16` → `encode_png_16` → decode) against that same crop: decoded PNG bytes exactly match the in-memory `normalized_crop` array, and `count_droplets(normalized_crop) == count_droplets(raw_crop)` (57 == 57), confirming the monotonic-transform invariance claim holds in practice, not just in theory.
- Not verifiable locally: real upload/`image_url` round-trip through Supabase Storage, and browser `<img>` rendering of a 16-bit PNG served from a real URL (viewed the PNG file directly in this environment, not via an `<img>` tag against a live URL) — flagged to the user to confirm hand-counting images still display correctly after deploying.

## Final step (per project convention)

`docs/tasks.md` updated (Phase 11c note added on the crop pipeline switching to a shared normalized-16-bit-PNG base). This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md` retroactively (implemented directly after confirming the normalization approach and scope with the user via two targeted questions, rather than a separate upfront planning pass) — this was a well-scoped pipeline change to two existing files (`api/imaging.py`, `api/main.py`), not a new feature needing broader design.

---

## Deploy note — Render storage RLS error was a stale instance, not a code issue

After the above deploy, `cells_from_tif`'s Storage upload failed with `storage3.exceptions.StorageApiError: {'statusCode': 403, ... 'new row violates row-level security policy'}`. Investigated as a possible key-misconfiguration (`SUPABASE_SECRET_KEY` on Render actually being the anon key rather than service_role): user decoded the JWT's `role` claim locally (without sharing the key) and confirmed `service_role`, ruling that out. Root cause turned out to be a stale/un-redeployed Render instance — a manual redeploy fixed it with no code changes. Noting this since the `.upload()` call itself was byte-for-byte unchanged by the 16-bit-PNG work above, which was the first clue it wasn't a regression from that change.

---

## Auto-count preprocessing — background flattening + CLAHE before thresholding

**Request:** now that `cells_from_tif`'s crop is a plain linear-normalized PNG (see above) shared between hand-counting/viewing and the auto-count base image, the auto-count model needs its own additional processing before thresholding — transient, computed at count time, never persisted back to the stored PNG (per the user's original framing: "additional image processing techniques will only be used for different auto count models but not kept").

Asked the user what kind of processing; answer was both **rolling-ball background subtraction** (flattens uneven illumination/out-of-focus glow across the frame, which otherwise skews Otsu's assumption of a roughly bimodal histogram) and **CLAHE** (local contrast enhancement, to pull out droplets that are dim relative to their immediate surroundings even if the crop overall has decent contrast).

**`api/detection.py`:**
- New `preprocess_for_detection(plane)`: `skimage.restoration.rolling_ball(plane, radius=BACKGROUND_BALL_RADIUS_PX)` (new constant, `25`px — larger than a droplet, smaller than the frame's illumination-gradient scale) subtracted from the plane and clipped to `[0, 65535]`, then `skimage.exposure.equalize_adapthist(..., clip_limit=CLAHE_CLIP_LIMIT)` (new constant, `0.01`, skimage's own default). Both new constants carry the same "prototype default, not yet calibrated" caveat as the existing `MIN_DROPLET_AREA_PX`/`MIN_PEAK_DISTANCE_PX`.
- `count_droplets` calls `preprocess_for_detection` as its first step, before the existing Gaussian blur → Otsu → watershed chain (all unchanged). No call-site changes needed in `api/main.py` — `cells_from_tif` still just calls `count_droplets(normalized_crop)`.
- **Bug caught during verification and fixed before shipping:** `equalize_adapthist` on a genuinely flat/constant input (e.g. an all-background crop with no droplets) fabricates full-range contrast out of nothing — std `0.31` on an all-zero test array — which caused `count_droplets` to hallucinate droplets (56!) on what should unambiguously be a 0-count crop. This is a pure tiling/numerical artifact of adaptive histogram equalization, not signal. Fixed with an explicit degenerate-input guard in `preprocess_for_detection` (checked both before and after the background-subtraction step) that skips CLAHE and returns the flat array as-is, letting `count_droplets`'s existing `threshold_otsu` `ValueError` catch handle it exactly as before.

### Verification

- Confirmed `rolling_ball`/`equalize_adapthist` are available in the installed `scikit-image` (0.26.0); `rolling_ball` takes ~1.3s on a ~615×615 real crop, `equalize_adapthist` ~0.05s — acceptable per-box cost at cell-creation time.
- Re-ran the flat-crop, empty-array, and all-zero-crop edge cases (previously guaranteed to return 0) after the fix: all three correctly return `0` again.
- Re-ran the documented Phase 11c synthetic regression tests: 4 well-separated Gaussian-bump blobs → `count_droplets` still returns `4`; a naive threshold+`regionprops` pass (no watershed) on a touching pair still merges into a single region (`1`), confirming watershed is still doing real work.
- Investigated an apparent touching-pair regression (a hand-built synthetic pair collapsed from a claimed "2" to "1"): turned out the ad hoc test parameters didn't actually reproduce a genuine 2-way split under the *original* pre-preprocessing algorithm either (also collapsed to 1 peak) — not a real regression, just a flawed synthetic test. Rebuilt the comparison properly by sweeping blob separation and checking both algorithms against the same inputs: for separations 12–20px, original and preprocessed both correctly return `2`, identically. At the very tightest separations (10–11px — right at the original algorithm's own splitting limit), CLAHE's local contrast maximization saturates the shallow saddle between the two blobs enough that they merge into `1` where the original algorithm still split them into `2`.
- On the real sample crop (`assets/Image_43391.tif`, center 30%), auto-count went from `57` (no preprocessing) to `68` (with preprocessing) — visually confirmed via a saved PNG that the additional droplets are real, previously-dim features near the cell edges that background flattening + local contrast made distinguishable, not noise.
- Presented this net trade-off to the user directly (broad gain finding dim droplets vs. a narrow loss at the tightest touching-droplet separations) and asked how to proceed. Decision: keep current defaults (`BACKGROUND_BALL_RADIUS_PX=25`, `CLAHE_CLIP_LIMIT=0.01`) rather than guess-tune further without real hand-count data to calibrate against — consistent with the existing "not yet calibrated" caveat already on this module's other constants.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated with the preprocessing step. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Hand-counting image was still too dim — bake enhancement into the stored PNG

**Report:** after deploying, the linear min/max-normalized crop stored as `cells.image_url` still looked very dim to the user — a straight min/max stretch doesn't help when the histogram itself is skewed (mostly dim background/mid-tones with only sparse bright droplet peaks), since it stretches the *range*, not the *distribution*.

**Decision:** two options existed — bake the already-proven `preprocess_for_detection` enhancement (rolling-ball background subtraction + CLAHE) directly into the stored/persisted image, or keep the stored image purely linear and add a display-only client-side enhancement instead (canvas auto-levels or CSS filter), leaving analysis untouched either way. Asked the user; chose to bake it into the stored PNG, reusing the already-tested code rather than writing new frontend image-manipulation logic.

**`api/detection.py`:**
- `preprocess_for_detection` now returns `uint16` consistently across all branches (previously the CLAHE path returned float64 in `[0, 1]` while the two degenerate-passthrough branches returned whatever range the input was in — fine when the only consumer was `count_droplets`, which doesn't care about absolute range, but inconsistent for something that now also has to be `encode_png_16`'d). The CLAHE branch now does `(enhanced * 65535).astype(np.uint16)`.
- `count_droplets` no longer calls `preprocess_for_detection` internally — it now takes an already-processed array and just does Gaussian blur → Otsu → watershed. This avoids double-processing (CLAHE run once during storage, then run *again* inside detection) now that both consumers need the same enhanced array.

**`api/main.py`:** `cells_from_tif` now calls `preprocess_for_detection(normalized_crop)` once per box, uploads that as `cells.image_url` via `encode_png_16`, and passes the same array to `count_droplets` — one enhancement pass, two consumers, no redundant work (same total per-box cost as before: one `rolling_ball` + one `equalize_adapthist` call, just relocated from inside `count_droplets` to the call site).

### Verification

- Re-ran the flat/empty/all-zero-crop edge cases through the new call pattern (`count_droplets(preprocess_for_detection(x))`): all still correctly return `0`.
- Re-verified the PNG round-trip on the real sample crop: `encode_png_16(processed)` → decode is bit-exact, `dtype uint16`, `min/max 0/65535`.
- Re-ran `count_droplets` on the now-consolidated `processed` array from the real crop: still `68`, matching the value from the prior (pre-consolidation) preprocessing entry — confirms the refactor is behavior-preserving, not just a rename.
- Saved and viewed the actual PNG that will now be stored as `cells.image_url`: same clearly-more-legible image already validated in the prior entry (droplets visibly separated from background, not washed out or near-black).

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Bug fix — stored hand-counting image was blurry after baking CLAHE in

**Report:** immediately after the above change, the user reported the newly-stored `cells.image_url` looked "very blurry."

**Root cause, confirmed quantitatively (not just visually):** measured width-at-half-max of a real droplet peak before/after `preprocess_for_detection` — 5px baseline vs. 9px with `CLAHE_CLIP_LIMIT=0.01` (skimage's default, what Phase 11c originally shipped). Rolling-ball background subtraction leaves a soft, wide low-level "skirt" around each true peak (a ball rolling under a narrow spike can't fully hug it, so the residual after subtraction isn't a clean cutoff). CLAHE then locally stretches contrast within each tile, pulling that skirt up toward full brightness — which is real signal widening, not a display/rendering artifact. Ruled out two alternative fixes empirically: global (non-adaptive) `equalize_hist` was far worse (FWHM 30px, count 228 — amplifies noise non-locally with no tile boundary to contain it), and plain gamma correction actually reduced auto-count below baseline (51 vs. 57) since a uniform curve doesn't reveal *locally* dim regions the way CLAHE does.

**Fix:** swept `CLAHE_CLIP_LIMIT` (0.01 → 0.005 → 0.002) against both peak FWHM and real-crop auto-count, presented the three-way trade-off to the user with concrete numbers and rendered images for each. `0.005` keeps most of the brightness gain (auto-count 81 vs. 57 baseline, vs. 85 at the sharpest setting) while pulling FWHM back from 9px to 7px — chosen over `0.01` (brightest but most smeared) and `0.002` (sharpest, closest to baseline width, but visibly dimmer, closer to the original complaint).

### Verification

- Re-ran the flat/all-zero-crop edge cases with the new value: still `0`.
- Re-verified the PNG round-trip on the real sample crop at `clip_limit=0.005`: bit-exact, `uint16`, `min/max 0/65535`.
- Confirmed `count_droplets` on the final shipped pipeline returns `81` (up from the `68` at the old `0.01` default, and `57` with no preprocessing at all).

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## `count_droplets` reworked to an ALDQ-style pipeline

**Request:** the user reported the auto-count image processing "isn't the best" and asked for it to follow the ALDQ counting model instead: iterative edge-sharpening via a band-pass filter and difference-of-Gaussians (DoG), then local-maxima counting, edge detection, and watershed.

**`api/detection.py`:** `count_droplets` no longer does Gaussian blur → Otsu → distance-transform watershed. New chain, still operating on the already-`preprocess_for_detection`'d array (unchanged):
- **Iterative DoG band-pass sharpening** (`SHARPEN_ITERATIONS=3`): each pass runs `skimage.filters.difference_of_gaussians(sharpened, DOG_LOW_SIGMA_PX=1.0, DOG_HIGH_SIGMA_PX=6.0)` — DoG *is* a band-pass filter (rejects both sub-pixel noise below the low sigma and structure wider than a droplet above the high sigma) — and adds that edge response back onto the running image (unsharp-mask style, `SHARPEN_STRENGTH=1.0` weight), so droplet boundaries get progressively crisper across iterations.
- **Local-maxima seeding:** `peak_local_max` now runs directly on the sharpened image (`PEAK_THRESHOLD_REL=0.1`, `MIN_PEAK_DISTANCE_PX=3`, restricted to the Otsu-thresholded foreground mask) instead of on a smoothed distance transform — one seed per droplet center.
- **Edge-detection watershed:** `skimage.filters.sobel(sharpened)` supplies the watershed elevation map (flooding halts at high-gradient droplet edges) in place of the old `-distance` landscape.
- Otsu thresholding is still used to build the foreground `mask` that bounds both peak-finding and the watershed flood — same role it played before, just applied to the sharpened image instead of a lightly Gaussian-blurred one.
- Removed now-unused imports (`scipy.ndimage`, `skimage.filters.gaussian`); added `difference_of_gaussians`, `sobel`.

### Verification

- Confirmed `difference_of_gaussians` and `sobel` are available in the installed `scikit-image` (0.26.0).
- Synthetic smoke test, 6 well-separated Gaussian-bump blobs on a noisy background: `count_droplets` returns `6` (exact match), and correctly returns `0` on an empty array and on a flat/constant crop (Otsu's `ValueError` guard still fires).
- Swept center-to-center spacing on a synthetic touching pair (blob sigma 3, i.e. ~3px radius): merges into `1` at 7px spacing, correctly splits into `2` at 8px and above.
- Compared against the *old* algorithm on the same extreme near-coincident pair (6px spacing, heavy overlap): old algorithm also collapsed to `1` — confirms the new pipeline isn't regressing behavior at the hardest cases, just changing the mechanism.
- Did not yet re-run against the real sample crop (`assets/Image_43391.tif`) or against real hand-count data — the new constants (`DOG_LOW_SIGMA_PX`, `DOG_HIGH_SIGMA_PX`, `SHARPEN_ITERATIONS`, `SHARPEN_STRENGTH`, `PEAK_THRESHOLD_REL`) are prototype defaults only, consistent with this module's existing "not yet calibrated" caveats.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## `api/detection.py` reworked to an explicit ImageJ-style binary pipeline

**Request:** the user specified a concrete 5-step pipeline for both hand-count and auto-count images: (1) rolling-ball background subtraction, radius 12px, (2) threshold to binary with dark background, (3) binary fill holes, (4) binary convert to mask, (5) binary watershed. The stored hand-count image should stop after step 2 (background subtraction + threshold), not run the full chain.

**`api/detection.py`:** replaced the ALDQ DoG/CLAHE pipeline entirely with four functions:
- `subtract_background(plane)` — `rolling_ball(plane, radius=BACKGROUND_BALL_RADIUS_PX)`; `BACKGROUND_BALL_RADIUS_PX` dropped from `25` to `12` per the user's spec.
- `threshold_binary(flattened)` — Otsu threshold, foreground = pixels above threshold (bright droplets on dark background), returned as a boolean mask. Replaces the old inline Otsu call inside `count_droplets`.
- `preprocess_for_hand_count(plane)` (renamed from `preprocess_for_detection`) — chains `subtract_background` → `threshold_binary` only (steps 1-2), returned as uint16 `0`/`65535`. This is now what's stored as `cells.image_url`: a binary black-and-white image, not grayscale — a deliberate behavior change per the user's instruction, not an oversight.
- `count_droplets(plane)` — runs its own full 5-step chain from the raw normalized crop (not from `preprocess_for_hand_count`'s output, since the two diverge after step 2): `subtract_background` → `threshold_binary` → `scipy.ndimage.binary_fill_holes` → Euclidean distance transform of the filled mask → `peak_local_max` on the distance transform seeds one watershed marker per droplet center → `watershed(-distance, markers, mask=filled)`. This is the standard ImageJ "Process > Binary > Watershed" construction (flood the inverted distance map, not an intensity/gradient landscape).
- Removed now-dead CLAHE and DoG/Sobel code and constants (`CLAHE_CLIP_LIMIT`, `DOG_LOW_SIGMA_PX`, `DOG_HIGH_SIGMA_PX`, `SHARPEN_ITERATIONS`, `SHARPEN_STRENGTH`, `PEAK_THRESHOLD_REL`) and unused imports (`equalize_adapthist`, `difference_of_gaussians`, `sobel`, `label`); added `scipy.ndimage`.

**`api/main.py`:** `cells_from_tif` now calls `preprocess_for_hand_count(normalized_crop)` for the stored/uploaded image and `count_droplets(normalized_crop)` separately for the auto-count — two consumers off the same normalized crop, each running its own portion of the shared pipeline (previously both shared one fully-processed array).

### Verification

- Synthetic smoke test (4 well-separated Gaussian blobs, one pair close together, on a noisy background): `preprocess_for_hand_count` returns a `uint16` array with only two values (`0`, `65535`), confirming it's a true binary image. `count_droplets` runs end-to-end without error and returns a plausible count.
- Confirmed `scipy` is already in `api/requirements.txt` (`scipy.ndimage` is a new import but not a new dependency).
- Did not yet re-run against the real sample crop (`assets/Image_43391.tif`) or against real hand-count data to calibrate `BACKGROUND_BALL_RADIUS_PX=12` or the watershed peak-distance defaults — consistent with this module's existing "not yet calibrated" caveats. Flagged to the user: the stored hand-count image is now binary black-and-white rather than grayscale, which may look different from what researchers are used to — worth confirming it's still usable for hand counting once deployed.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Threshold pushed stricter to try to separate clumped droplets

**Report:** user said droplets are "all clumping together and not becoming distinct" and asked whether thresholding could be changed so more of the image turns black.

**`api/detection.py`:** added `THRESHOLD_FACTOR = 1.3` and applied it in `threshold_binary` as `threshold_otsu(flattened) * THRESHOLD_FACTOR` before the `flattened > thresh` cutoff — raises the bar for what counts as foreground, so only brighter droplet cores pass and more of the frame is classified as background.

**Investigated before shipping:** synthetic tests (a tight 4-blob overlapping clump, and a 3-droplet clump with a visible saddle between peaks) showed that raising `THRESHOLD_FACTOR` alone shrinks the foreground mask uniformly (measured foreground pixel count dropping steadily from factor 1.0 → 3.0) but does not split genuinely touching droplets into separate connected components or separate watershed regions — `auto_count` stayed at `1` across the whole factor sweep in both synthetic cases. Traced the real bottleneck to `MIN_PEAK_DISTANCE_PX=3` in `count_droplets`: printed the distance-transform's local maxima directly and found 3 real peaks in the 3-droplet clump, but `peak_local_max(distance, min_distance=3, ...)` collapsed them to 1 seed; re-running with `min_distance=1` correctly recovered 3 peaks and `auto_count=3` on the identical mask. So the threshold controls *how much area* is foreground, while `MIN_PEAK_DISTANCE_PX` controls *whether watershed splits* that foreground into multiple regions — independent levers, and the user's symptom (clumped, indistinct droplets) is more directly explained by the latter.

**Presented this to the user** with the concrete numbers above and asked whether to also lower `MIN_PEAK_DISTANCE_PX`. They chose to ship only the `THRESHOLD_FACTOR` change for now and evaluate it against real data before touching the peak-distance parameter.

### Verification

- Synthetic sweep (`THRESHOLD_FACTOR` 1.0 → 3.0) on a 4-blob tight overlapping clump and a 3-droplet clump with a saddle: foreground pixel count decreases monotonically as expected; connected-component count and `auto_count` both stayed unchanged in these synthetic cases (as expected, since the real fix for splitting is `MIN_PEAK_DISTANCE_PX`, deliberately not touched this round).
- Confirmed via direct `peak_local_max` calls at `min_distance=1` vs `3` that the distance-transform peaks genuinely exist at the droplet scale used in `MIN_DROPLET_AREA_PX`/`MIN_PEAK_DISTANCE_PX`'s existing prototype defaults — this isn't a synthetic-test artifact.
- Not yet verified: effect of `THRESHOLD_FACTOR=1.3` on the real sample crop or real hand-count data; still a prototype default, not calibrated.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## `cells.source_filename` — original .tif name stored as metadata

**Request:** the user asked to store the original `.tif` filename as metadata on a cell.

**`api/main.py`:** `cells_from_tif` already receives the upload as a FastAPI `UploadFile`, which carries the client's original filename on `.filename`. Added `"source_filename": file.filename` to the per-box insert dict alongside the existing `condition_id`/`name`/`image_url`/`auto_count` fields — one `.tif` can produce multiple cells (one per annotated box), and all of them get the same source filename, which is correct since they really do all come from the same uploaded file.

**Schema:** the `cells` table itself lives in Supabase and isn't version-controlled as SQL in this repo (no migrations directory exists). This environment only has placeholder Supabase credentials (`api/.env.example`), not real ones, so the column can't be added here — flagged to the user with the exact statement to run themselves before deploying:
```sql
ALTER TABLE cells ADD COLUMN source_filename text;
```
Until that column exists, every `cells_from_tif` insert will fail once this code ships.

**Docs:** updated the schema description in `CLAUDE.md` (cells table field list, plus fixed a stale line that still described `auto_count`'s algorithm as the old DoG/CLAHE pipeline instead of the current rolling-ball/threshold/watershed one from the ImageJ-style rework) and `docs/PRD.md`'s `cells` table SQL block (which also didn't list `auto_count` yet — added both missing columns while touching that line).

### Verification

- `python -m py_compile main.py`: passes.
- Did not verify the actual insert against a live Supabase instance (no real credentials available) — this is a genuine gap until the user runs the `ALTER TABLE` and deploys.
- Not done: no frontend display of `source_filename` was added (Cells screen detail panel still only shows `auto_count`/hand counts) — the user's request was to store it as metadata, not necessarily surface it in the UI; worth asking if they also want it shown.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## `cells.source_filename` surfaced on the Cells screen sidebar

**Request:** show the original `.tif` filename (added as `cells.source_filename` in the prior entry) on the sidebar for a cell.

**`app.js`:** `wireCells`'s `renderDetail` (the function that fills `#detail-panel`, a `.detail-panel` sidebar fixed at 260px, sticky in the Cells screen layout) gained a conditional `detail-row` for `cell.source_filename`, placed right under the cell name and above "Average hand count" — reads as identifying metadata before the count stats. Renders as a "Source file" label with the filename as the value, using the same `.detail-row`/`.detail-label`/`.detail-value` classes as the existing rows. Guarded with `cell.source_filename ? ... : ''` so it's omitted entirely for cells with no source file (e.g. any hand-entered/legacy cell predating this column) rather than showing an empty row.

Also added `source_filename: 'Image_43391.tif'` to two of the hardcoded local dev-mode test cells (`test-cell-001`, `test-cell-003`) so the new row is visible when testing with a `local:` token and no live backend.

### Verification

Ran the app for real rather than just reading the diff, per this project's screenshot-verification convention:
- Served the static site locally (`python -m http.server`), drove it with headless Playwright (`chromium-cli` wasn't available in this environment, so used Playwright's Python bindings directly as the documented fallback): set a `local:` token in `localStorage`, navigated Experiments → "Serum Starvation Timecourse" → "0 Hr Starved" → Cells.
- Clicked "Cell 1" (has `source_filename` in the test data) — sidebar shows a "SOURCE FILE" row with `Image_43391.tif` above "AVERAGE HAND COUNT", matching the intended placement.
- Confirmed via screenshot (not just DOM dump) that the row renders with correct styling, consistent with the rest of the panel.
- Confirmed "Cell 2" (no `source_filename` in test data) correctly omits the row — no empty/blank "Source file" line.
- `console --errors` equivalent (Playwright console listener) showed no console errors during the full navigation.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Watershed moved before the hand-count image too, not just auto-count

**Request:** run watershed before generating the hand-count image as well — previously `preprocess_for_hand_count` stopped after background subtraction + threshold (steps 1-2), so the stored `cells.image_url` never benefited from the fill-holes/watershed separation that `count_droplets` used internally.

**`api/detection.py`:** collapsed the two previously-separate pipelines into one shared segmentation:
- `segment_droplets(plane)` — the full chain (subtract_background → threshold_binary → binary_fill_holes → distance-transform watershed), now called `watershed(-distance, markers, mask=filled, watershed_line=True)` (added `watershed_line=True`, previously omitted). This is the actual mechanism that makes the visual difference: it burns a 1px background gap into the labeled array everywhere two regions meet, rather than assigning every foreground pixel a label with no visible seam. Returns the raw int label array (0 = background/split line, 1..N = one label per droplet).
- `render_hand_count_image(labels)` — replaces `preprocess_for_hand_count`; takes the label array (not a raw plane) and renders `(labels > 0)` as a binary uint16 image. Since `segment_droplets` already put a gap between touching droplets, this rendering shows them as visually separate blobs.
- `count_droplets(labels)` — also now takes the label array directly instead of a plane, dropping its own internal copy of steps 1-4 (previously duplicated from `preprocess_for_hand_count`/the old `count_droplets`).

**`api/main.py`:** `cells_from_tif` now calls `segment_droplets(normalized_crop)` once per box and derives both `hand_count_crop` (via `render_hand_count_image`) and `auto_count` (via `count_droplets`) from that single result, instead of running the full pipeline twice. This also fixes a real inefficiency introduced by the ImageJ-pipeline rework two entries back: `rolling_ball` (the most expensive step, ~1.3s per crop per earlier measurements) was running once inside each function — twice total per box — since `preprocess_for_hand_count` and `count_droplets` each called `subtract_background` independently.

### Verification

- Synthetic 3-droplet tight clump (same one used in the `THRESHOLD_FACTOR` investigation, where `MIN_PEAK_DISTANCE_PX=3` collapses all 3 into a single distance-transform peak): confirmed `segment_droplets` still returns a single connected label here — `watershed_line=True` only draws a split where there are ≥2 markers to divide between, so this doesn't fix that known limitation (still gated by `MIN_PEAK_DISTANCE_PX`, unchanged by this request).
- Synthetic 2-blob pair spaced 12px apart (known to split under the existing defaults): printed the raw label array and confirmed a visible 1px `0`-valued line separates label `1` from label `2`. Printed `render_hand_count_image`'s output over the same region and confirmed that gap renders as black (`0`) in the binary image — i.e. the stored hand-count PNG will show two visually distinct blobs, not one.
- `python -m py_compile detection.py main.py`: passes.
- Not yet verified: real sample crop or real hand-count data: still prototype defaults throughout this module.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Count screen: red dot markers + zoom-in for closely-clustered droplets

**Request:** the user asked to change the numbered count markers to small red dots, and add a zoom feature to the Count screen to help distinguish small droplets that sit close together.

**`app.js`:** `renderMarkerHTML` now renders a bare `<button class="count-marker">` with no index number (`aria-label="Remove marker"` instead of `Remove marker N`) — dropped the per-marker index entirely since the dot is no longer labeled. Added `countState.zoom` (range 100%–300%, step 50%, via `COUNT_ZOOM_MIN/MAX/STEP`), a `count-zoom-controls` pill (`−` / level / `+`) fixed to the bottom-right of the screen, and `setCountZoom()` which resizes `#count-frame`'s real `width`/`max-width` (not a CSS transform) so the existing click-to-place `getBoundingClientRect()` math keeps working unchanged at any zoom level. Also refactored `addMarkerAt`/`removeMarker` to patch the DOM directly (`insertAdjacentHTML`/`.remove()` + a `updateCountTotal()` text update) instead of calling `refreshCount()`'s full `innerHTML` re-render on every click — a full re-render would have reset the canvas's scroll/pan position and zoom-control focus on every single marker placed, which defeats the point of zooming in to count a tight cluster.

**`style.css`:** `.count-marker` shrunk to a small solid red circle (no text/number styling). Added `.count-zoom-controls`/`.count-zoom-btn`/`.count-zoom-level`. Found and fixed a real bug while verifying: `.canvas-frame` (shared with Add Photos) had no `flex-shrink`, so flexbox's default `flex-shrink: 1` silently squeezed the zoomed frame back down to fit `.count-canvas` — it never actually overflowed, so zooming had no visible effect and there was nothing to pan. Added `flex-shrink: 0`. Also added `.count-canvas.is-zoomed { align-items/justify-content: flex-start }`, toggled whenever zoom > 100%: `.count-canvas`'s default centered flex alignment is a known trap once a child overflows (the browser can't scroll to a negative offset to reach the centered content's near edge), which would have made part of a zoomed-in image permanently unreachable by scrolling.

### Verification

Ran the app for real, not just read the diff (`node`/`chromium-cli` weren't available in this environment; used Playwright's Python bindings instead, which were installed): served the static site locally, set a `local:` token, called `navigate('count', { cell })` directly for a test cell, and drove the screen with the mouse.
- Screenshot confirms markers render as small solid red dots (no numbers) — including two placed close together, both individually visible.
- First implementation attempt didn't actually zoom (`frameRectW` stayed capped at the container's width even at 200%/300%) — caught this via direct DOM measurement (`getBoundingClientRect`/`scrollWidth` before vs. after adding `flex-shrink: 0`), not just a screenshot glance, since the frame was still exactly filling the container either way.
- After the fix: measured `#count-frame`'s rendered width growing correctly with zoom (880px → 1320px → 1760px at 100/150/200%), and confirmed `.count-canvas` genuinely overflows (`scrollWidth` 1808 vs `clientWidth` 1280 at 200%) and pans via `scrollLeft` (0 → 528 reachable). Vertical overflow instead grows the whole page (`.count-canvas` has no fixed height), confirmed via `document.documentElement.scrollHeight` growing past `window.innerHeight` — expected, not a bug.
- Confirmed clicking a marker to remove it preserves zoom level and doesn't trigger a full-screen re-render (zoom read back unchanged immediately after removal).
- Confirmed zoom buttons correctly disable at both the 100% floor and 300% ceiling.
- `console --errors` equivalent (Playwright console listener) showed no console errors through the full interaction.

## Final step (per project convention)

`docs/tasks.md` Phase 8 updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Un-shared watershed between hand-count image and auto-count

**Request:** the previous entry made the hand-count image and auto-count share one `segment_droplets` computation (both consumed the same labeled watershed result). The user asked to reverse that sharing: watershed for the hand-count image should only affect the image stored for hand counting; the auto-count pipeline should get its own version starting fresh from subtract-background + threshold, not the hand-count's watershed result.

**Explained both pipelines back to the user before implementing**, to confirm the read was correct:
- Hand-count: subtract_background → threshold_binary → fill_holes → watershed (`watershed_line=True`, burns a visible 1px gap between touching droplets in the stored image).
- Auto-count: independently subtract_background → threshold_binary (its own fresh calls, not reused from the hand-count run) → its own fill_holes → its own watershed (no visible line needed, since nothing here gets rendered — just counted).

**`api/detection.py`:** replaced `segment_droplets(plane) -> labels` (shared, used by both) with two independent full-pipeline functions again:
- `render_hand_count_image(plane)` — full chain, `watershed_line=True`.
- `count_droplets(plane)` — full chain, `watershed_line=False`, run separately with its own mask instance.
- Factored the shared *mechanics* (fill-holes → distance transform → peak-finding → watershed call) into a private `_fill_and_watershed(mask, watershed_line)` helper, called independently by each pipeline on its own mask — avoids duplicating the watershed code verbatim while still ensuring the two never share one computed result.

**`api/main.py`:** `cells_from_tif` now calls `render_hand_count_image(normalized_crop)` and `count_droplets(normalized_crop)` separately again, each internally redoing `subtract_background`/`threshold_binary`. This reintroduces the double `rolling_ball` cost per box (~1.3s × 2) that the immediately-prior entry had just eliminated by sharing — an accepted tradeoff, since the user's priority here is pipeline independence (so each can be tuned/changed without affecting the other) over that efficiency gain.

### Verification

- Synthetic 2-droplet pair (12px spacing, known to split): `render_hand_count_image` still shows a visible 1px black gap between the two blobs; `count_droplets` still returns `2` — confirms both pipelines still work correctly after being un-shared, not just that they compile.
- Re-ran the empty-array and flat-crop edge cases through both functions independently: both still correctly return an empty/zero image and `0`, respectively.
- `python -m py_compile detection.py main.py`: passes.

## Final step (per project convention)

`docs/tasks.md` Phase 11c updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Phase 6d — Three-dot edit/remove menu on Experiments, Conditions, and Cells cards

**Request:** add a three-dot menu to the top-right of every card on the Experiments, Conditions, and Cells screens, with an Edit action (metadata popup) and a Remove action (confirmation popup before deleting).

### `app.js` — shared card-menu machinery

Added one shared block (`cardMenuHTML`, `wireCardMenus`, `closeAllCardMenus`, `openConfirmModal`) reused by all three screens rather than three separate implementations:
- `cardMenuHTML(id)` — the `⋮` button + dropdown markup, injected as the first child of each `.folder-card` div (absolutely positioned, so it doesn't affect card layout/height)
- `wireCardMenus(grid, { onEdit, onRemove })` — toggles the dropdown open/closed per card (`stopPropagation` so it doesn't also trigger the card's own click-to-select handler), and installs a single document-level "click outside closes any open menu" listener, torn down and reattached on every screen re-render via a tracked `cardMenuDocHandler` (same detach-before-reattach discipline as `wireShell`'s `escHandler`)
- `openConfirmModal({ title, message, confirmLabel, onConfirm })` — a generic reusable "are you sure?" modal (reuses the existing `.modal`/`.modal-form`/`.modal-error`/`.modal-actions` classes rather than introducing a parallel modal system), used by all three Remove flows

### Per-screen wiring

- **Experiments:** `openEditExperimentModal(exp, onSuccess)` mirrors `openAddExperimentModal` but pre-fills Name/Date/Dye/Notes and calls the new `PUT /experiments/{id}`; `deleteExperiment(id)` calls the new `DELETE /experiments/{id}` (or splices `TEST_EXPERIMENTS`/deletes the `TEST_CONDITIONS[id]` entry for local test accounts)
- **Conditions:** `openEditConditionModal`/`deleteCondition` — same pattern, `PUT`/`DELETE /conditions/{id}`, fields Name/Dye/Starvation/Notes
- **Cells:** `openEditCellModal`/`deleteCell` — same pattern but only `name` is user-editable (per CLAUDE.md, `image_url`/`auto_count`/`source_filename` are pipeline-written, not user metadata), `PUT`/`DELETE /cells/{id}`

### `api/main.py` — new endpoints

- `PUT /experiments/{id}` / `DELETE /experiments/{id}` — delete manually cascades (`counts` for all cells under the experiment's conditions → those `cells` → those `conditions` → the experiment itself), since there's no confirmed DB-level `ON DELETE CASCADE` on these tables
- `PUT /conditions/{id}` / `DELETE /conditions/{id}` — delete cascades `counts` → `cells` → the condition
- `PUT /cells/{id}` (body `{ name }`) / `DELETE /cells/{id}` — delete removes the cell's `counts` first, then the cell, then calls `recompute_condition_icc` on the owning condition (removing a cell can change which cells have 3 counts, which changes ICC eligibility)
- All six routes reuse the existing `owned_experiment`/`owned_condition`/`owned_cell` ownership helpers, same 404-not-403 posture as every other endpoint

### `style.css`

Added `.card-menu`/`.card-menu-btn`/`.card-menu-dropdown`/`.card-menu-item`/`.card-menu-item-danger` (small `⋮` button top-right of each card, dropdown below it), `.modal-confirm-message`/`.modal-danger` (red confirm button on the reusable confirm modal), and `padding-right` on `.folder-name` so a long card name doesn't run under the new menu button.

### Verification

Ran the real app, not just a code read — Node/npm/chromium-cli aren't available in this environment, but Python's `playwright` package and a real Chrome install are, so served the site over `python -m http.server` and drove it with Playwright's sync API (`channel="chrome"`), screenshotting at each step:
- Logged in with the local test account → Experiments: opened the ⋮ menu on a card (screenshot confirms it renders inline, not clipped or overlapping the card body), clicked Edit — confirmed the modal pre-fills the real experiment name, saved a renamed value, and confirmed the card re-rendered with the new name
- Clicked Remove on a second experiment — confirmed the confirmation modal's message names the correct experiment and warns about cascading deletes, confirmed clicking Remove actually removed it (card count 2 → 1)
- Repeated the same Edit-prefill / Remove-confirms-and-removes sequence one level down on Conditions, then again on Cells (including confirming the ⋮ button stays legible sitting on top of the fluorescence thumbnail image)
- `console --errors` equivalent (Playwright console/pageerror listeners) showed no errors across the whole run
- Not verified against the real Render API / Supabase (no live credentials in this environment) — the local test-account path exercises the full UI flow; the new `PUT`/`DELETE` endpoints themselves were only checked by reading the code and confirming `python -m py_compile` / FastAPI route registration, not by hitting live data

## Final step (per project convention)

`docs/tasks.md` Phase 6d added and checked off. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Raw Data screen: "Export CSV" button

**Request:** add an "Export CSV" button near the top right of the Raw Data screen that downloads the table as a CSV file.

### `app.js`

- `renderRawDataHTML()` — wrapped the existing filter input in a new `.rawdata-toolbar` flex row alongside a new `<button id="rawdata-export">Export CSV</button>`, right-aligned via `justify-content: space-between`
- `csvField(value)` — CSV-escapes a single value (wraps in quotes and doubles embedded quotes if it contains a comma, quote, or newline; `null`/`undefined` become an empty field, matching the table's `—` treatment)
- `rawDataToCSV(rows)` — builds a CSV string using `RAWDATA_COLUMNS`' labels as the header row and `rawDataSortValue()` (already used for sorting) to read each column's raw value per row — reuses the existing column/value plumbing rather than duplicating it
- `downloadRawDataCSV()` — exports `visibleRawDataRows()` (i.e. whatever the user currently has filtered/sorted into view, not the unfiltered full set) as a `Blob`, triggers the download via a throwaway `<a download>` element, and revokes the object URL after the click. Filename is `raw-data-YYYY-MM-DD.csv` (today's date)
- `wireRawData()` — added a click listener on `#rawdata-export` calling `downloadRawDataCSV()`

### `style.css`

Added `.rawdata-toolbar` (flex row, filter left / button right) and `.rawdata-export-btn`, styled identically to the existing `.detail-open-btn` accent button (solid `--accent` background, same padding/radius/hover brightness) rather than inventing a new button style.

### Verification

No Chrome/Chromium or Playwright install is present in this environment (unlike several earlier phases, which had one) — actual on-screen/download verification wasn't possible this session. Instead:
- `node --check app.js` passes
- Brace count in `style.css` balanced (237 open / 237 close)
- Isolated the exact CSV-building logic (`csvField`/`rawDataToCSV`/`rawDataSortValue`/`rawDataCountAt`, copied verbatim) into a standalone Node script and ran it against synthetic rows: a value containing a comma and one containing an embedded double-quote both got correctly quoted/escaped (`"Serum, Starvation"`, `"0 Hr ""Starved"""`), and a cell with zero counts produced empty fields (`,,,,`) rather than literal `—` or `null` text
- **Not verified:** the button's actual on-page position/styling, and that a real browser click triggers a file download — recommend opening `index.html` locally, going to Raw Data, and confirming the button sits top-right of the table and downloads a working `.csv` before treating this as fully verified.
## Login "Loading..." / boot notice (Render cold-start)

**Request:** if a login takes longer than 3 seconds, show a message telling the user to wait 1-2 minutes while the site boots up (Render's free tier spins down the API after inactivity, and the first request after idle can take 30-60s to wake it). First pass used a separate modal popup; superseded before landing by a request for inline text instead — "Loading..." right when the login button is clicked, upgraded to add the wait notice if the request is still pending 3s later.

### `app.js`

In `renderLogin`'s `mode === 'login'` submit handler:
- `messageEl.textContent = 'Loading...'` is set immediately, before the local `docs/test-accounts.json` shortcut check or the real API call
- Before the real `/auth/login` call, `setTimeout(..., 3000)` upgrades `messageEl` to `'Loading... Please wait 1-2 minutes while the site boots up.'` if it fires; cleared in a `finally` so it never fires after the request settles
- On error, `messageEl` is cleared back to `''` alongside setting `errorEl`

No separate popup/modal element — the existing inline `login-message` div covers it.

### Verification

Read through the submit handler's control flow to confirm the timer is always cleared (success, error, and `finally` all covered) and that `messageEl` doesn't end up stuck on stale text after an error. Not screenshot-verified against a real cold Render instance — forcing a 30-60s cold start isn't practical in this environment. Recommend the user manually confirm the message sequence against the live Render deployment after a period of inactivity.

## Final step (per project convention)

`docs/tasks.md` Phase 2 item updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Graph screen: plot auto count instead of hand-count average; Raw Data: add auto count + source file columns

**Request:** the Graph page should use `cells.auto_count` for the per-cell values plotted (not the hand-count average), and the Raw Data page should include auto count and the original `.tif` filename as columns.

### `app.js`

- Added `cellAutoCount(cell)` and `conditionAutoCountMean(cond)` next to the existing `cellAverage`/`conditionMean`. Kept the two pairs separate rather than repointing the shared functions, since `cellAverage`/`conditionMean` are still used by the Conditions screen mini-chart (an ICC-adjacent hand-count overview) and the Cells detail panel's "Average hand count" — only the Graph screen should switch to auto count.
- `renderGraphChartArea()`: axis max, per-cell dot Y position, and the condition mean tick now all derive from `cellAutoCount`/`conditionAutoCountMean` instead of `cellAverage`/`conditionMean`.
- Graph hover tooltip: relabeled the plotted value "Auto count" (was "Average") and relabeled the hand-count list "Hand counts" (was "Counts") so the two are not conflated now that they show different things.
- `RAWDATA_COLUMNS` gained `autoCount` ("Auto count") and `sourceFilename` ("Source file") entries; `initRawData()` populates both fields per row from `cell.auto_count`/`cell.source_filename`; `rawDataSortValue()` extended so both columns sort. CSV export needed no separate change — it already builds off `RAWDATA_COLUMNS` + `rawDataSortValue()`.

### Verification

Ran the real app: served the repo with `python -m http.server` and drove it with Python Playwright (real Chrome channel), logging in with the local test account.
- Graph: added "Serum Starvation Timecourse -> 0 Hr Starved" to the chart. Screenshot shows two dots (values 3 and 5) and a mean tick at 4, matching the fixture cells' `auto_count` values (3 and 5); the other two fixture cells in that condition have no `auto_count` and are correctly omitted. Hovering a dot shows tooltip "Hand counts: -- / Auto count: 3.0" for the cell that has an auto count but no hand counts.
- Raw Data: screenshot confirms "Auto count" and "Source file" columns render with correct values (`3` / `Image_43391.tif` for one row, `5` / `Image_43391.tif` for another, `--` for rows without an auto count or source file).
- No console/page errors on either screen.

## Final step (per project convention)

`docs/tasks.md` Phase 9 and Phase 10 items updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 12 — Static Content Screens (Help & About)

**Request:** implement the next open task in `docs/tasks.md` — the Help and About screens were wired into navigation (sidebar, breadcrumbs, `SCREENS` metadata) since Phase 3 but still fell through to the generic `screenStub()` placeholder.

### `app.js`

- Added `HELP_CONTENT` (array of `{ title, body }`) and `ABOUT_CONTENT` (`{ purpose, origin, status, links }`) next to `CONFIG`, so both screens' copy lives in one place and is easy to edit without touching render logic, per PRD 5.9 ("content editable in app config"). `HELP_CONTENT` has one card per workflow step (Experiments, Conditions, Cells & Add Photos, Counting, Graph, Raw data) plus a card explaining ICC. `ABOUT_CONTENT.links` starts as an empty array — no citation/protocol links exist yet — and the About screen only renders that section when it's non-empty.
- Added `initHelp`/`renderHelpHTML` and `initAbout`/`renderAboutHTML`, following the same `.content`-swap pattern as `initRawData`/`initGraph`. Both are synchronous (no API calls — the content is static), unlike the data-driven screens.
- Wired both into `navigate()` alongside the other `init*` calls.

### `style.css`

- `.help-grid`/`.help-card`: card grid reusing the existing surface language (`oklch(0.99 0.005 75)` background, `oklch(0.88 0.01 75)` border, `0.5rem` radius) already used by `.folder-card`/`.detail-panel`, rather than inventing a new visual style.
- `.about-panel`/`.about-section`/`.about-links`: single-column panel with mono uppercase section labels in `--accent` (matching the existing label convention elsewhere in the app) and serif-free body text.

### Verification

Ran the real app: served the repo with `python -m http.server` and drove it with Python Playwright (real Chrome channel), logging in with the local test account (`docs/test-accounts.json`).
- Help: opened via the sidebar; screenshot confirms all 7 cards render with titles and body text in the correct grid layout.
- About: opened via the sidebar; screenshot confirms Purpose/Origin/Status sections render; the links section is correctly omitted since `ABOUT_CONTENT.links` is empty.
- No console/page errors on either screen.

## Final step (per project convention)

`docs/tasks.md` Phase 12 items updated. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Condition dye removed as a per-condition field

**Request:** condition folders shouldn't have their own dye — it's universal to all conditions within an experiment — but the Conditions screen sidebar (detail panel) should still show the dye value for ease of analysis.

### `app.js`

- `navigate('conditions', ...)` calls (Experiments screen "Open experiment" click and double-click) now pass `dye: exp.dye` alongside `id`/`name` in the `experiment` param, so `state.experiment.dye` is available once the user is on the Conditions screen.
- Conditions screen detail panel's "Dye" row now reads `state.experiment?.dye` instead of `cond.dye`.
- Conditions grid folder-card dye chip removed — showing the same value on every card in an experiment was redundant now that it isn't a per-condition property.
- Add Condition ("New slide") and Edit Condition modals: removed the Dye input field and its entry from the POST/PUT payloads.
- `TEST_CONDITIONS` fixtures: removed the now-unused `dye` key from all 5 local dev-mode conditions (dye already exists on the corresponding `TEST_EXPERIMENTS` entries).
- `HELP_CONTENT`'s Conditions card body updated to note dye is set once at the experiment level and shown on the condition detail panel for reference, rather than describing it as a per-condition property.

### `api/main.py`

- `ConditionBody` dropped the `dye` field.
- `create_condition` and `update_condition` no longer read or write `dye` on the `conditions` table.
- Experiment-level `dye` (on `ExperimentBody`/`create_experiment`/`update_experiment`) is unchanged — dye still lives there.
- The `conditions.dye` Supabase column itself is left in place but now unused — no migration was run in this environment (same caveat as the `cells.source_filename` column addition earlier: no live Supabase credentials here). Dropping it is optional cleanup the user can do directly in Supabase if desired.

### Docs

`CLAUDE.md` and `docs/PRD.md` schema/field references updated to drop `dye` from the `conditions` table/Condition data model, with a note that the Conditions detail panel displays the parent experiment's dye for reference.

### Verification

Ran the real app: served the repo with `python -m http.server` and drove it with Python Playwright (real Chrome channel), logging in with the local test account.
- Conditions screen for "Serum Starvation Timecourse" (experiment dye: BODIPY): folder cards no longer show a dye chip; selecting a condition shows "Dye: BODIPY" in the detail panel, correctly sourced from the experiment rather than the condition.
- Add Condition modal ("New slide") and Edit Condition modal: confirmed no Dye field is present in either form.
- No console/page errors on any of the above.

## Final step (per project convention)

`docs/tasks.md` Phase 5 amended with a note. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 13 — Configurable Props (theme, appTitle, prototypeBadge)

**Request:** implement the next open phase in `docs/tasks.md`. `CONFIG` (`app.js`) already had `appTitle`/`prototypeBadge` as hardcoded constants from Phase 1, scaffolded for this phase. User decision during planning: `appTitle`/`prototypeBadge` stay developer-set constants (no UI), but `theme` gets a user-clickable toggle in the top bar, persisted across sessions — and, per a plan-review correction, **Sage is a real dark theme**, not just a different accent hue on a light background.

### `style.css` — token system + dark theme

`style.css` had ~161 `oklch()` calls but only ~60 distinct literal values, nearly all sharing one of four hue families: 75 (neutral), 45 (accent), 30/25 (danger), 145 (success/simulated-image). A dark theme needs surfaces and text to swap roles (light↔dark), which a simple hue swap can't do, so this became a proper token refactor:

- Every distinct color got a `--token-paper` (the literal, never overridden) and a `--token` (the active value, defaults to `-paper`) pair in `:root`, grouped as surfaces/borders/text/accent/semantic-status.
- `:root[data-theme="sage"]` reassigns each active token using CSS relative-color syntax, e.g. `--surface-page: oklch(from var(--surface-page-paper) calc(1 - l) c 132)`. Neutral/border/text/accent tokens invert lightness and re-hue to sage green (132). Semantic tokens (`--danger`, `--danger-strong`, `--danger-light`, `--warn-text`, `--success-text`, `--success-text-2`, `--success-tint`) invert lightness only and keep their original hue (`c h` instead of `c 132`), so danger/warn/success stay conceptually red/amber/green in both themes rather than all trending green.
- **First bug found in testing:** the dark override initially read `--surface-page: oklch(from var(--surface-page) calc(1 - l) c 132)` — referencing the *same* custom property name being defined, on the same element (`:root` also matches `:root[data-theme="sage"]`). Per the CSS custom-properties spec this is a dependency cycle and the property's computed value becomes the guaranteed-invalid value (empty), not an error — so nothing looked broken except every themed color silently disappearing (page rendered plain browser-default white/black). Fixed by having every dark override reference the `-paper` variable instead of the active token itself, which never gets redefined and so can't cycle.
- **Second issue found in testing:** a plain `1 - l` invert on "elevated" surfaces (cards, panels, dropdowns, chips, table stripes/headers — literals that were *lighter* than the page background in Paper) made them slightly *darker* than the page in Sage, inverting the elevation cue instead of preserving it — modals and cards were nearly invisible against the page. Fixed by adding a `+ 0.06` lightness bump to just that surface family's dark-override formula (`calc(1 - l + 0.06)`), so they read as visibly elevated in both themes. `--surface-input` (form fields) was left as a plain invert — inset fields reading darker than their containing card is the conventional dark-UI look and read correctly as-is.
- Deliberately **excluded from tokenization** (left as hardcoded literals, fixed regardless of theme):
  - The entire "Count screen" CSS block — PRD 5.6 mandates it's always dark-mode regardless of the shell theme.
  - `cell-thumb-bg`, `addphotos-file-thumb`, `canvas-frame` (`oklch(0.18 0.01 145)`) and `cell-thumb-droplet` (`oklch(0.78 0.19 145)`) — these render the simulated fluorescence-microscopy placeholder image, which represents image content, not UI chrome, so it stays dark/green regardless of app theme.
  - `oklch(0.98 0.005 75)` (light text/border sitting on accent/danger/dark-overlay-colored surfaces, e.g. button text) and the `oklch(0.2 0.02 75 / alpha)` family (modal backdrops, box-shadows, dark tooltip/overlay backgrounds) — these are meant to stay constant regardless of shell theme (buttons keep enough contrast for light text in both themes; overlays are conventionally dark-translucent either way).
- `.graph-select` gained `appearance: none` — headless-Chromium testing showed the native `<select>` closed-box chrome doesn't reliably honor a custom dark `background-color`, even though the computed style was correct; this is a native-widget theming quirk that predates this change but was only visible once Sage's background stopped coincidentally matching the browser's default white. Trade-off: the native dropdown arrow is now gone in both themes (no custom arrow added, to keep scope contained); the control is still fully clickable/functional.

### `app.js`

- `CONFIG` gained `theme: 'paper'` as the shipped default.
- New `applyTheme(theme)`: sets `document.documentElement.dataset.theme` and persists to `localStorage`.
- `boot()` now resolves `localStorage.getItem('theme') || CONFIG.theme` and calls `applyTheme()` before the first `navigate()`, so there's no flash of the wrong theme on load. Also sets `document.title = CONFIG.appTitle` here (previously hardcoded "Lipid Counter" in `index.html`).
- `topbarHTML()` gained a `#theme-toggle` pill button (next to the avatar) showing the current theme name; `wireShell()` wires its click to flip `paper`/`sage`, call `applyTheme()`, and update its own label — no full shell re-render needed since the swap is pure CSS custom-property cascading off the `data-theme` attribute.
- `renderLogin()` and `renderResetPassword()`'s hardcoded "Cell Archive" eyebrow/title strings replaced with `${CONFIG.appTitle}` (the top bar already used it).
- `prototypeBadge` needed no code changes — already fully wired in Phase 1; confirmed still correct after the CSS refactor since `.badge` uses `var(--accent)`.

### Verification

Served the repo with `python -m http.server` and drove it with Python Playwright (headless Chromium 149, which supports relative-color `oklch(from ...)` syntax), logging in with the local test account.
- Walked Experiments → Conditions → Cells → Graph → Raw Data → Help → About, plus the Add Experiment modal, the card three-dot menu, the sidebar drawer, and the Add Photos screen, toggling the theme and screenshotting each — confirmed Sage renders as a genuine dark theme (near-black page, elevated lighter cards/panels/dropdowns, legible danger/warn/success colors, sage-green accent) and Paper is pixel-identical to before the refactor.
- Confirmed `document.title` and the login screen both reflect `CONFIG.appTitle`.
- Reloaded after toggling to Sage: `document.documentElement.dataset.theme` was still `sage` and there was no flash of Paper on the reload before that (confirmed the inverse too — reloading after toggling back to Paper stays Paper).
- Zero console/page errors across every screenshot pass.

### Follow-up: Sage was still too dark to make out folder cards

**Feedback:** after shipping the above, the user reported the dark theme was too dark — folder cards weren't distinguishable from the page background; asked for something "gray or a bit lighter."

The `calc(1 - l + 0.06)` elevation bump wasn't enough: `--surface-page-paper` (0.965) and `--surface-card-paper` (0.99) are only 0.025 apart in Paper, so even after the +0.06 bump their dark equivalents (~0.035 and ~0.07) were both still near-black and easy to confuse. Replaced the formula-derived approach for the surface/border token family specifically with explicit, hand-tuned lightness targets (still using `oklch(from var(--x-paper) <L> c 132)` to keep deriving hue/chroma from each token's own paper value, just with a fixed target `L` instead of a `1-l`-based calc) — a visible gray-scale ramp: page (0.06) < stripe (0.09) < surface-input (0.05, intentionally darkest as a sunken field) < card (0.14) < border-faint (0.15) < header (0.17) < chip (0.18) < tint (0.20) < header-hover (0.21) < tint-2 (0.23) < border-default (0.30) < border-strong (0.36) < border-emphasis (0.44). Text/accent/semantic tokens were untouched — those already read correctly in testing.

Re-verified with the same Playwright screenshot pass: folder cards, the Add Experiment modal, and the Conditions detail panel now show a clearly visible gray card against the darker page, with borders that stand out from both. Paper mode screenshots confirmed unchanged (only the `[data-theme="sage"]` block was touched).

### Follow-up: user asked for Sage "way lighter"

Bumped every value in the surface/border lightness ramp by roughly +0.16–0.18: page 0.06→0.22, card 0.14→0.32, chip 0.18→0.38, tint 0.20→0.40, tint-2 0.23→0.44, header 0.17→0.36, header-hover 0.21→0.42, stripe 0.09→0.26, input 0.05→0.18, border-default 0.30→0.50, border-strong 0.36→0.56, border-emphasis 0.44→0.64, border-faint 0.15→0.34 — same relative ramp shape, just shifted up into charcoal-gray territory instead of near-black. Text/accent/semantic tokens untouched (still read correctly at the new, lighter surface levels). Re-verified with the same screenshot pass; Paper confirmed unchanged.

### Follow-up: page background itself needed to be lighter

**Feedback:** the previous pass lightened cards/borders relative to the page, but the page background itself was still near-black; asked for the background to be lighter too.

Shifted the whole surface/border ramp up another ~+0.16: page 0.22→0.38, card 0.32→0.48, chip 0.38→0.54, tint 0.40→0.56, tint-2 0.44→0.60, header 0.36→0.52, header-hover 0.42→0.58, stripe 0.26→0.42, input 0.18→0.30, border-default 0.50→0.66, border-strong 0.56→0.70, border-emphasis 0.64→0.76, border-faint 0.34→0.50 — page now reads as a proper light-to-mid sage-gray instead of charcoal.

This pushed surfaces into the same lightness band the text tokens' `calc(1 - l)` formula was landing in — `--text-secondary` (paper 0.5 → dark 0.5) was about to sit at the *same* lightness as the new `--surface-card` (0.48), and `--text-faint`/`--text-faint-2` (paper 0.7 → dark 0.3) would've been *darker* than the new page (0.38), both effectively invisible. Switched every text token (plus `--accent`, `--accent-tint-soft`, `--accent-tint-strong`) from the formula to explicit targets too, keeping the same relative ordering as Paper (primary most prominent → faint least) but recalibrated so every one sits comfortably lighter than the surfaces it's actually rendered on: text-primary 0.95, icon-fill/text-emphasis 0.85, text-heading-fill 0.9, text-label 0.8, text-body 0.78, text-body-2 0.76, text-muted 0.72, text-secondary 0.68, text-faint/text-faint-2 0.62; accent 0.64, accent-tint-soft/strong 0.5. Semantic status tokens (danger/warn/success) were left alone — they're only ever short badges/small text, not verified as an issue, but flagged as worth a look if the user notices low contrast there next.

Re-verified with the full screenshot pass (Experiments, modal, Raw Data table, Conditions detail). Everything reads cleanly — white body text, muted secondary/meta text, and a legible green accent all sit clearly above the new lighter gray surfaces. Paper confirmed unchanged.

## Final step (per project convention)

`docs/tasks.md` Phase 13 items checked off with implementation notes. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 8 follow-up — Count screen zoom bar repositioned, top panel pinned

**Request:** move the hand-count screen's zoom controls from the bottom to the top, and make sure both the top panel and the zoom controls always stay on screen (don't scroll away).

Root cause of the "scrolls away" complaint: `.count-canvas` had `flex: 1` inside `.count-screen`'s flex column but no `min-height: 0`, and `.count-screen` used `min-height: 100dvh` instead of a fixed `height`. Flex items default to `min-height: auto`, so once the zoomed image exceeded the viewport, `.count-canvas` grew instead of scrolling internally — the whole page became the scroll container, taking the top panel with it. `.count-zoom-controls` was also `position: fixed; bottom/right`, floating independently of that scroll behavior.

### `app.js`

`renderCountHTML()`: moved the `.count-zoom-controls` markup from after `.count-canvas` to right after `.count-topbar` (before `.count-error`), so it renders as a top bar instead of a bottom-right overlay.

### `style.css`

- `.count-screen`: `min-height: 100dvh` → `height: 100dvh; overflow: hidden` — caps the screen to the viewport so it can never itself become the scroll container.
- `.count-canvas`: added `min-height: 0` — lets the `flex: 1` item actually shrink to its allotted space instead of growing past it, so its own `overflow: auto` is what scrolls when zoomed.
- `.count-topbar` and `.count-error`: added `flex-shrink: 0` so they hold their size and don't get squeezed by the canvas.
- `.count-zoom-controls`: dropped `position: fixed; right; bottom; z-index` and the rounded floating-pill styling; now a normal-flow flex row (`flex-shrink: 0`, centered, `border-bottom` instead of a full border/radius) sitting between the topbar and the canvas.

### Verification

Served the repo with `python -m http.server` and drove it with Python Playwright (real Chromium), logging in with the local test account, navigating Experiments → Conditions → Cells → Count.
- Screenshot at 100% zoom: zoom bar (−/100%/+) renders directly under the top panel (Cell name/Total/Cancel/Done), not floating bottom-right.
- Zoomed to 250% and scrolled the canvas (`scrollTop` moved to 61) plus a mouse-wheel scroll on the page: screenshot confirms the top panel and zoom bar are still fully visible and pinned; only the image content scrolled underneath.
- Measured directly: `window.scrollY` stayed `0` and `.count-screen`'s `scrollHeight === clientHeight` (both `700`) after zooming/scrolling — confirms the outer screen never became scrollable, only `.count-canvas` did.
- Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 8 amended with a follow-up note. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 13 follow-up — "needs count" tag illegible in Sage

**Request:** the "needs count" text on the Cells screen was orange and hard to read in the Sage theme; make it black.

`.status-tag-needs` (`style.css`) uses `color: var(--warn-text)`. `--warn-text` is a semantic status token that, per the Phase 13 dark-theme design, keeps its original hue (orange) and only inverts lightness (`calc(1 - l) c h`). For a mid-lightness source color (`--warn-text-paper` is `oklch(0.5 0.12 40)`), inverting lightness landed it back near `0.5` — almost the same lightness as the tag's own background (`--accent-tint-strong`, derived to ~0.5 lightness in Sage), so the orange text nearly disappeared into its chip.

### `style.css`

`--warn-text`'s Sage override (line ~168) changed from `oklch(from var(--warn-text-paper) calc(1 - l) c h)` to a hardcoded `oklch(0.1 0 0)` (near-black), per explicit user request — this token has exactly one consumer (`.status-tag-needs`), so there's no risk of an unintended effect elsewhere. Paper's `--warn-text-paper` value is untouched.

### Verification

Served with `python -m http.server`, drove with Python Playwright, logged in with the local test account, toggled to Sage via `#theme-toggle`, navigated to the Cells screen for "0 Hr Starved". Screenshot confirms "NEEDS COUNT" now renders in solid black against the sage-tinted tag background, clearly legible. `getComputedStyle` on `.status-tag-needs` confirmed `color: oklch(0.1 0 0)`. Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 13 amended with a follow-up note. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 11c follow-up — Store hand-count and auto-count points, editable hand counts

**Request:** "Save the hand counts as a grid of points that you can later edit, also save the auto count as a grid of the local maximas."

The Count screen already tracked marker positions client-side while counting (`countState.markers: [{ id, x, y }]`), but `finishCount()` only ever sent the total (`{ value: markers.length }`) to the API — positions were discarded on save, so a saved count could only be deleted and recounted from scratch, never adjusted. Separately, the auto-count watershed pipeline (`api/detection.py`) computed `peak_local_max` seed coordinates internally but only the region count survived to `cells.auto_count`.

### `api/detection.py`

`_fill_and_watershed` now returns `(labels, coords)` instead of just `labels`. `count_droplets` renamed `detect_droplets` and now returns `(count, points)`, where `points` is the `(row, col)` pixel coordinate of each watershed seed whose region survives `MIN_DROPLET_AREA_PX` — filtered by zipping `coords` against each seed's assigned label (`coords[i]` seeded label `i + 1`) so `len(points) == count` always holds. `render_hand_count_image` unpacks and discards the coords (`labels, _ = _fill_and_watershed(...)`), unaffected otherwise. Verified against a synthetic 5-blob 100×100 image: `detect_droplets` returned `count == 5` with each point landing exactly on its blob's center.

### `api/main.py`

`cells_from_tif` calls `detect_droplets`, converts its pixel-coordinate points to percent-of-crop (`{x, y}`, same convention the Count screen already uses for hand-count markers), and writes them to a new `cells.auto_points` column alongside `auto_count`. `CountBody` gained an optional `points: list[{x, y}]` field; `create_count` persists it to a new `counts.points` column. New `PUT /counts/{count_id}` endpoint (same body shape as `create_count`) updates an existing count's value and points in place and recomputes the condition's ICC, mirroring `create_count`/`delete_count`'s ownership checks. Neither new column exists on the live Supabase tables yet — no migrations folder in this repo, so (same as the earlier `source_filename` addition) the user needs to run `alter table counts add column points jsonb; alter table cells add column auto_points jsonb;` directly against Supabase before this deploys.

### `app.js`

- `finishCount()` now sends `points: countState.markers.map(m => ({x, y}))` alongside `value` on every save, for both the local test-account path and the real API path.
- `state.editingCount` (`{ id, points }` or `null`) added; `navigate('count', …)` resets it on every entry (not just when the caller passes it) so a stale edit target from a prior visit can't leak into a fresh count.
- Cells screen detail panel (`wireCells`'s `renderDetail`): a count whose `points` array is non-empty now renders as `<button class="count-value count-edit-btn">` instead of a plain `<span>`; clicking it calls `navigate('count', { cell, editingCount: { id, points } })`. Counts without stored points (pre-existing fixture/legacy data) stay a plain span — edit only applies where points exist, so old data still works via the existing delete-and-recount path.
- `renderCount()` preloads `state.editingCount.points` as `countState.markers` when present, and sets `countState.editingCountId`. The topbar cell-name label appends "· editing saved count" while in this mode.
- `finishCount()` branches on `countState.editingCountId`: if set, `PUT /counts/{id}`; otherwise the existing `POST /cells/{id}/counts`. Same branch mirrored in the local test-account in-memory path.

### `style.css`

Added `.count-edit-btn` (resets button chrome to match the existing plain-span `.count-value` look, `cursor: pointer`, `:hover` picks up `var(--accent)` + underline) so the new button doesn't inherit default UA button styling.

### Verification

Served with `python -m http.server` and drove with a temporary headless-Chrome harness (`_verify.html`/`_verify2.html`, deleted after use — no Node/Playwright in this environment) that logs in with the `local:` test token and calls `app.js`'s global functions directly (everything in `app.js` is global, matching the project's established harness pattern):
- Opened Cell 2 (`test-cond-001`, which starts with one pre-existing pointless count of value 4), clicked "Count", placed 3 markers via `addMarkerAt(20,20)/(50,50)/(75,30)`, called `finishCount()`.
- Re-selected the cell: DOM dump confirmed the new "3" count rendered as `<button class="count-value count-edit-btn">`, while the original "4" stayed a plain `<span>` (no stored points) — screenshot matches, both counts visible in the Hand counts list.
- Clicked the edit button: DOM dump confirmed `Total: 3`, three `.count-marker` elements present, and the cell-name label read "Cell 2 · editing saved count"; a screenshot of the resulting Count screen showed all 3 markers rendered at the same positions they were originally placed at.
- Zero console errors across both harness runs.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry; the Future section's "marker/location coordinates (currently count only)" line checked off. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 11c follow-up — All hand counts editable; auto count now viewable

**Request:** "The hand counts should be editable, and the auto count is currently not viewable."

The prior entry only made a hand count's edit button appear when it had stored `points` — pre-existing counts (test fixtures, or anything saved before the `points` column existed) had no edit path at all, just delete. And while `cells.auto_points` was being written by the backend, nothing in the frontend read it back — `auto_count` only ever showed as a plain number.

### `app.js`

- Cells screen detail panel (`wireCells`'s `renderDetail`): every hand count now renders as a `count-edit-btn`, unconditionally — the `c.points && c.points.length` gate is gone. `editingCount.points` defaults to `[]` when the count has none, so the Count screen simply opens empty (nothing to lose) instead of refusing to open.
- `cell.auto_count` now renders as `<button class="detail-value detail-value-btn" id="auto-count-view-btn">`; clicking it calls `navigate('count', { cell, viewingAutoPoints: cell.auto_points || [] })`.
- New `state.viewingAutoPoints`, reset on every `navigate('count', …)` call (same pattern as `state.editingCount`, so a stale view target can't leak into the next visit).
- `renderCount()` sets `countState.readOnly = true` when `viewingAutoPoints` is present and preloads those points as markers.
- `renderMarkerHTML(m, readOnly)`: read-only markers render as a non-interactive `<span class="count-marker count-marker-readonly">` instead of a removable `<button>`.
- `renderCountHTML()`: read-only mode omits the "Done" button entirely and relabels "Cancel" to "Close"; topbar label appends "· auto count (view only)" instead of "· editing saved count".
- `wireCount()`: frame click-to-add and marker click-to-remove listeners are skipped entirely when `countState.readOnly` — zoom controls stay wired (useful for inspecting tight point clusters). `doneBtn` lookup is now null-guarded since it doesn't exist in read-only markup.
- Added `auto_points` to two local test-mode fixture cells (`test-cell-001`: 3 points matching `auto_count: 3`; `test-cell-003`: 5 points matching `auto_count: 5`) so the view-only flow is exercisable without a live backend.

### `style.css`

- `.detail-value-btn`: resets button chrome (border/background/padding/cursor) without touching `font-size`, so it composes with the existing `.detail-value` class instead of fighting it — the earlier `.count-edit-btn` used a `font: inherit` shorthand that would have clobbered `.detail-value`'s `font-size` if reused here.
- `.count-marker-readonly`: recolors the marker dot blue (`oklch(0.7 0.15 230)`) against the hand-count red (`oklch(0.58 0.22 25)`) and sets `pointer-events: none`, so the auto-count grid is both visually and interactively distinct from editable hand-count markers.

### Verification

Served with `python -m http.server`, drove with a temporary headless-Chrome harness (`_verify3.html`, deleted after use). Single run, two flows:
- Opened Cell 2 (one pre-existing count, value 4, no stored points). DOM check confirmed its edit button is a real `<button>` (previously it would have been a plain, non-clickable `<span>`). Clicked it: Count screen opened with `Total: 0` (nothing to restore) and the Done button present — still fully editable, just starts from an empty canvas.
- Cancelled out, opened Cell 3 (`auto_count: 5`, `auto_points`: 5 fixture points). Confirmed the auto-count button renders text "5". Clicked it: DOM check confirmed 5 `.count-marker-readonly` elements and 0 interactive `.count-marker`s, `Total: 5`, cell-name label "Cell 3 · auto count (view only)", no `#count-done` in the DOM, and the Cancel button read "Close". Dispatched a synthetic click on the canvas frame — marker count stayed at 5 (confirms read-only mode blocks adding points). Screenshot confirms 5 blue markers rendered at their fixture positions, clearly distinct from the red/editable hand-count marker style. Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 11c follow-up — Edit/View as separate buttons, not the count value

**Request:** "The auto count and hand count should be viewed/edited with a button next to it, not by clicking the number."

Both prior entries made the count *value itself* the interactive element (`<button class="count-value count-edit-btn">${c.value}</button>`, `<button class="detail-value detail-value-btn">${cell.auto_count}</button>`) — worked, but a bare number gave no visual signal it was clickable and made it impossible to just read the value without risking triggering edit/view.

### `app.js`

`wireCells`'s `renderDetail`:
- Hand count list item: value reverted to a plain `<span class="count-value">`; added a `<span class="count-actions">` wrapper holding two separate buttons — "Edit" (`count-edit-btn`) and the pre-existing "×" delete (`count-delete-btn`) — pushed right by `.count-list-item`'s existing `justify-content: space-between`.
- Auto count row: value reverted to a plain `<span class="detail-value">` inside a new `<div class="detail-value-row">`, alongside a separate "View" button (`detail-value-btn`).
- No changes to the event-wiring code (`panel.querySelectorAll('.count-edit-btn')`, `#auto-count-view-btn`) — same classes/ids, just now on dedicated buttons instead of the value element.

### `style.css`

- `.count-edit-btn` restyled from "looks like plain text, turns accent-colored on hover" to an always-visible small underlined accent-colored text button — same treatment as the existing `.login-link` pattern, so "Edit" now reads as a button at rest.
- `.detail-value-btn` restyled the same way for "View".
- New `.count-actions` (flex row, `0.25rem` gap) and `.detail-value-row` (flex row, `0.5rem` gap) wrappers for the new value+button layouts.

### Verification

Served with `python -m http.server`, drove with a temporary headless-Chrome harness (`_verify4.html`, deleted after use). Opened Cell 3 (2 hand counts, `auto_count: 5` with fixture points). DOM check confirmed: hand count value is a `<span>` (not a button); "Edit" and "×" delete are separate `<button>`s; auto-count value is a `<span>` reading "5"; "View" is a separate `<button>`. Dispatched clicks directly on the bare value `<span>`s (both a hand-count value and the auto-count value) — no `.count-screen` appeared, confirming the app stayed on the Cells screen and the number itself is no longer clickable. Screenshot confirms the visual layout: "5 View" next to Auto count, and each hand count row showing "N Edit ×" as distinct underlined action buttons beside plain-text values. Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Phase 11c follow-up — Auto count row matches hand-count row styling

**Request:** "Make the auto count number on the left same as the hand counts."

The auto count row (`<div class="detail-value-row">`) was plain text on a transparent background — no chip — while the hand-count rows below it (`<ul class="count-list"><li class="count-list-item">`) each get a `var(--surface-chip)` background and padding. Conceptually the same shape (a value + an action button) but visually inconsistent.

### `app.js`

`wireCells`'s `renderDetail`: the auto count row now uses the identical `<ul class="count-list"><li class="count-list-item">` wrapper as hand counts — `<span class="count-value">${cell.auto_count}</span>` on the left, `<span class="count-actions"><button class="count-edit-btn" id="auto-count-view-btn">View</button></span>` on the right. The "View" button now reuses `.count-edit-btn` (rather than a separate `detail-value-btn` class) since it sits in the same chip context as the hand-count "Edit" buttons.

### `style.css`

Removed `.detail-value-row` and `.detail-value-btn` — both now unused, since the auto-count row no longer has its own bespoke markup/class.

### Verification

Served with `python -m http.server`, drove with a temporary headless-Chrome harness (`_verify5.html`/`_verify6.html`, deleted after use). Confirmed `#auto-count-view-btn` still resolves, reads "View", and clicking it still opens the read-only auto-count viewer unchanged (5 blue markers, "auto count (view only)" label, `Total: 5`). Confirmed 3 total `.count-list-item` elements in Cell 3's detail panel (1 auto count + 2 hand counts). Screenshot of the detail panel confirms the auto count row ("5 View") now renders with the same chip background/padding/layout as the hand-count rows below it ("3 Edit ×", "2 Edit ×"). Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

---

## Hand-count image reverted to grayscale, blur trimmed further

**Request:** "Revert the image processing for the hand counts so its still grayscale, but remove some of the blur."

`cells.image_url` (the stored hand-count image) had drifted, across several prior commits, from a grayscale render into a stark binary (0/65535) black-and-white watershed mask — `render_hand_count_image` ran `subtract_background` → `threshold_binary` → fill-holes → watershed and rendered `labels > 0`, no grayscale left at all. Traced the history back to an earlier grayscale approach (`preprocess_for_detection`, rolling-ball background subtraction + CLAHE contrast enhancement) that had itself been tuned once before for excess blur (`CLAHE_CLIP_LIMIT` `0.01` → `0.005`, "Less blur" commit) before being replaced entirely by the binary pipeline.

### `api/detection.py`

- `render_hand_count_image(plane)` reverted to a real grayscale render: `subtract_background` (rolling-ball, unchanged `BACKGROUND_BALL_RADIUS_PX=12`) → `equalize_adapthist` (CLAHE) → scaled back to uint16. No longer touches `threshold_binary`/fill-holes/watershed at all.
- `CLAHE_CLIP_LIMIT` reintroduced at `0.003` — lower than the `0.005` it was last tuned to, per the user's request to trim the smearing/blur further. (skimage's `0.01` default was the version reported as "very blurry" back when this path was first added; `0.005` improved it; `0.003` continues that direction.)
- `detect_droplets` (the auto-count path) is unchanged — still its own independent `subtract_background` → `threshold_binary` → fill-holes → watershed pass, never touching `render_hand_count_image`'s output.
- `_fill_and_watershed` dropped its `watershed_line` parameter (always hardcoded to the watershed default now) since `detect_droplets` was its only remaining caller after `render_hand_count_image` stopped using it.
- Stale docstrings referencing the old shared binary pipeline (`subtract_background`, `threshold_binary`, `detect_droplets`) updated to reflect the current split.

### `api/main.py`

- Comment above the `cells_from_tif` per-box crop loop updated — no longer claims `render_hand_count_image` and `detect_droplets` share a threshold/watershed pass; now correctly describes `render_hand_count_image` as producing the grayscale render and `detect_droplets` as an independent auto-count pass.

### Verification

No live Supabase/Render deploy available to exercise end-to-end, so verified the Python pipeline directly: built a synthetic 200×200 uint16 plane with 3 Gaussian-blob "droplets" over noise, ran `render_hand_count_image` and confirmed the output is a genuine multi-level grayscale image (298 distinct intensity levels spanning the full 0–65535 range) rather than the old binary 0/65535-only mask. Ran `detect_droplets` on the same synthetic plane and confirmed it still finds all 3 blobs at their correct coordinates, unaffected by the `render_hand_count_image` change. `ast.parse` confirms both `api/detection.py` and `api/main.py` are syntactically valid.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Vertical (portrait) cell image cut off at top on the Count screen

**Request:** "The hand count screen cuts off the top of the image at 100% zoom if it's a very vertical image."

### Diagnosis

A prior fix (see the `is-zoomed` entry above) addressed `.count-canvas`'s centered flex alignment trapping scroll when the frame overflows — the browser can't scroll to the negative offset needed to reach a centered overflowing child's near edge — by adding `.count-canvas.is-zoomed { align-items/justify-content: flex-start }`, toggled only when `zoom > 100%`. But `#count-frame`'s height is driven entirely by the image's real aspect ratio (`wireCount()` sets `frame.style.aspectRatio` from `img.naturalWidth`/`naturalHeight`), while its width is capped at `100%`/`55rem`. A very tall/narrow (portrait) image can therefore overflow `.count-canvas` vertically even at 100% zoom, a case the zoom-conditional class never covered — reproducing exactly the same scroll-trap bug, just without needing to zoom in first.

### `style.css`

`.count-canvas` changed from `align-items: center; justify-content: center` to `align-items: safe center; justify-content: safe center` (unconditionally). The CSS `safe` keyword centers content when it fits and automatically falls back to start-alignment whenever it doesn't — covering both the old zoomed-in case and the new tall-image-at-100%-zoom case with no JS involved. Removed the now-redundant `.count-canvas.is-zoomed` rule.

### `app.js`

Removed the `is-zoomed` class wiring made obsolete by the CSS change: the conditional `' is-zoomed'` string in `renderCountHTML()`'s canvas div, and the `classList.toggle('is-zoomed', …)` call in `setCountZoom()`.

### Verification

Served the site with `python -m http.server` and drove it with a headless-Chromium Playwright script (no `chromium-cli` on this machine, so used Playwright's Python sync API directly as the documented fallback). Injected a synthetic 300×1400 SVG data-URI image (green "TOP" band, red "BOTTOM" band) directly into `countState`/`renderCountHTML()`/`wireCount()` to simulate a very vertical cell image without a live Supabase/Render deploy.

- Reproduced the bug first: temporarily forced the old `align-items: center; justify-content: center` (pre-fix) via an injected stylesheet — confirmed the "TOP" band was cut off and stayed unreachable even after setting `scrollTop` to its maximum value, while "BOTTOM" was reachable. This matches the reported symptom exactly (top cut off, not bottom).
- Re-ran against the actual fixed CSS/JS: "TOP" is visible flush at the top of the canvas by default, and scrolling to `scrollHeight` reveals "BOTTOM" flush at the bottom — both edges reachable at 100% zoom.

## Final step (per project convention)

`docs/tasks.md` Phase 8 amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Graph screen: metric selector (auto count / hand count avg / combined avg)

**Request:** "In the graph, add options to view only the auto counts, the average hand counts, or the average of both."

The Graph screen previously only plotted `cells.auto_count` per cell (and its condition mean), matching the original Phase 9 scope note that this was deliberately *not* the hand-count average (that's what the Conditions screen's mini chart uses). This adds a way to switch between the two, plus a combined view, without touching the mini chart's behavior.

### `app.js`

- Added `GRAPH_METRICS` (`auto`/`hand`/`combined`), each with a sidebar option label and a y-axis label.
- Added `cellValueForMetric(cell, metric)`: returns `cellAutoCount(cell)` for `'auto'`, `cellAverage(cell)` (existing hand-count-average helper) for `'hand'`, and for `'combined'` averages the two — falling back to whichever one is present if only one exists, `null` if neither does. Added `conditionMeanForMetric(cond, metric)`, the condition-level equivalent of the existing `conditionAutoCountMean` (removed — now dead code, superseded by this).
- `graphState` gained a `metric` field (default `'auto'`, matching the prior fixed behavior), persisted across add/remove within a visit the same way `colorAssignments` already does.
- Sidebar gained a "Metric" `<select>` (`#graph-metric-select`), styled with the existing `.graph-field`/`.graph-select` classes to match the Experiment/Condition selects. Its `change` handler sets `graphState.metric` and re-renders the chart area.
- `renderGraphScatterSVG` now takes `metric` and uses `cellValueForMetric`/`conditionMeanForMetric` instead of the old auto-only helpers for both per-cell dot placement and the mean tick; y-axis label pulled from `GRAPH_METRICS[metric].axisLabel`.
- Tooltip: kept the existing "Hand counts"/"Auto count" rows unconditionally (still useful context regardless of what's plotted), and appends one more row with the metric's label and the plotted value — but only when the metric isn't `'auto'`, since otherwise that row would just repeat the existing "Auto count" line verbatim.

### Verification

Served with `python -m http.server` and drove it with a headless-Chromium Playwright script (Python sync API — no `chromium-cli` on this machine). Logged in with the `local:` test account, navigated to Graph, added all three conditions of the "Serum Starvation Timecourse" experiment, and stepped through all three metric options:

- Confirmed the metric `<select>` lists all three options with the expected labels and the y-axis label text updates correctly for each.
- Screenshot per metric confirms the plotted dots/means actually move: "Auto count" only shows the 2 cells (out of 4 per condition) that have an `auto_count` in the local test fixtures; "Average hand count" shows all 4 cells per condition (test fixtures have hand counts on every cell); "Average of both" shows a distinct in-between layout from "Average hand count" (confirming it isn't silently falling back to one or the other).
- Hovering a dot with `'combined'` selected on a cell that has an `auto_count` but no hand counts (`counts: []`) confirmed the tooltip's added row reads "Average of both: 3.0" — matching a pure fallback to the auto count, not `null`/`NaN`.
- Checked `console --errors`-equivalent (`page.on('console', ...)` filtered to `error`) across the whole run: zero.

## Final step (per project convention)

`docs/tasks.md` Phase 9 amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Cells screen: low-res preview thumbnail in the detail panel

**Request:** "Show a low-res preview of the cell on the side panel right under the cell name."

### `app.js`

`wireCells`'s `renderDetail` now builds a `preview` string the same way the Count screen's `renderCountHTML` already does: a real `<img class="detail-thumb-img">` pointed at `cell.image_url` when present, otherwise a fallback via the existing `renderCellThumbnailSVG(cell)` (the same seeded-random green-droplets-on-dark-background SVG already used for the grid cards, keyed off `cell.id` so it's stable across re-renders). Inserted as a `.detail-thumbnail` wrapper immediately after `.detail-name`, before the "Source file"/"Average hand count" rows.

### `style.css`

Added `.detail-thumbnail` (100px tall, rounded corners, `overflow: hidden`, matching the grid's `.cell-thumbnail` sizing convention) and `.detail-thumb-img` (`object-fit: cover`, fills the container) — mirroring `.photo-preview-img`'s pattern from the Count screen.

### Verification

No `chromium-cli` or Playwright/Node available in this environment (no `node`/`npx` on PATH). Served the site with `python -m http.server`, launched Chrome for Testing headless (`--headless=new --remote-debugging-port --remote-allow-origins=*`) via Python's `websocket-client` speaking raw Chrome DevTools Protocol directly (`Page.navigate`, `Runtime.evaluate`, `Page.captureScreenshot`) since neither Playwright nor `chromium-cli` were installed. Logged in via the `local:` test token, drilled Experiments → Conditions → Cells, and clicked a cell card. Confirmed via `Runtime.evaluate` that `.detail-thumbnail` renders in the DOM, and via screenshot that it displays correctly sized directly under the cell name, above "Source file"/"Average hand count" — matching the requested placement, since a DOM check alone can miss real layout/CSS bugs.

## Final step (per project convention)

`docs/tasks.md` Phase 6 amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Graph screen: metric control changed from dropdown to checkboxes, default to "Average of both"

**Request:** "can it be 3 checkboxes instead, with average of both being the default"

Follow-up to the metric-selector entry above. Asked the user to clarify whether the checkboxes should allow multiple metrics plotted at once (overlay) or stay single-choice like the dropdown did — they confirmed single-choice, just styled as checkboxes rather than a `<select>`.

### `app.js`

- Sidebar `#graph-metric-select` `<select>` replaced with three `<input type="checkbox" class="graph-metric-input">` elements (one per `GRAPH_METRICS` entry), each wrapped in a `<label class="graph-metric-checkbox">`.
- `wireGraph`: each checkbox gets a `change` listener enforcing single-choice — checking one sets `graphState.metric` and unchecks the rest; unchecking the currently-active one (the only way to get to zero checked) immediately re-checks it instead, so exactly one is always checked.
- `graphState.metric`'s default changed from `'auto'` to `'combined'` (both in `initGraph` and the checkbox markup's initial `checked` attribute), matching the new default request.

### `style.css`

Added `.graph-metric-checkboxes` (column flex, `0.5rem` gap) and `.graph-metric-checkbox` (row flex, body font at `0.8125rem`, `--text-body-2`) plus `.graph-metric-checkbox input { accent-color: var(--accent) }` so the native checkbox tint matches the app's accent color instead of the browser default blue.

### Verification

Served with `python -m http.server`, drove with a headless-Chromium Playwright script. Confirmed on load only "Average of both" is checked and the axis label reads "(combined avg)"; clicking "Auto count" checks it, unchecks the other two, and updates the axis label to "(auto count)"; clicking the currently-checked "Auto count" box again (attempting to uncheck it) leaves it checked; clicking "Average hand count" switches cleanly to it with the other two unchecked. Screenshot confirms the sidebar checkbox layout reads correctly. Zero console errors.

## Final step (per project convention)

`docs/tasks.md` Phase 9 amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Auto-count: FM_edge_overlay added as a second, switchable detection algorithm

**Request:** Port the lab's `assets/ALDQ.ijm-20181102151807.txt` ImageJ macro's LD-determination steps (its `FM_edge_overlay` count + maxima grid) into the Python auto-count pipeline, with the macro's settings dialog hardcoded to fixed values instead of prompted. Requested as a second, switchable algorithm — not a replacement for the existing Otsu/watershed pipeline.

### `api/detection.py`

- Existing `detect_droplets` body renamed **verbatim** to `_detect_droplets_otsu_watershed` — no logic changes, so its behavior is unchanged from before this entry.
- New `_detect_droplets_fm_edge_overlay(plane)`: a direct port of the macro's LD-determination section (lines ~1058–1230), built from four new helpers:
  - `_iterative_sharpen` — the macro's `sixteenbitsegmentation()` unsharp-mask add-back loop, run `FM_PREPROCESS_ITERATIONS=3` times with `sigma=FM_BLUR_DURING_SIGMA=1`, clipped to the 16-bit range each cycle (only the macro's 16-bit branch is needed since `normalize_to_uint16` already puts every crop on a 0–65535 scale).
  - `_edge_particle_mask` — Sobel ("Find Edges") → 8-bit rescale → `_phansalkar_threshold` (Fiji `Auto_Local_Threshold`'s Phansalkar defaults: k=0.25, r=0.5, p=2, q=10, radius `FM_LOCAL_THRESHOLD_RADIUS=10`) → invert → fill-holes/watershed (reuses the existing `_fill_and_watershed`, unchanged) → keeps only regions with `15 <= area <= 1,000,000` px and `0.4 <= circularity <= 1.0` (`FM_MIN/MAX_PARTICLE_AREA_PX`, `FM_MIN/MAX_CIRCULARITY`).
  - `_find_maxima` — `skimage.morphology.h_maxima(image, h=FM_FIND_MAXIMA_NOISE=4000)` as the closest available equivalent to ImageJ's prominence-based `Find Maxima`, reduced to one (brightest-pixel) point per surviving plateau.
  - The final count/grid is the intersection: maxima (found on the sharpened image additionally blurred by `FM_BLUR_AFTER_SIGMA=1`) that land on a pixel `_edge_particle_mask` accepted — implemented as a direct mask lookup per maximum rather than the macro's own ImageJ-specific pixel-arithmetic trick (`Subtract create`/`Invert` on a point-selection-restricted `Apply LUT`), since that trick's exact semantics can't be verified without running Fiji. The macro's own inline comment states the intent this directly implements: *"Local maxima that were not located on edge defined particles are lost here!"*
- `varwsblurring` (Classic Watershed Blurring, macro value 2) and the macro's per-image pixel-size dialog (6.5 µm) are recorded as `FM_CLASSIC_WATERSHED_BLUR_RESERVED`/`FM_PIXEL_SIZE_UM_RESERVED` — both only feed the macro's optional LD-volume/Classic-Watershed-flooding branch (`title16`–`title20`), which this port doesn't implement, and neither has any effect on the pixel-based size/circularity thresholds actually used.
- New public `detect_droplets(plane, algorithm="otsu_watershed")` dispatcher (`DETECTION_ALGORITHMS = ("otsu_watershed", "fm_edge_overlay")`) replaces the old function as the module's public entry point; raises `ValueError` on an unrecognized algorithm name.
- New imports: `skimage.filters.sobel`, `skimage.morphology.h_maxima`. No new dependency — both are already in `scikit-image` (already in `api/requirements.txt`).

### `api/main.py`

- `cells_from_tif` gains `algorithm: str = Form("otsu_watershed")`, validated against `DETECTION_ALGORITHMS` (`422` on an unrecognized value, same pattern as the existing `boxes` JSON-parse-failure check just above it), passed straight through to `detect_droplets(normalized_crop, algorithm=algorithm)`.
- Each created cell row now also stores `auto_algorithm` (the algorithm string) for provenance — new `cells.auto_algorithm` **text** column, **not yet applied to the live Supabase `cells` table** (same situation as `source_filename`/`auto_points`/`counts.points` before it): run `alter table cells add column auto_algorithm text;` directly against Supabase before this deploys.

### `app.js` / `style.css`

- `addPhotosState` (reset in `renderAddPhotos()`) gains `algorithm: 'otsu_watershed'`.
- `renderAddPhotosHTML()`'s topbar-left gained a `<select id="addphotos-algorithm">` with two options, "Standard" (`otsu_watershed`, default-selected) and "FM_edge_overlay (ALDQ)" (`fm_edge_overlay`) — applies to every file/box created in that Add Photos session (no per-box granularity).
- `wireAddPhotos()` wires the select's `change` event to update `addPhotosState.algorithm` directly (no full re-render needed).
- `confirmAddPhotos()`'s per-file `FormData` gains `formData.append('algorithm', addPhotosState.algorithm)` alongside the existing `boxes` field. The local-test-account branch ignores it, same as it already ignores real detection entirely.
- `style.css`: new `.addphotos-algorithm-select` rule, matching `.graph-select`'s look (theme tokens, `appearance: none`) sized down to sit under the mono instructions line.

### CLAUDE.md

Updated the `cells.auto_count`/`cells.auto_points` schema bullets to describe both algorithms and document the new `cells.auto_algorithm` column.

### Verification

No live Supabase credentials in this environment (same as every prior Phase 11c entry), so full `POST /conditions/{id}/cells/from-tif` end-to-end verification isn't possible here. Instead:

- A standalone script loaded `assets/Image_43391.tif` (cropped to its central 40%×40%, `820×820`px) via `imaging.load_tif_plane`/`normalize_to_uint16` and called `detect_droplets` with both `algorithm` values: `otsu_watershed` → 176 droplets (0.85s), `fm_edge_overlay` → 184 droplets (1.20s), both with `len(points) == count` and no exceptions; `detect_droplets(crop, algorithm="bogus")` raised `ValueError` as expected. `_detect_droplets_otsu_watershed`'s body is a verbatim rename of the pre-change `detect_droplets` (confirmed by inspection, not just by the run), so its behavior is unchanged.
- Rendered both algorithms' points as a dot overlay on the crop (Pillow, saved to the scratchpad) and visually confirmed `fm_edge_overlay`'s markers land on the bright droplet puncta inside the cell body, not on background — comparable coverage/density to the existing `otsu_watershed` overlay.
- Served the site locally (`python -m http.server`) and drove it with a headless Playwright/Chromium script using the `local:` test account (`test@example.com`/`test`): logged in, drilled Experiments → Conditions → Cells → Add Photos, confirmed `#addphotos-algorithm` renders with `Standard`/`FM_edge_overlay (ALDQ)` options and `otsu_watershed` pre-selected (screenshot-verified), switching it updates `addPhotosState.algorithm`, and — with the algorithm switched — uploading `assets/Image_43391.tif` and clicking the canvas still draws a box correctly (screenshot-verified). Zero console/page errors across both runs.
- `api/detection.py` and the edited region of `api/main.py` are syntactically valid (`ast.parse`); a full `import main` isn't possible in this local environment independent of this change — `pandas`/`pingouin` (an existing `api/requirements.txt` dependency) aren't installed here, the same pre-existing environment gap noted by prior entries' "no live Supabase credentials" caveat.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Cells screen: detail panel shows which auto-count model produced `auto_count`

**Request:** "Make the cell side panel show what auto model was used." Follow-up to the `fm_edge_overlay` second-algorithm entry above — now that `cells.auto_algorithm` exists, surface it where a researcher would actually read it.

### `app.js`

- New `AUTO_ALGORITHM_LABELS` map + `autoAlgorithmLabel(algorithm)` helper (next to `cellAutoCount`), reusing the exact display text the Add Photos `<select id="addphotos-algorithm">` already uses ("Standard" / "FM_edge_overlay (ALDQ)") so the label reads the same wherever it appears.
- `wireCells`'s `renderDetail`: when `cell.auto_algorithm` is set, a `<span class="detail-submeta">Model: …</span>` line is appended directly under the Auto count row's `count-list` (inside the same `${cell.auto_count != null ? ... : ''}` block, so it never shows for a cell with no auto-count at all — there's nothing to attribute a model to).
- `TEST_CONDITIONS` fixtures: `test-cell-001` gained `auto_algorithm: 'otsu_watershed'`, `test-cell-003` gained `auto_algorithm: 'fm_edge_overlay'`, so both labels — and the "no model line" case (`test-cell-002`, no `auto_count`) — are exercisable via the `local:` test account without a live backend.

### `style.css`

New `.detail-submeta` rule: small mono text (`0.6875rem`), `--text-secondary`, `margin-top: 0.25rem` — visually subordinate to the `.count-value`/`.detail-label` it sits under.

### Verification

Served locally (`python -m http.server`) and drove it with headless Playwright/Chromium using the `local:` test account: selected Cell 1 → detail panel shows "Model: Standard"; Cell 3 → "Model: FM_edge_overlay (ALDQ)"; Cell 2 (no `auto_count`) → zero `.detail-submeta` elements, confirming the line only appears alongside an actual auto-count. Screenshot-confirmed placement (directly under the Auto count row's value/View button, above Hand counts). Zero console/page errors.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Add Photos screen: labeled the model selector and moved it to the top right

**Request:** "In the add photos screen, add the words 'Auto-count model: ' before the selector for the model, and also move the model selector to be at the top right of the screen."

### `app.js`

- `renderAddPhotosHTML()`'s topbar-left no longer holds `<select id="addphotos-algorithm">`. It now sits in a new `.addphotos-topbar-right` group alongside the existing Cancel/Create buttons, wrapped in `.addphotos-algorithm-field` with a preceding `<label class="addphotos-algorithm-label" for="addphotos-algorithm">Auto-count model: </label>`. `id="addphotos-algorithm"` is unchanged, so `wireAddPhotos()`'s existing `change` listener needed no edit.

### `style.css`

- `.addphotos-topbar-right`: new column flex group (`align-items: flex-end`), holding the algorithm field above the existing `.addphotos-topbar-actions` row, right-aligned under the topbar's `space-between`.
- `.addphotos-algorithm-field`: new row flex wrapper for the label + select.
- `.addphotos-algorithm-label`: new rule, mono/secondary-text styling matching `.addphotos-instructions`.
- `.addphotos-algorithm-select`: dropped the `margin-top` it had when stacked under the instructions line (no longer needed now that it's in its own row).

### Verification

Served locally (`python -m http.server`) and drove it with headless Playwright/Chromium using the `local:` test account: logged in, drilled Experiments → Conditions → Cells → Add Photos, screenshot-confirmed the "Auto-count model:" label + selector render at the top right of the screen, above the Cancel/Create buttons, with "Standard" pre-selected. Zero console/page errors.

## Final step (per project convention)

`docs/activity.md` updated with this entry. No `docs/tasks.md` change — this is a UI-copy/layout tweak to already-shipped Phase 11c work, not a new task-list item. No `docs/plan.md` entry — the change was small enough not to warrant a separate plan (single Edit to markup + CSS, no design decisions to record).

## Cells screen: "View all" button overlays every hand count on the cell image

**Request:** "Add a view counts button on the side panel for cells, which shows all the grids of counts overlayed on the cell image."

### `app.js`

- New `state.viewingAllCounts` (counts array), reset on every `navigate('count', ...)` entry alongside the existing `state.viewingAutoPoints`/`state.editingCount` resets.
- `wireCells`'s `renderDetail`: a "View all" link button (`#counts-viewall-btn`, `.count-edit-btn`) added next to the "Hand counts" label (new `.detail-label-row` wrapper), shown whenever the cell has one or more hand counts. Click navigates to the Count screen with `viewingAllCounts: counts`.
- `renderCount()`: when `state.viewingAllCounts` is set, builds `countState.compareGroups` -- one entry per count (`label`: "Count 1"/"Count 2"/..., a fixed `colorClass`, its `value`, and its own `points` mapped to markers). `readOnly` is true in this mode (same as auto-count viewing): no click-to-add, "Close" instead of "Cancel", no Done button.
- `renderCountHTML()`: when `compareGroups` is set, all groups' markers render simultaneously (each wrapped in its group's color class) instead of the single `markers` array; the header shows "comparing N hand counts" instead of "Total: N"; a new `.count-legend` bar (name + total per count) renders below the zoom controls -- mandatory whenever >=2 series share a canvas so color is never the only way to tell them apart.
- `renderMarkerHTML(m, readOnly, groupColorClass)` gained the optional third parameter to append a group's color class onto a read-only marker.
- `TEST_CONDITIONS` fixtures: `test-cell-003` (2 hand counts) and `test-cell-011`/Cell 4 (3 hand counts) had their counts' `points` filled in (previously value-only, no points), so "View all" has something to render via the `local:` test account.

### `style.css`

- `.detail-label-row`: flex row (label + "View all" button, space-between).
- `.count-marker-group-1/2/3`: red (`oklch(0.58 0.22 25)`, same hue as the normal editable hand marker), aqua (`oklch(0.68 0.15 175)`), gold (`oklch(0.75 0.15 85)`) -- fixed order, spaced apart in hue and off blue (`oklch(0.7 0.15 230)`, already `.count-marker-readonly`'s auto-count color).
- `.count-legend`/`.count-legend-item`/`.count-legend-swatch`: a chip-and-swatch legend bar matching the existing zoom-controls bar's dark styling.

### Verification

Served the site locally (`python -m http.server`) and drove it with headless Playwright/Chromium via the `local:` test account: opened Cell 3's detail panel (screenshot -- "View all" renders next to Hand counts), clicked it and confirmed the Count screen shows both hand-count grids overlaid (5 markers total: 3 red + 2 aqua), legend text "Count 1: 3 · Count 2: 2", header "Cell 3 · comparing 2 hand counts" (screenshot). Repeated for Cell 4 (3 hand counts) -- all 3 colors render with a 3-item legend (screenshot). Zero console/page errors across both runs.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Cells screen: "View all counts" now includes the auto count, moved below the Count button

**Request:** "Make it show the auto counts, and move the view button to below the big count button."

### `app.js`

- `state.viewingAllCounts` reshaped to `{ counts, autoPoints }` (was a bare counts array) so the auto-count grid travels alongside the hand counts in one navigation payload; built as `{ counts, autoPoints: cell.auto_points || null }` in `renderDetail`.
- `renderCount()`'s `compareGroups` appends a fourth group -- `{ label: 'Auto count', colorClass: 'count-marker-group-auto', ... }` -- whenever `autoPoints` is present, after the hand-count groups.
- `renderDetail`: the button moved out of the "Hand counts" label row (that row and its now-unused `.detail-label-row` wrapper reverted to a plain label) and now renders as its own full-width `#counts-viewall-btn`/`.count-viewall-btn`, labeled "View all counts", directly below the `needsMore`-gated "Count" button. Visibility condition widened from `counts.length > 0` to `counts.length > 0 || cell.auto_count != null`, so it shows even for a cell with an auto-count but no hand counts yet.
- `renderCountHTML`'s mode label generalized from "comparing N hand counts" to "comparing N counts" to cover the mixed hand+auto case.

### `style.css`

- `.count-marker-group-auto`: same blue as `.count-marker-readonly`'s default, so the auto grid looks identical whether viewed standalone or folded into this overlay.
- `.count-viewall-btn`/`:hover`: full-width outlined secondary button (accent border/text, transparent background) styled to sit directly under `.count-cta-btn`.
- Removed `.detail-label-row` (no longer referenced).

### Verification

Served locally (`python -m http.server`) and drove it with headless Playwright/Chromium via the `local:` test account: Cell 3 (2 hand counts + auto_count 5) -- screenshot confirms "View all counts" sits below "Count" in the detail panel; opening it shows 3 legend entries ("Count 1: 3 · Count 2: 2 · Auto count: 5"), 10 markers total, header "Cell 3 · comparing 3 counts" (screenshot). Cell 4 (3 hand counts, no auto) -- unchanged, 3 groups, 10 markers. Cell 1 (0 hand counts, auto_count 3) -- button still renders (screenshot), opens to a single "Auto count: 3" group with 3 markers. Zero console/page errors across all three.

## Final step (per project convention)

`docs/tasks.md` Phase 11c amended with this entry. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Top bar: profile icon swapped to DefaultProfile.png, logout moved into a popup on click

**Request:** "Use the @assets/DefaultProfile.png instead of the user icon at the top right, and move the logout to a popup that shows when you click on this profile icon."

### `app.js`

- `topbarHTML()`: the letter-initial `.avatar` div replaced with a `.profile-menu` -> `.profile-btn` (`<img src="assets/DefaultProfile.png">`) that opens a `.profile-dropdown` showing `currentUser()` and a "Log out" item (`#profile-logout`).
- `sidebarHTML()`: `.sidebar-logout` button removed.
- `wireShell()`: new toggle-open / outside-click-closes wiring for the profile dropdown, mirroring the existing `wireCardMenus` three-dot-menu pattern; new module-level `profileMenuDocHandler` (alongside the existing `escHandler`) so the outside-click listener is detached and re-attached on every re-render instead of stacking. `#profile-logout` carries the same clear-token-and-navigate-to-login logic the old `#sidebar-logout` had.

### `style.css`

- `.avatar` replaced with `.profile-menu`/`.profile-btn`/`.profile-avatar`/`.profile-dropdown`/`.profile-dropdown-user`/`.profile-dropdown-item`, styled to match the existing `.card-menu-dropdown` popup look (card background, border, shadow, hover tint).
- `.sidebar-logout`/`:hover` removed (unused).

### Verification

Served locally (`python -m http.server`) and drove it with headless Playwright/Chromium via a `local:` test token: screenshot-confirmed the round default-profile icon renders top right; clicking it opens a dropdown with the account email and "Log out" (fixed a `word-break: break-all` bug that wrapped the email mid-word); confirmed via DOM query that `#sidebar-logout` no longer exists and `#profile-logout` does; screenshot-confirmed the opened hamburger sidebar now shows only nav links; clicking "Log out" cleared the stored token and navigated to the login screen. Zero console errors.

## Final step (per project convention)

No `docs/tasks.md` change — shell/layout tweak to already-shipped chrome, not a new task-list item. This entry appended to `docs/activity.md`. Plan appended to `docs/plan.md`.

## Follow-up: profile dropdown shows just the email's local part, not the full address

**Request:** "Instead of user can it say the users email without the @ and domain."

### `app.js`

- New `currentUserName()` helper: `currentUser().split('@')[0]`. `.profile-dropdown-user` now renders `currentUserName()` instead of `currentUser()`. The `.profile-btn`'s `title` tooltip still uses the full `currentUser()` email, so the full address is still available on hover.

### Verification

Served locally, drove with headless Playwright via a `local:` test token (`test@example.com`): dropdown text confirmed as `"test"`, `title` attribute confirmed as the full `"test@example.com"` (screenshot). Zero console errors.

## Final step (per project convention)

No `docs/tasks.md` change. This entry appended to `docs/activity.md`. No `docs/plan.md` entry — one-line display tweak to the just-shipped profile popup, no new design decisions.
