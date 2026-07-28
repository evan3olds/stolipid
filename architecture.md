# Cell Archive (Stolipid) — System Architecture

Cell Archive is a lipid droplet counting tool for fluorescence microscopy data. It has three deployable pieces — a static frontend, a Python API, and a managed Postgres/storage backend — with no build step anywhere in the chain.

```
┌─────────────────────┐        HTTPS/JSON         ┌──────────────────────┐        service-role client        ┌──────────────────────┐
│   GitHub Pages       │ ─────────────────────────▶│   Render (FastAPI)   │ ──────────────────────────────────▶│   Supabase            │
│   index.html/app.js  │◀───────────────────────── │   api/main.py         │◀────────────────────────────────── │   Postgres + Storage   │
│   style.css           │        JSON responses      │   api/imaging.py      │        rows / signed URLs           │   + Auth               │
└─────────────────────┘                             │   api/detection.py    │                                    └──────────────────────┘
                                                     └──────────────────────┘
```

The browser never talks to Supabase directly. It only ever calls the Render API; Render holds the Supabase service-role key and does all reads/writes/storage uploads server-side.

---

## 1. Frontend — GitHub Pages (static)

- **Files:** [index.html](index.html) (shell — just mounts `#app` and loads `app.js`), [app.js](app.js) (~3.5k lines, all logic), [style.css](style.css) (all styling).
- **No framework, no bundler, no npm.** Vanilla JS renders HTML strings into `#app` based on a single `state` object (`state.screen`, `state.project`, `state.experiment`, `state.condition`, `state.cell`, plus a few UI-only fields like `editingCount`/`viewingAutoPoints`).
- **Screen switching** is in-memory (`SCREENS` map + `renderShell`/`render*` functions in app.js) — no URL routing in v1.
- **Auth token** (Supabase Auth JWT) is stored in `localStorage` and attached as `Authorization: Bearer <token>` on every call to Render via the shared `api()` helper (app.js:3-14).
- **API base URL** is hardcoded: `RENDER_API_URL = 'https://stolipid.onrender.com'` (app.js:1).
- **Fonts/CDN:** IBM Plex Sans/Mono + Newsreader via Google Fonts `<link>`; Supabase JS client is *not* loaded client-side (all Supabase access is server-side via Render).
- **Theming:** two CSS-token themes, Paper (default) and Sage, toggled in the top bar and persisted to `localStorage` (`CONFIG.theme`, `applyTheme()`).

### Screens (per `SCREENS` / render functions in app.js)
```
Login/Signup/Reset ─▶ Home (Projects) ─▶ Experiments ─▶ Conditions ─▶ Cells ─▶ Count
                                                                         │
                                                          Add Photos ◀──┘
Graph · Raw Data · About · Help  (static/analysis screens off the shell nav)
```
- **Home** — lists the user's projects (joined via invite code or created), each showing an experiment count.
- **Experiments → Conditions → Cells → Count** mirror the DB hierarchy below.
- **Add Photos** — upload a `.tif`, draw percent-of-image boxes, POST to Render to create one `cells` row per box.
- **Count** — place/remove markers on a cell's image for a blind hand count (up to 3 per cell); can reopen a saved hand count for edit.
- **Graph** — scatter of auto-count per cell, grouped by condition, with condition-mean bars.
- **Raw Data** — flat, sortable/filterable export table of every cell's counts.
- **About / Help** — static content blocks (`ABOUT_CONTENT` / `HELP_CONTENT` in app.js).

---

## 2. Python API — Render (`api/`)

FastAPI app in [api/main.py](api/main.py), deployed on Render. Cold starts after inactivity (30–60s first request) — the frontend should show a loading state rather than assume a fast response.

- `api/main.py` — routes, Supabase access, ownership/access-control, ICC recompute orchestration.
- `api/imaging.py` — `.tif` loading (`tifffile`), plane extraction, contrast normalization/rendering, PNG encoding, percent-based cropping.
- `api/detection.py` — the two auto-count algorithms (below).

Supabase client is created once at import time using `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env vars (service-role key — **bypasses Row-Level Security**, so `main.py` itself is the access-control layer).

### Endpoint groups
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/signup`, `/auth/reset-password`, `/auth/update-password` |
| Projects | `GET/POST /projects`, `POST /projects/join` |
| Experiments | `GET/POST /projects/{id}/experiments`, `PUT/DELETE /experiments/{id}` |
| Conditions | `GET/POST /experiments/{id}/conditions`, `PUT/DELETE /conditions/{id}`, `POST /conditions/{id}/recompute-icc` |
| Cells | `GET /conditions/{id}/cells`, `PUT/DELETE /cells/{id}`, `PUT /cells/{id}/auto-count`, `GET /cells/{id}/display-image` |
| .tif pipeline | `POST /conditions/{id}/tif-preview`, `POST /conditions/{id}/cells/from-tif` |
| Counts | `POST /cells/{id}/counts`, `PUT/DELETE /counts/{id}` |

### Access control (ownership helpers)
Since the service-role key bypasses RLS, every request re-derives ownership by walking up the hierarchy to project membership:
```
owned_cell → owned_condition → owned_experiment → owned_project
                                                       │
                                          checks project_members for user_id
```
Any 404 (not 403) on a missing row or non-membership — this is intentional, not an oversight, to avoid confirming a resource's existence to non-members. Any project member can read/write everything under that project (not just its creator); `experiments.created_by` is provenance only.

