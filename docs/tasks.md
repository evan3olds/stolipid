# tasks.md
## Cell Archive — Build Plan

Organized by phase (MVP-first). Each item is one screen, component, or system area.

---

## Phase 1 — Foundation

> Supabase setup (tables, auth, RLS, storage) is handled in the Render/Python repo — Render is the sole service that talks to Supabase directly.

- [x] Scaffold project file structure: `index.html`, `style.css`, `app.js` with Render API client (`api()` fetch helper)
- [x] Implement theming tokens (Paper theme: background, accent, IBM Plex Sans/Mono, Newsreader)

---

## Phase 2 — Auth

- [x] Build Login screen (email/password fields, "Log in" button, "Biology Dept · Cell Archive" monospace header)
- [x] Wire login to Render `/auth/login`; store JWT in `localStorage`; route to Experiments screen on success
- [x] "Create account" and "Forgot password?" links on the Login screen, each swapping in their own form; wired to new Render `POST /auth/signup` and `POST /auth/reset-password` endpoints
- [x] Handle Supabase's auth-link redirect (`#access_token=...&type=...` in the URL hash) on boot: `type=recovery` shows a "Set a new password" screen wired to new `POST /auth/update-password`; any other `access_token` (e.g. signup confirmation) logs the user straight in
- [x] Login shows "Loading..." immediately on submit; if the real `/auth/login` request is still pending 3s later, the message is upgraded to add "Please wait 1-2 minutes while the site boots up." (Render free-tier cold-start notice), cleared on error

---

## Phase 3 — Core Navigation

- [x] Build top bar (app title, prototype badge, hamburger menu button, user avatar)
- [x] Build sidebar drawer (Experiments, Graph, Raw Data, About, Help links; slide-in animation)
- [x] Build subheader with breadcrumb and context-sensitive primary action button
- [x] Add back-button logic for Conditions and Cells screens

---

## Phase 4 — Experiments Screen

- [x] Experiments grid: folder cards showing name, dye, condition count, date
- [x] Single-click to select → show detail panel (name, date, dye, condition count, notes)
- [x] Double-click or "Open experiment" button → navigate into experiment
- [x] "Add experiment" button + modal form (Name, Date, Dye, Notes) → write to `experiments` table

---

## Phase 5 — Conditions Screen

- [x] Conditions grid: folder cards with name and metadata, scoped to current experiment
- [x] Single-click to select → detail panel showing condition name, dye, starvation length, cell count, ICC + quality label
- [x] Mini scatter chart in detail panel (one column per condition, per-cell average dots, condition mean bar)
- [x] "New slide" button + Add Condition modal (Name, Dye, Starvation length in hours, Notes) → write to `conditions` table
- [x] `dye` removed as a condition-level field — it's universal across all conditions in an experiment. Add/Edit Condition modals dropped the Dye input; `conditions.dye` is no longer read or written by the frontend or `api/main.py`'s `ConditionBody`/`create_condition`/`update_condition`. The Conditions detail panel still shows a "Dye" row for at-a-glance analysis, now sourced from `state.experiment.dye` (passed through on navigation from the Experiments screen) instead of the condition record. Folder-card dye chip removed from the Conditions grid since it's redundant across every card in an experiment. Requested by the user; existing `conditions.dye` Supabase column is left in place but unused (no migration run in this environment, consistent with prior schema-change entries)

---

## Phase 6 — Cells Screen

- [x] Cells grid: cards with name and count-status tag ("2 counts", "needs count"), scoped to current condition
- [x] Simulated fluorescence image thumbnail on each card (green droplets on dark background placeholder)
- [x] Select cell → right panel showing average hand count, list of individual counts with per-count delete (×)
- [x] "Count" CTA button visible when cell has fewer than 3 counts
- [x] "Add photos" button → navigate to Add Photos screen

---

## Phase 7 — Add Photos Screen

