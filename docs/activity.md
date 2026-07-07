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
- Screenshot-verified (not just a DOM dump, per the standing Phase 7 lesson) via Playwright driving the system's installed Chrome (`chromium-cli` and Node weren't available in this environment, so used the Python `playwright` package pointed at `chrome.exe` directly, no browser download needed) against a local `python -m http.server`: logged in with the `test`/`test` local account, navigated to the seeded experiment's "0 Hr Starved" condition, selected Cell 1 (needs count, no hand counts) → panel shows "Auto count 3" above "No counts yet."; selected Cell 3 (2 hand counts) → panel shows "Auto count 5" above the hand-count list (3, 2), with "Average hand count 2.5" still correct above it. No console errors. Confirms no layout overlap/collision between the new row and the existing Average/Hand counts rows
