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
  └── conditions (id, experiment_id, name, dye, starvation, notes, icc)
        └── cells (id, condition_id, name, image_url)
              └── counts (id, cell_id, value, counted_by, created_at)
```
- `cell.average` and `condition.mean` are computed in JS at query time, not stored
- `condition.icc` is written by the Python pipeline and stored as a column
- Row-Level Security: researchers only read/write their own experiment data

### Python API (Render)
A Python web API deployed on [Render](https://render.com) handles work the browser can't do. The frontend POSTs to it over HTTP — no local script required.
- Load `.tif` files with `tifffile` or `Pillow`
- Normalize contrast, apply green false-color LUT (BODIPY channel), export as PNG
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