### `.tif` → cells pipeline
1. **Add Photos** uploads a raw `.tif` → `tif_preview` renders a display-only PNG (percentile-stretched, 8-bit) for the annotation canvas, no DB writes.
2. Researcher draws boxes (percent-of-image `{x, y, width, height}`).
3. **`cells_from_tif`** re-reads the `.tif` at full resolution, crops each box, normalizes to uint16 (linear stretch, *not* the display render), uploads one PNG per box to Supabase Storage bucket `cell-images`, and inserts one `cells` row per box (`Cell{fileNumber}_{n}` naming, `source_filename` preserved).
4. The stored crop is intentionally **unenhanced** — it's the calibrated input for both `detect_droplets` algorithms. The Count screen's enhanced view is rendered fresh per-request from that same crop via `GET /cells/{id}/display-image` (background-subtract + CLAHE), rather than storing a second image.

### Auto-count algorithms (`api/detection.py`)
Opt-in, per cell, triggered from the Cells screen (`PUT /cells/{id}/auto-count`). A cell can hold up to two machine-generated `counts` rows (one per algorithm) plus up to 3 hand counts; re-running an algorithm replaces only its own row (delete-then-insert on `(cell_id, type)`).

- **`otsu_watershed`** ("Standard") — rolling-ball background subtraction → dark-background Otsu threshold (×1.5 factor) → binary fill-holes → distance-transform watershed.
- **`fm_edge_overlay`** ("FM_edge_overlay (ALDQ)") — fixed-parameter port of the lab's `assets/ALDQ.ijm-*.txt` ImageJ macro: iterative highpass-sharpening → edge/threshold/watershed particle mask (filtered by size + circularity) intersected with Find-Maxima local peaks on a further-blurred copy. A maximum only counts if it lands on an accepted particle.

### ICC (inter-rater reliability)
`compute_icc` / `recompute_condition_icc` run automatically after any hand-count create/update/delete (not on a scheduled job, not manually triggered by the frontend). Only cells with exactly 3 hand counts are included (pingouin needs a balanced design); result is `ICC(C,k)` — two-way mixed, consistency, average of 3 raters — written to `conditions.icc`.

---

## 3. Database & Storage — Supabase

### Schema (hierarchy)
```
auth.users (Supabase Auth)
projects (id, name, invite_code, created_by)
  └─ project_members (project_id, user_id)          — join table; access-control root
  └─ experiments (id, project_id, name, date, dye, notes, created_by)
        └─ conditions (id, experiment_id, name, starvation, notes, icc)
              └─ cells (id, condition_id, name, image_url, source_filename)
                    └─ counts (id, cell_id, value, points, counted_by, created_at, type)
```
- `cell.average` / `condition.mean` — computed client-side in app.js at query time from `type = 'hand'` counts; never stored.
- `condition.icc` — written server-side (see above), also `type = 'hand'`-only.
- `counts.type` — `'hand'` for manual, or a `DETECTION_ALGORITHMS` slug (`otsu_watershed` / `fm_edge_overlay`) for machine-generated.
- `counts.points` — `jsonb` array of `{x, y}` percent-of-image coordinates: placed markers for a hand count, or watershed seeds/accepted maxima for an auto count.
- Dye is set once per experiment (not per condition); the Conditions detail panel shows the parent experiment's dye for reference.
- **Row-Level Security** exists at the table level, but is moot for Render (service-role key bypasses it) — enforcement is entirely in `api/main.py`'s ownership helpers.

> **Migration status:** the `projects`/`project_members` tables and `experiments.project_id` column are not yet applied to the live Supabase project (no real credentials in this dev environment). See `CLAUDE.md` for the exact SQL to run. Project edit/delete and member management (leave project, member list) are still unimplemented client- and server-side.

### Storage
- Bucket `cell-images`, **public** — both `image_url` and rendered display images are loaded via plain `<img src>`, which can't carry an auth header, so URLs must be publicly fetchable without a bearer token.
- Two path prefixes: `previews/{condition_id}/{uuid}.png` (Add Photos canvas render, ephemeral/display-only) and `cells/{condition_id}/{uuid}.png` (the permanent per-cell crop referenced by `cells.image_url`).

### Auth
- Supabase Auth issues JWTs. The frontend never calls Supabase Auth directly — it POSTs credentials to Render (`/auth/login`, `/auth/signup`, etc.), which proxies to `supabase.auth.*` and returns just the access token.
- Password reset/update uses a two-step flow: `reset_password_for_email` sends a recovery link; `update-password` validates the recovery token via `get_current_user` then uses the admin client (`supabase.auth.admin.update_user_by_id`) to set the new password, since a recovery token's session isn't otherwise usable server-side.

---

## 4. Cross-cutting notes

- **No build step anywhere.** GitHub Pages serves the static files as-is; Render runs `api/main.py` directly (see `api/requirements.txt`); there is no compile/bundle step client or server side.
- **CORS** on the Render API currently allows `*` (`CLAUDE.md`/`main.py` note this should be tightened to the GitHub Pages origin later).
- **Single researcher role in v1** — no admin panel, no per-project role distinctions beyond membership.
- **Reference assets:** `assets/ALDQ.ijm-*.txt` is the original ImageJ macro `fm_edge_overlay` ports; `assets/Image_43391.tif` is a sample microscopy image for local testing.
- **Docs:** [PRD.md](docs/PRD.md) (product requirements), [docs/tasks.md](docs/tasks.md) (phased build plan/status), [docs/plan.md](docs/plan.md), [docs/activity.md](docs/activity.md).
