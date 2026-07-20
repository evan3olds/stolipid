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
experiments (id, name, date, dye, notes, created_by)
  └── conditions (id, experiment_id, name, starvation, notes, icc)
        └── cells (id, condition_id, name, image_url, auto_count, source_filename)
              └── counts (id, cell_id, value, counted_by, created_at)
```
- `cell.average` and `condition.mean` are computed in JS at query time, not stored
- `condition.icc` is written by the Python pipeline and stored as a column
- `cells.auto_count` is a machine-suggested droplet count (rolling-ball background subtraction → dark-background Otsu threshold → binary fill-holes → distance-transform watershed), written by the Python pipeline at cell-creation time — not a hand count, not included in `cell.average`/`condition.icc`
- `cells.auto_points` is the `jsonb` grid of `{x, y}` percent-of-crop coordinates (the watershed seeds / local maxima behind `auto_count`), written alongside it by the Python pipeline
- `counts.points` is the `jsonb` grid of `{x, y}` percent-of-image marker positions placed on the Count screen for that hand count — lets a saved count be reopened and edited (via `PUT /counts/{id}`) instead of only deleted and recounted from scratch
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

Two themes: **Paper** (default) and **Sage**. CSS tokens:

| Token | Paper |
|---|---|
| Background | `oklch(0.965 0.008 75)` — warm off-white |
| Accent | `oklch(0.56 0.10 45)` — brownish-orange |
| Body font | IBM Plex Sans |
| Mono / labels | IBM Plex Mono |
| Headings | Newsreader (serif) |

Theme, app title, and prototype badge visibility are all runtime-configurable props (see PRD §10).

---

## Key Constraints

- **No build step in production.** The GitHub Pages deploy is a static file serve. Do not introduce npm, webpack, or any compile step.
- **Supabase-only backend.** No custom server. The Python pipeline runs locally on the researcher's machine.
- **Single researcher role.** No multi-user collaboration, no admin panel, no role-based access in v1.
- **Up to 3 hand counts per cell.** The counting UI enforces this limit; the `counts` table holds one row per count.
