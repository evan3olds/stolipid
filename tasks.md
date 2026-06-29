# tasks.md
## Cell Archive — Build Plan

Organized by phase (MVP-first). Each item is one screen, component, or system area.

---

## Phase 1 — Foundation

- [ ] Set up Supabase project: create `experiments`, `conditions`, `cells`, `counts` tables with correct schema and foreign keys
- [ ] Configure Supabase Auth (email/password)
- [ ] Write Row-Level Security (RLS) policies so researchers only read/write their own data
- [ ] Create Supabase Storage buckets: `cell-images` (required) and `raw-tifs` (optional)
- [ ] Scaffold project file structure: `index.html`, `style.css`, `app.js`, load Supabase JS client via CDN
- [ ] Implement theming tokens (Paper theme: background, accent, IBM Plex Sans/Mono, Newsreader)

---

## Phase 2 — Auth

- [ ] Build Login screen (username/password fields, "Log in" button, "Biology Dept · Cell Archive" monospace header)
- [ ] Wire login to Supabase Auth; store JWT in `localStorage`; route to Experiments screen on success

---

## Phase 3 — Core Navigation

- [ ] Build top bar (app title, prototype badge, hamburger menu button, user avatar)
- [ ] Build sidebar drawer (Experiments, Graph, Raw Data, About, Help links; slide-in animation)
- [ ] Build subheader with breadcrumb and context-sensitive primary action button
- [ ] Add back-button logic for Conditions and Cells screens

---

## Phase 4 — Experiments Screen

- [ ] Experiments grid: folder cards showing name, dye, condition count, date
- [ ] Single-click to select → show detail panel (name, date, dye, condition count, notes)
- [ ] Double-click or "Open experiment" button → navigate into experiment
- [ ] "Add experiment" button + modal form (Name, Date, Dye, Notes) → write to `experiments` table

---

## Phase 5 — Conditions Screen

- [ ] Conditions grid: folder cards with name and metadata, scoped to current experiment
- [ ] Single-click to select → detail panel showing condition name, dye, starvation length, cell count, ICC + quality label
- [ ] Mini scatter chart in detail panel (one column per condition, per-cell average dots, condition mean bar)
- [ ] "New slide" button + Add Condition modal (Name, Dye, Starvation length in hours, Notes) → write to `conditions` table

---

## Phase 6 — Cells Screen

- [ ] Cells grid: cards with name and count-status tag ("2 counts", "needs count"), scoped to current condition
- [ ] Simulated fluorescence image thumbnail on each card (green droplets on dark background placeholder)
- [ ] Select cell → right panel showing average hand count, list of individual counts with per-count delete (×)
- [ ] "Count" CTA button visible when cell has fewer than 3 counts
- [ ] "Add photos" button → navigate to Add Photos screen

---

## Phase 7 — Add Photos Screen

- [ ] Full-screen layout with left thumbnail sidebar (lists .tif files in batch with per-file box count)
- [ ] Main canvas: click to place a bounding box centered at click point
- [ ] Boxes are draggable (move by body) and resizable (corner handle)
- [ ] Each box has a numbered label and × remove button
- [ ] Top bar: condition name, instruction text, "Cancel" and "Create N cells" buttons
- [ ] Confirm → write one `cells` record per box to Supabase

---

## Phase 8 — Count Screen

- [ ] Dark-mode full-screen layout displaying the processed fluorescence image
- [ ] Crosshair cursor; click to place a numbered marker on a lipid droplet
- [ ] Click an existing marker to remove it
- [ ] Running total in top bar ("Total: N")
- [ ] "Done" → write count to `counts` table; "Cancel" → discard and return

---

## Phase 9 — Graph Screen

- [ ] Left sidebar: experiment + condition selector; "Add to graph" and "Add all conditions" buttons
- [ ] Selected conditions list with × remove per entry
- [ ] Scatter plot: one column per condition, per-cell average dots (color-coded by series), condition mean bar
- [ ] Hover tooltip (experiment, condition, cell name, hand counts, average)
- [ ] Legend with condition names and experiment labels below columns
- [ ] "No data" empty state

---

## Phase 10 — Raw Data Screen

- [ ] Full table of all cells: columns Experiment, Condition, Cell, Count 1, Count 2, Count 3, Average
- [ ] Average column rendered in accent color

---

## Phase 11 — Python API (Render)

- [ ] Set up Python web API project (e.g., FastAPI) and deploy to Render
- [ ] Endpoint: accept `.tif` upload, load with `tifffile` or `Pillow`, normalize contrast, apply green false-color LUT (BODIPY channel), export as PNG
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
