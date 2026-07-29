# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Status

This is a **working prototype** for Cell Archive, a lipid droplet counting tool for fluorescence microscopy data. See [PRD.md](PRD.md) for full product requirements and [tasks.md](tasks.md) for the phased build plan.

The current repository contains:
- `Cell Archive (standalone) (1).html` — a self-contained bundled prototype (all assets compressed inside; not human-editable source)
- `PRD.md` — full product requirements document
- `tasks.md` — phased development task checklist

There is no source tree yet. When building out the actual app, the target structure is a plain HTML/CSS/JS static site deployable to GitHub Pages, with no build step or bundler required.

---

## Intended Architecture

### Frontend (GitHub Pages)
- Single `index.html` with vanilla JS — no framework, no bundler, no npm
- Supabase JS client loaded via CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js`
- Client-side screen switching via JS state (no URL routing in v1)
- Auth: Supabase Auth JWT stored in `localStorage`

### Database (Supabase)
Four tables with this hierarchy:
```
projects (id, name, invite_code, created_by)
  └── project_members (project_id, user_id)
  └── experiments (id, project_id, name, date, dye, notes, created_by)
        └── conditions (id, experiment_id, name, starvation, notes, icc)
              └── cells (id, condition_id, name, image_url, source_filename)
                    └── counts (id, cell_id, value, points, counted_by, created_at, type)
```

**Projects (see `docs/tasks.md` Phase 14):** `projects` sits above `experiments` as the top-level parent, shared with collaborators via an invite code; `project_members` is the join table granting access. `api/main.py` enforces access at the project level — `owned_project` checks `project_members` for the requesting user, and `owned_experiment`/`owned_condition`/`owned_cell` all walk up to it, so any project member (not just the original creator) can read/write everything under a shared project. `experiments.created_by` is kept only as provenance (who created that specific experiment), not as an access check. **Schema migration not yet applied to the live Supabase project** (no real credentials in this environment — same situation as the other pending-migration notes in `docs/tasks.md` Phase 11c): run
```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table experiments add column project_id uuid references projects(id);
```
against Supabase before this deploys. Project edit/delete and member-management (leave project, member list) are still out of scope — not implemented client or server side.
- `cell.average` and `condition.mean` are computed in JS at query time from `counts` rows where `type = 'hand'`, not stored
- `condition.icc` is written by the Python pipeline and stored as a column, also computed only over `type = 'hand'` rows
- `counts.type` is `'hand'` for a manual count, or a detection algorithm slug for a machine-generated one. Add Photos never writes a machine-generated row — it only saves the converted image. Auto-count is opt-in per cell afterward, triggered from the Cells screen's Auto count section, which lets the researcher run either or both of two algorithms (`api/detection.py`'s `detect_droplets(plane, algorithm=...)`, called via `PUT /cells/{id}/auto-count`) against that already-saved image; running the second doesn't erase the first, so a cell can hold one machine-generated `counts` row per algorithm (up to two total) at once (`counted_by` is the researcher who triggered that run, not necessarily the original uploader):
  - `otsu_watershed` ("Standard" in the UI): rolling-ball background subtraction → dark-background Otsu threshold → binary fill-holes → distance-transform watershed
  - `fm_edge_overlay` ("FM_edge_overlay (ALDQ)" in the UI): a fixed-parameter port of the lab's `assets/ALDQ.ijm-*.txt` ImageJ macro's "FM_edge_overlay" LD-determination steps — iterative highpass-sharpening → (edge/threshold/watershed particle mask filtered by size+circularity) ∩ (Find-Maxima local peaks on a further-blurred copy); a maximum only counts if it lands on an accepted particle, matching the macro's own stated intent
- `counts.points` is the `jsonb` grid of `{x, y}` percent-of-image coordinates for that count — for a hand count, the markers placed on the Count screen (lets a saved count be reopened and edited via `PUT /counts/{id}` instead of only deleted and recounted from scratch); for a machine-generated count, the watershed seeds / accepted local maxima behind its `value`
- `cells.source_filename` is the original uploaded `.tif` filename, written by the Python pipeline at cell-creation time (one source file can produce multiple cells, one per annotated box)
- Dye is set once at the experiment level, not per-condition — the Conditions screen detail panel displays the parent experiment's dye for reference
- Row-Level Security: researchers only read/write their own experiment data

### Python API (Render)
A Python web API deployed on [Render](https://render.com) handles work the browser can't do. The frontend POSTs to it over HTTP — no local script required.
- Load `.tif` files with `tifffile` or `Pillow`
- Normalize contrast, render as grayscale, export as PNG
- Upload rendered PNG to Supabase Storage bucket `cell-images`; write `image_url` back to `cells`
- Compute ICC per condition with `pingouin`; write result to `conditions.icc`

Render communicates with Supabase **directly server-to-server** using the Supabase service role key — it does not route writes through the GitHub Pages frontend. The frontend is only responsible for POSTing the `.tif` file to Render; all subsequent database and storage writes happen on the Render side.

> **Render free tier cold starts:** The Render service spins down after inactivity. The first API call after idle may take 30–60 seconds. The frontend should show a loading state during image upload rather than assuming a fast response.

---

## Theming

Two themes: **Paper** (default) and **Sage**, internally — user-facing UI labels them **Light** and **Dark** (Settings screen). CSS tokens:

| Token | Paper |
|---|---|
| Background | `oklch(0.965 0.008 75)` — warm off-white |
| Accent | `oklch(0.56 0.10 45)` — brownish-orange |
| Body font | IBM Plex Sans |
| Mono / labels | IBM Plex Mono |
| Headings | Newsreader (serif) |

Sage (`:root[data-theme="sage"]` in `style.css`) is a full dark theme — every active token is re-derived from its own `-paper` literal via CSS relative-color syntax rather than hand-authored, so the two palettes can't drift out of sync.

Theme, app title, and prototype badge visibility are all runtime-configurable props (see PRD §10). Theme selection lives on the Settings screen (`initSettings`/`renderSettingsHTML` in `app.js`), reachable from the profile dropdown on any screen; it persists to `localStorage['theme']` using the internal `'paper'`/`'sage'` values, unaffected by the Light/Dark label rename. The Settings screen also has an avatar picker (`AVATARS` in `app.js`, persisted to `localStorage['avatar']`) — 5 uniformly-named placeholders, `assets/avatar-1.png`..`avatar-5.png`, standing in until real artwork (planned: lab animal mascots) replaces those 5 files in place.

---

## Key Constraints

- **No build step in production.** The GitHub Pages deploy is a static file serve. Do not introduce npm, webpack, or any compile step.
- **Supabase-only backend.** No custom server. The Python pipeline runs locally on the researcher's machine.
- **Single researcher role.** No multi-user collaboration, no admin panel, no role-based access in v1.
- **Up to 3 hand counts per cell.** The counting UI enforces this limit; the `counts` table holds one row per count.