- [x] Full-screen layout with left thumbnail sidebar (lists .tif files in batch with per-file box count)
- [x] Main canvas: click to place a bounding box centered at click point
- [x] Boxes are draggable (move by body) and resizable (corner handle)
- [x] Each box has a numbered label and × remove button
- [x] Top bar: condition name, instruction text, "Cancel" and "Create N cells" buttons
- [x] Confirm → write one `cells` record per box to Supabase

---

## Phase 8 — Count Screen

- [x] Dark-mode full-screen layout displaying the processed fluorescence image
- [x] Crosshair cursor; click to place a small red dot marker on a lipid droplet
- [x] Click an existing marker to remove it
- [x] Running total in top bar ("Total: N")
- [x] Zoom in/out controls (100%–300%) to separate small, closely-clustered droplets; canvas pans via scroll
- [x] "Done" → write count to `counts` table; "Cancel" → discard and return
- [x] Follow-up: zoom controls moved from a fixed bottom-right overlay to a static bar directly under the top panel, and `.count-screen` fixed to `height: 100dvh; overflow: hidden` (with `.count-canvas` given `min-height: 0`) so the top panel and zoom bar can never scroll off-screen — only the image canvas scrolls
- [x] Follow-up: a very vertical (portrait) cell image had its top cut off and permanently unreachable at 100% zoom. The earlier zoomed-in scroll-trap fix (`.count-canvas.is-zoomed`, flex-start alignment) only toggled when `zoom > 100%`, but a tall image can overflow the canvas vertically at 100% zoom too (frame width is capped, but height is set by the image's own aspect ratio). Replaced the zoom-conditional `.is-zoomed` class entirely with unconditional CSS `align-items: safe center; justify-content: safe center` on `.count-canvas` — centers when the frame fits, falls back to start-alignment whenever it doesn't, regardless of zoom level

---

## Phase 9 — Graph Screen

- [x] Left sidebar: experiment + condition selector (condition select includes an "All conditions" option in place of a separate button); "Add to graph" button
- [x] Selected conditions list with × remove per entry
- [x] Scatter plot: one column per condition, per-cell dots (color-coded by series) plotted from `cells.auto_count` (not hand-count average — that's what the Conditions screen's mini overview chart uses), condition mean bar averaged from `auto_count`
- [x] Hover tooltip (experiment, condition, cell name, hand counts, auto count)
- [x] Legend with condition names and experiment labels below columns
- [x] "No data" empty state
- [x] Follow-up: sidebar "Metric" selector lets the user switch the plotted per-cell value and condition-mean bar between `cells.auto_count` (default, unchanged), the average of hand counts (`cellAverage`, same calc the Conditions screen mini chart uses), or the average of the two (`cellValueForMetric`/`conditionMeanForMetric` in `app.js`, falling back to whichever of the pair is present when a cell only has one). Y-axis label and tooltip update to reflect the active metric; the tooltip's existing "Hand counts"/"Auto count" rows are unchanged and a metric-value row is appended only when the metric isn't plain auto count (avoids a duplicate "Auto count" line). Verified with a headless-browser pass through all three metric options plus tooltip hover — screenshots confirm per-cell values and condition means shift correctly (e.g. cells with no hand counts fall back to auto-only under "Average of both"), no console errors
- [x] Follow-up: metric control changed from a `<select>` dropdown to three checkboxes (`.graph-metric-input`), per the user's request, kept single-choice by JS (checking one unchecks the rest; unchecking the active one snaps it back on rather than leaving zero selected). Default changed from "Auto count" to "Average of both" (`graphState.metric` initializes to `'combined'`). Verified with a headless-browser pass: default state has only "Average of both" checked and the correct axis label; clicking another checkbox switches the checked state and axis label correctly; clicking the currently-active checkbox to uncheck it snaps back to checked; no console errors

---

## Phase 10 — Raw Data Screen

- [x] Full table of all cells: columns Experiment, Condition, Cell, Count 1, Count 2, Count 3, Average, Auto count, Source file
- [x] Average column rendered in accent color
- [x] Sortable columns (click header to toggle ascending/descending; missing values always sort last)
- [x] Filter input (live substring match across Experiment/Condition/Cell name)

---

## Phase 11 — Python API (Render)

- [x] Set up Python web API project (e.g., FastAPI) and deploy to Render
- [x] Endpoint: `POST /auth/login` — accept `{ email, password }`, validate against Supabase Auth, return `{ token }`
- [x] Endpoint: `POST /auth/signup` — accept `{ email, password }`, create a Supabase Auth user, return `{ token }` (email confirmation disabled) or `{ message }` (confirmation required)
- [x] Endpoint: `POST /auth/reset-password` — accept `{ email }`, trigger Supabase's password-reset email, return a generic confirmation message regardless of whether the email is registered
- [x] Endpoint: `POST /auth/update-password` — accept `{ password }` with the recovery link's `access_token` as the bearer token, validate it via `get_current_user`, then set the new password with the service-role admin client (`auth.admin.update_user_by_id`)
- [x] Endpoint: `GET /experiments` — list experiments owned by the authenticated researcher, with `condition_count`
- [x] Endpoint: `POST /experiments` — create an experiment (`name`, `date`, `dye`, `notes`), scoped to `created_by`
- [x] Endpoint: `GET /experiments/{id}/conditions` — list conditions for an owned experiment, with nested `cells`/`counts`
- [x] Endpoint: `POST /experiments/{id}/conditions` — create a condition on an owned experiment
- [x] Endpoint: `GET /conditions/{id}/cells` — list cells for an owned condition, with nested `counts`
- [x] Endpoint: `POST /cells/{id}/counts` — accept `{ value }`, create a `counts` row (`cell_id`, `value`, `counted_by` from auth context, `created_at` default), return the created count object
- [x] Endpoint: `DELETE /counts/{id}` — delete a hand count, scoped to the owning cell's experiment
- [x] Endpoint: accept `.tif` upload, load with `tifffile` or `Pillow`, normalize contrast, apply green false-color LUT (BODIPY channel), export as PNG (`api/imaging.py`)
- [x] Endpoint: `POST /conditions/{id}/tif-preview` — accept a raw `.tif` upload (multipart), render the contrast-normalized/LUT PNG, return `{ preview_url }` for the Add Photos canvas (no DB writes — this is a preview only)
- [x] Endpoint: `POST /conditions/{id}/cells/from-tif` — accept the original `.tif` file plus a `boxes` JSON array (`{x, y, width, height}` as 0–100 percentages of the source image), crop one region per box, upload each crop to Supabase Storage (`cell-images` bucket), and create one `cells` row per box with `image_url` set
- [x] Upload rendered PNG to Supabase Storage (`cell-images` bucket) and write `image_url` to `cells` table
- [x] Endpoint: compute ICC per condition with `pingouin`; write result back to `conditions.icc` column (auto-recomputed on every hand-count create/delete; also exposed as `POST /conditions/{id}/recompute-icc`)
- [x] Wire frontend to POST to Render API endpoints (configure base URL as a constant)

---

## Phase 11c — Automated Droplet Count Suggestion

- [x] Split the `.tif` render pipeline so the pre-quantization intensity plane is available for analysis, separate from the lossy 8-bit display PNG (`api/imaging.py`: `load_tif_plane`, `render_display_image`, `crop_array_percent`)
- [x] `api/detection.py`: Gaussian blur → Otsu threshold → distance-transform watershed → `count_droplets(plane)`, splitting touching/overlapping droplets so each still gets its own count
- [x] Wire into `POST /conditions/{id}/cells/from-tif`: compute a count automatically per box at cell-creation time, write to `cells.auto_count` (not a hand count — excluded from `cell.average`/`condition.icc`)
- [x] Frontend: surface `cells.auto_count` on the Cells screen detail panel, shown above the "Hand counts" list
- [x] `cells_from_tif`'s per-box crop switched from the 8-bit percentile-stretched display crop to a lossless 16-bit min/max-normalized crop (`normalize_to_uint16` + `encode_png_16` in `api/imaging.py`): this is now the single image stored as `cells.image_url` (used for both hand counting and viewing) and the base `count_droplets` runs on — no separate raw-plane analysis crop needed since the normalization is a non-clipping monotonic transform. `tif-preview`'s whole-frame render is unchanged (still 8-bit percentile-clip, box-drawing only)
- [x] `api/detection.py`: added `preprocess_for_detection` (rolling-ball background subtraction + CLAHE), run before the Gaussian blur → Otsu → watershed chain. Prototype defaults (`BACKGROUND_BALL_RADIUS_PX`, `CLAHE_CLIP_LIMIT`) not yet calibrated against real hand-count data; known narrow trade-off at the tightest touching-droplet separations, accepted for now (see `docs/activity.md`)
- [x] `preprocess_for_detection`'s output (not just the plain linear-normalized crop) is now what's stored as `cells.image_url` — the linear-min/max-stretched crop alone was still too dim for hand counting since it stretches the range, not the skewed distribution. `count_droplets` takes the already-processed array directly (no longer re-runs preprocessing itself), so one enhancement pass now feeds both the stored image and the auto-count
- [x] `CLAHE_CLIP_LIMIT` tuned down from skimage's default `0.01` to `0.005` — the default visibly widened each droplet's footprint (measured FWHM 5px → 9px), reported by the user as "very blurry." `0.005` keeps most of the brightness gain while pulling FWHM back to 7px; see `docs/activity.md` for the full trade-off sweep
- [x] `count_droplets` reworked from Gaussian blur → Otsu → distance-transform watershed to an ALDQ-style pipeline: iterative difference-of-Gaussians band-pass sharpening (unsharp-mask add-back, `SHARPEN_ITERATIONS` passes) → local-maxima seeding (`peak_local_max` directly on the sharpened image) → Sobel-gradient watershed (edges as the elevation map instead of `-distance`). Requested by the user to match the ALDQ counting model; prototype defaults (`DOG_LOW_SIGMA_PX`, `DOG_HIGH_SIGMA_PX`, `SHARPEN_ITERATIONS`, `SHARPEN_STRENGTH`, `PEAK_THRESHOLD_REL`) not yet calibrated against real hand-count data — synthetic-blob smoke test confirms it separates droplets down to ~8px center spacing (droplet radius ~3px) without regressing the old algorithm's behavior on well-separated and near-coincident cases (see `docs/activity.md`)
- [x] `api/detection.py` reworked again to an ImageJ-style binary pipeline, replacing the DoG/CLAHE approach entirely: `subtract_background` (rolling-ball, radius dropped `25px` → `12px`) → `threshold_binary` (Otsu, dark background) → `binary_fill_holes` → distance-transform watershed (`-distance` elevation map, matching ImageJ's Process > Binary > Watershed) → `count_droplets`. Requested by the user as an explicit 5-step spec. `preprocess_for_hand_count` (renamed from `preprocess_for_detection`) now stops after step 2 (background subtraction + threshold) per the user's instruction that the stored hand-count image should be taken before fill-holes/watershed — so `cells.image_url` is now a binary (0/65535) black-and-white image, not grayscale. `count_droplets` runs its own full 5-step pipeline from the same normalized crop rather than reusing `preprocess_for_hand_count`'s output, since the two now diverge after step 2. CLAHE and DoG sharpening (`CLAHE_CLIP_LIMIT`, `DOG_*`, `SHARPEN_*`, `PEAK_THRESHOLD_REL`) removed as dead code
- [x] `threshold_binary` gained `THRESHOLD_FACTOR = 1.3` (multiplies Otsu's threshold before the `flattened > thresh` cutoff), requested by the user because clumped droplets weren't becoming distinct. Synthetic testing found this shrinks the foreground mask but does **not** by itself split droplets that are genuinely touching/overlapping — that's gated by `MIN_PEAK_DISTANCE_PX=3` in `count_droplets`'s watershed-marker step, which collapses distance-transform peaks closer than 3px into one seed regardless of threshold. Flagged to the user; they chose to ship the threshold change alone for now and hold off on touching `MIN_PEAK_DISTANCE_PX` (see `docs/activity.md`)
- [x] `cells.source_filename` added: `cells_from_tif` now writes the original uploaded `.tif` filename (`file.filename`, from the multipart upload) onto every cell created from it. Schema docs (`CLAUDE.md`, `docs/PRD.md`) updated to list the new column. **Not yet applied to the live Supabase `cells` table** — this environment has no real Supabase credentials (`api/.env.example` only has placeholders), so the column add (`ALTER TABLE cells ADD COLUMN source_filename text;`) must be run by the user directly against Supabase before this deploys, or every insert will fail
- [x] Frontend: `wireCells`'s `renderDetail` (`app.js`) surfaces `cell.source_filename` on the Cells screen detail sidebar as a "Source file" row, shown above "Average hand count"; hidden entirely when absent (e.g. hand-entered cells with no `.tif` origin). Added `source_filename` to two of the local dev-mode (`local:` token) test cells so the row is visible without a live backend. Verified with a headless-browser run through Experiments → Conditions → Cells → cell detail: row renders correctly for cells with a source file and is correctly omitted for one without, no console errors
- [x] `api/detection.py` reworked so watershed runs before the hand-count image is generated too, not just for `auto_count`. Replaced the separate `preprocess_for_hand_count`/`count_droplets` pipelines (which each independently re-ran background subtraction → threshold → fill-holes → watershed) with a single `segment_droplets(plane)` that runs the full chain once and returns a labeled array, plus `render_hand_count_image(labels)` (binary uint16 render) and `count_droplets(labels)` (regionprops count) that both consume its output. `segment_droplets` now calls `watershed(..., watershed_line=True)`, which burns a 1px background gap between touching regions — so `cells.image_url` now visually shows separated droplets instead of one merged blob for clumped cases. `cells_from_tif` (`api/main.py`) updated to call `segment_droplets` once per box and derive both outputs from it — also fixes a pre-existing inefficiency where `rolling_ball` (the most expensive step, ~1.3s/crop) ran twice per box. Verified on synthetic touching-pair and non-separating-clump cases that the rendered hand-count PNG has the same watershed split lines as `auto_count`'s region boundaries
- [x] `api/detection.py` un-shared the watershed computation between the two consumers (undoing the prior entry's `segment_droplets` sharing), per the user's explicit request that watershed for the hand-count image stay separate from the auto-count pipeline. `render_hand_count_image(plane)` now runs its own full pipeline (subtract_background → threshold_binary → fill_holes → watershed with `watershed_line=True`) independently; `count_droplets(plane)` runs its own separate full pipeline (same first two steps, its own fill_holes → watershed with `watershed_line=False`, since nothing there gets rendered). Both take a raw `plane` again (not a shared `labels` array) and each internally recomputes `subtract_background`/`threshold_binary` rather than reusing the other's result. The fill-holes/watershed mechanics themselves are still factored into a private `_fill_and_watershed(mask, watershed_line)` helper shared by both — the two pipelines never share a single watershed *computation* (each passes its own mask instance and gets its own labels back), but the mechanics aren't duplicated line-for-line either. Reintroduces the double `rolling_ball` cost per box that the prior entry had just eliminated — accepted as the tradeoff for keeping the two pipelines genuinely independent and separately tunable
- [x] Hand counts and auto-count now save marker positions, not just a total. `counts.points` and `cells.auto_points` (new `jsonb` columns — not yet applied to the live Supabase tables, same situation as `source_filename` above: run `alter table counts add column points jsonb; alter table cells add column auto_points jsonb;` directly against Supabase before this deploys). `_fill_and_watershed` now returns `(labels, coords)`; `count_droplets` renamed `detect_droplets`, returns `(count, points)` with `points` filtered to the seeds whose region survives `MIN_DROPLET_AREA_PX` (`len(points) == count` always). `cells_from_tif` converts those pixel coordinates to percent-of-crop and writes `auto_points` alongside `auto_count`. New `PUT /counts/{count_id}` endpoint updates value+points in place. Frontend (`app.js`): `finishCount()` sends `points` on every save; a saved count with stored points renders as a clickable `count-edit-btn` on the Cells screen detail panel, reopening the Count screen with its markers preloaded (`state.editingCount`) so Done calls `PUT` instead of `POST`. Counts without stored points (pre-existing fixture/legacy data) stay non-interactive — edit only applies where points exist. See `docs/plan.md` for the full plan and verification.
- [x] Follow-up: **all** hand counts are now editable, not just ones with stored points (`editingCount.points` falls back to `[]`, so legacy counts open the Count screen empty rather than blocking edit). Auto count is now viewable: `cell.auto_count` is a clickable button that opens the Count screen in a new read-only mode (`state.viewingAutoPoints`, `countState.readOnly`) showing `cells.auto_points` as non-interactive blue markers (vs. hand-count's red, editable ones) — no Done button, "Close" instead of "Cancel", canvas clicks don't add points. See `docs/plan.md` for the full plan and verification.
- [x] Follow-up: Edit/View moved off the count value itself onto separate buttons. Hand count list items now show a plain-text value plus a dedicated "Edit" button (and the existing "×" delete); the Auto count row shows a plain-text value plus a dedicated "View" button. Both restyled as always-visible small underlined accent buttons (`.count-edit-btn`, `.detail-value-btn`), matching the existing `.login-link` pattern, instead of being disguised as the number itself. See `docs/plan.md` for the full plan and verification.
- [x] Follow-up: Auto count row restyled to match the hand-count rows exactly — moved into the same `<ul class="count-list"><li class="count-list-item">` structure so it gets the same chip background/padding, value on the left, "View" button (now reusing `.count-edit-btn`) on the right. `.detail-value-row`/`.detail-value-btn` removed as unused. See `docs/plan.md` for the full plan and verification.
- [x] Follow-up: `render_hand_count_image` reverted from the binary (0/65535) black-and-white watershed-mask render back to a real grayscale image — `subtract_background` (rolling-ball) → `equalize_adapthist` (CLAHE), same shape as the pre-"ImageJ-style" pipeline (see the `preprocess_for_detection`/`preprocess_for_hand_count` entries above), so `cells.image_url` is continuous-tone again instead of stark black/white. `CLAHE_CLIP_LIMIT` set to `0.003` (down from the `0.005` it was last tuned to) to trim smearing/blur further, per the user's request. `threshold_binary`/fill-holes/watershed stay exclusive to `detect_droplets` (the auto-count path), which is unchanged; `_fill_and_watershed` dropped its now-unused `watershed_line` parameter since only `detect_droplets` calls it. See `docs/plan.md` for the full plan and verification.

---

## Phase 6d — Card Edit/Remove (Experiments, Conditions, Cells)

- [x] Three-dot menu (top-right of every folder card on Experiments, Conditions, and Cells) with Edit and Remove actions
- [x] Edit opens a modal pre-filled with the item's metadata (Experiment: name/date/dye/notes; Condition: name/dye/starvation/notes; Cell: name only) and saves via a new `PUT` endpoint
- [x] Remove opens a confirmation modal ("Delete X and all of its …? This cannot be undone.") before calling a new `DELETE` endpoint
- [x] Render: `PUT`/`DELETE /experiments/{id}`, `PUT`/`DELETE /conditions/{id}`, `PUT`/`DELETE /cells/{id}` — deletes manually cascade (counts → cells → conditions) since no DB-level `ON DELETE CASCADE` is confirmed; cell deletion also recomputes the owning condition's ICC

---

## Phase 12 — Static Content Screens

- [x] Help screen: list of help cards (title + body); content editable in app config
- [x] About screen: project purpose, origin, status, citation/protocol links

---

## Phase 13 — Configurable Props

- [x] `theme` prop: toggle between Paper and Sage themes. Sage is a real dark theme, not just a different accent hue — `style.css` reworked so every color is a `--token`/`--token-paper` pair (the `-paper` half is the literal, never overridden; the active token defaults to it). `:root[data-theme="sage"]` re-derives every active token from its own `-paper` value via CSS relative-color syntax (`oklch(from var(--x-paper) calc(1 - l) c 132)`): neutral/border/text/accent tokens invert lightness and re-hue to sage green (132); semantic status tokens (`--danger`, `--warn-text`, `--success-*`) invert lightness only, keeping their original hue, so danger/warn/success stay conceptually red/amber/green in both themes. Surface tokens that read as "elevated" in Paper (cards, panels, dropdowns, chips, table stripes/headers) get an extra `+0.06` lightness bump in the dark override — a plain `1 - l` invert made them *darker* than the page instead of lighter, collapsing the elevation cue. Count screen (`style.css` "Count screen" block) and a few "simulated dark microscopy image" placeholders (`cell-thumb-bg`, `addphotos-file-thumb`, `canvas-frame`, `cell-thumb-droplet`) are intentionally excluded from tokenization — they're fixed-dark/fixed-color regardless of shell theme (PRD 5.6; simulated fluorescence thumbnails). `CONFIG.theme` (`app.js`) is the shipped default (`paper`); `applyTheme()` sets `document.documentElement.dataset.theme` and persists to `localStorage`, read back on `boot()` before first paint. User-facing toggle switch added to the top bar (`#theme-toggle` in `topbarHTML()`/`wireShell()`), per user request — `appTitle`/`prototypeBadge` stayed code-level constants (no UI) but theme got one. `.graph-select` gained `appearance: none` since native `<select>` chrome doesn't reliably honor a custom dark background across browsers. Verified via a headless-Chromium screenshot pass across Experiments/Conditions/Cells/Graph/Raw Data/Help/About/modals/card-menu/sidebar/Add Photos in both themes, plus reload-persistence and zero console errors. Follow-up after user feedback that Sage was too dark to make out folder cards: the surface/border token family's dark override switched from a `calc(1 - l + 0.06)` formula to explicit hand-tuned lightness targets (still hue/chroma-derived from each token's own paper value via `from`), forming a clear gray-scale ramp from page through card/chip/header/tint up through the border tiers — text/accent/semantic tokens were untouched since those already read correctly
- [x] `appTitle` prop: override title in header and login. Already wired into the top bar (`topbarHTML()`); this phase added it to the login and reset-password screens' eyebrow/title (previously hardcoded "Cell Archive") and to `document.title`, set once in `boot()`
- [x] Follow-up: `--warn-text`'s Sage dark-theme value (used only by the Cells screen "needs count" tag) hardcoded to near-black (`oklch(0.1 0 0)`) instead of the hue-preserving lightness invert — the inverted orange sat at nearly the same lightness as the tag's sage-green chip background and was illegible
- [x] `prototypeBadge` prop: show/hide "Prototype" badge in top bar — already fully implemented in Phase 1; confirmed still working after the theme refactor (uses `var(--accent)`, unaffected by tokenization)

---

## Future (Out of Scope for v1)

- [x] CSV export of Raw Data table
- [x] Automated droplet detection via `cellpose` or `skimage` — **partially done**: Phase 11c added a `skimage`-based count suggestion (`cells.auto_count`), computed automatically and shown on the Cells screen detail panel; a later Phase 11c follow-up added marker/location coordinates (`cells.auto_points`) — still open: `cellpose`
- [ ] Named inter-rater workflow (assign counts to specific researchers)
- [ ] Per-cell ICC breakdowns and outlier flagging
- [ ] Supabase Edge Function to trigger Python pipeline on `.tif` upload
- [ ] Admin panel for user and experiment management
- [ ] Mobile / responsive layout
