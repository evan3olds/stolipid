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

- [x] Build Login screen (username/password fields, "Log in" button, "Biology Dept · Cell Archive" monospace header)
- [x] Wire login to Render `/auth/login`; store JWT in `localStorage`; route to Experiments screen on success

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
- [x] Crosshair cursor; click to place a numbered marker on a lipid droplet
- [x] Click an existing marker to remove it
- [x] Running total in top bar ("Total: N")
- [x] "Done" → write count to `counts` table; "Cancel" → discard and return

---

## Phase 9 — Graph Screen

- [x] Left sidebar: experiment + condition selector (condition select includes an "All conditions" option in place of a separate button); "Add to graph" button
- [x] Selected conditions list with × remove per entry
- [x] Scatter plot: one column per condition, per-cell average dots (color-coded by series), condition mean bar
- [x] Hover tooltip (experiment, condition, cell name, hand counts, average)
- [x] Legend with condition names and experiment labels below columns
- [x] "No data" empty state

---

## Phase 10 — Raw Data Screen

- [ ] Full table of all cells: columns Experiment, Condition, Cell, Count 1, Count 2, Count 3, Average
- [ ] Average column rendered in accent color

---

## Phase 11 — Python API (Render)

- [ ] Set up Python web API project (e.g., FastAPI) and deploy to Render
- [ ] Endpoint: `POST /auth/login` — accept `{ username, password }`, validate against Supabase Auth, return `{ token }`
- [ ] Endpoint: accept `.tif` upload, load with `tifffile` or `Pillow`, normalize contrast, apply green false-color LUT (BODIPY channel), export as PNG
- [ ] Endpoint: `POST /conditions/{id}/tif-preview` — accept a raw `.tif` upload (multipart), render the contrast-normalized/LUT PNG, return `{ preview_url }` for the Add Photos canvas (no DB writes — this is a preview only)
- [ ] Endpoint: `POST /conditions/{id}/cells/from-tif` — accept the original `.tif` file plus a `boxes` JSON array (`{x, y, width, height}` as 0–100 percentages of the source image), crop one region per box, upload each crop to Supabase Storage (`cell-images` bucket), and create one `cells` row per box with `image_url` set
- [ ] Endpoint: `POST /cells/{id}/counts` — accept `{ value }`, create a `counts` row (`cell_id`, `value`, `counted_by` from auth context, `created_at` default), return the created count object
- [ ] Upload rendered PNG to Supabase Storage (`cell-images` bucket) and write `image_url` to `cells` table
- [ ] Endpoint: compute ICC per condition with `pingouin`; write result back to `conditions.icc` column
- [ ] Wire frontend to POST to Render API endpoints (configure base URL as a constant)

---

## Phase 12 — Static Content Screens

- [ ] Help screen: list of help cards (title + body); content editable in app config
- [ ] About screen: project purpose, origin, status, citation/protocol links

---

## Phase 13 — Configurable Props

- [ ] `theme` prop: toggle between Paper and Sage themes
- [ ] `appTitle` prop: override title in header and login
- [ ] `prototypeBadge` prop: show/hide "Prototype" badge in top bar

---

## Future (Out of Scope for v1)

- [ ] CSV export of Raw Data table
- [ ] Automated droplet detection via `cellpose` or `skimage`
- [ ] Named inter-rater workflow (assign counts to specific researchers)
- [ ] Per-cell ICC breakdowns and outlier flagging
- [ ] Supabase Edge Function to trigger Python pipeline on `.tif` upload
- [ ] Admin panel for user and experiment management
- [ ] Mobile / responsive layout
- [ ] Password reset UI
