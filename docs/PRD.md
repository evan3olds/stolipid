# Product Requirements Document
## Cell Archive — Lipid Droplet Counting Tool

**Organization:** St. Olaf College, Biology Department  
**Status:** Working Prototype  
**Last Updated:** 2026-06-29  
**Stack:** GitHub Pages (HTML/CSS/JS) · Python (rendering/processing) · Supabase (database)

---

## 1. Overview

Cell Archive is a web-based research tool for organizing fluorescence microscopy data and turning manual lipid droplet hand counts into reproducible, comparable figures. It replaces scattered spreadsheets and folders of unlabeled images with a structured hierarchy: Experiments → Conditions → Cells → Counts.

The tool supports the full counting workflow: uploading microscopy images (.tif), boxing individual cells, recording up to three blind hand counts per cell, and visualizing condition averages on a scatter plot.

---

## 2. Problem Statement

Biology researchers at St. Olaf routinely count lipid droplets in fluorescence microscopy images (BODIPY, Nile Red staining) to quantify cellular lipid accumulation under different experimental treatments. The current process suffers from:

- Images stored in unstructured, unlabeled folders
- Counts recorded in disconnected spreadsheets with no link to source images
- No inter-rater reliability check across multiple hand counts
- No simple way to compare conditions within or across experiments visually

---

## 3. Users

**Primary user:** Biology researchers and students running lipid droplet quantification experiments at St. Olaf College.

**Roles in-scope (v1):** Single researcher role. Authentication is username/password. No admin panel or multi-role permissions required for the prototype.

---

## 4. Core Concepts

| Term | Definition |
|---|---|
| **Experiment** | A top-level folder representing one experimental run (e.g., serum starvation timecourse). Has a name, date, dye, and notes. |
| **Condition** | A sub-folder within an experiment representing one treatment group (e.g., "6 Hr Starved"). Has a starvation length; dye is set once at the experiment level and shown here for reference. |
| **Cell** | One individual cell extracted from a microscopy image. Belongs to a condition. |
| **Hand count** | A single manual count of lipid droplets in a cell image. Up to 3 per cell (for blinded inter-rater reliability). |
| **Average** | The mean of a cell's hand counts. Used for all summary statistics. |
| **ICC** | Intraclass Correlation Coefficient — a measure of agreement across hand counts for cells in a condition. |

---

## 5. Screens & Features

### 5.1 Login
- Username and password fields
- Single "Log in" button navigates to the Experiments screen
- Branding: "Biology Dept · Cell Archive" in monospace header

### 5.2 Experiments (Screen 3)
- Grid of experiment folder cards showing name, dye, condition count, and date
- Single-click to select and view details in a right-side panel; double-click to open
- Detail panel shows: name, date, dye, condition count, notes
- "Open experiment" button navigates into the experiment
- "Add experiment" button (top-right) opens a modal form

**Add Experiment Modal fields:** Name, Date, Dye, Notes

### 5.3 Conditions (Screen 4)
- Breadcrumb: Experiments / [Experiment Name]
- Grid of condition folder cards showing name and metadata
- Single-click to select; double-click to open
- Detail panel shows:
  - Condition name, dye (inherited from the parent experiment), starvation length, cell count
  - ICC value + quality label (e.g., "Good", "Excellent")
  - Mini scatter chart: one column per condition, dots = per-cell averages, bar = condition mean
- "New slide" button opens a modal to create a condition

**Add Condition Modal fields:** Name, Starvation length (hours), Notes

### 5.4 Cells (Screen 5)
- Breadcrumb: Experiments / [Experiment] / [Condition]
- Grid of cell cards showing name and count status tag (e.g., "2 counts", "needs count")
- Cards show a simulated fluorescence image thumbnail (green droplets on dark background)
- Select a cell to view its hand counts in the right panel:
  - "Average hand count" displayed prominently
  - List of individual counts with delete (×) button per entry
  - "Count" CTA button if the cell needs more counts
- "Add photos" button navigates to the Add Photos screen

### 5.5 Add Photos (Screen 6)
- Full-screen image annotation tool
- Left sidebar: thumbnail list of .tif files in the batch, with per-file box count
- Main canvas: click anywhere to place a bounding box centered at the click
- Each box is draggable (drag body to move) and resizable (drag corner handle)
- Each box has a numbered label and a × remove button
- Top bar shows: condition name, instruction text, "Cancel" and "Create N cells" buttons
- Confirming creates one Cell record per box drawn

### 5.6 Count (Screen 7)
- Dark-mode full-screen counting interface
- Displays the processed fluorescence image (BODIPY channel)
- Crosshair cursor; click anywhere on the image to place a numbered marker on a lipid droplet
- Click an existing marker to remove it
- Running total displayed in top bar ("Total: N")
- "Done" saves the count to the cell; "Cancel" discards

### 5.7 Graph (Screen 8)
- Left sidebar: select Experiment + Condition, then "Add to graph" or "Add all conditions"
- Selected conditions listed in sidebar with × remove button
- Main area: scatter plot titled "Lipid droplet counts by condition"
  - X-axis: one column per condition
  - Y-axis: lipid droplets / cell
  - Dots: individual cell averages (color-coded by series)
  - Bar: condition mean
  - Hover tooltip: experiment, condition, cell name, hand counts, average
- Legend shows condition names and experiment labels below each column
- "No data" empty state when nothing is selected

### 5.8 Raw Data
- Long-format table: one row per count across all experiments and conditions, not one row per cell
- Columns: Experiment, Condition, Cell, Count type, Value, Average, Source file — `Count type` reads "Count 1"/"Count 2"/"Count 3" for hand counts, the algorithm's display name for a machine count, or "No counts yet" when a cell has no hand counts
- Average rendered in accent color

### 5.9 Help
- List of help cards with title + body text
- Static content; editable in app config

### 5.10 About
- Describes the project purpose, origin (replacing spreadsheets/folders), and current status
- Intended for citations, protocols, and lab documentation links

---

## 6. Navigation

- **Top bar:** App title, prototype badge, hamburger menu button, logged-in user avatar
- **Sidebar (hamburger):** Experiments, Graph, Raw data, About, Help — slides in with animation
- **Subheader:** Breadcrumb for folder navigation + primary action button (context-sensitive)
- **Back button:** Visible when inside Conditions or Cells screens

---

## 7. Data Model

```
Experiment
  id, name, date, dye, notes
  └── Condition[]
        id, name, starvation (hours), notes
        └── Cell[]
              id, name
              └── counts: number[]   // up to 3 hand counts
```

Derived values (computed, not stored):
- `cell.average` = mean(counts)
- `condition.icc` = intraclass correlation across all cell hand counts
- `condition.mean` = mean of all cell averages

---

## 8. Technical Architecture

### 8.1 Frontend — GitHub Pages (HTML/CSS/JS)

The app is a static single-page application deployed via GitHub Pages. No build step or bundler is required in production — all UI is plain HTML, CSS, and vanilla JavaScript.

- **Hosting:** GitHub Pages serves the static site directly from the repository (e.g., `gh-pages` branch or `/docs` folder)
- **No framework dependency:** UI components are written in plain JS; no React, Vue, or bundler required
- **Supabase JS client:** Loaded via CDN (`@supabase/supabase-js`) for auth, data reads, and hand-count writes — image/ICC writes go through Render server-to-server, not the frontend
- **Auth:** Supabase Auth handles login/logout; the JWT is stored in `localStorage` and sent with every API request
- **Routing:** Client-side screen switching via JS state (no URL routing required for v1)

### 8.2 Python — Image Rendering & Processing

Python handles the computationally intensive work that the browser cannot do natively. The Python service is deployed as a web API on **Render** (render.com) and called by the frontend over HTTP.

- **TIFF loading:** Use `tifffile` or `Pillow` to read raw `.tif` fluorescence microscopy files
- **Image pre-processing:** Normalize contrast, apply false-color LUT (e.g., green channel for BODIPY), and export as PNG or JPEG for display in the browser
- **Upload pipeline:** The Render API accepts `.tif` file uploads, processes them, uploads the rendered PNG to Supabase Storage, and writes the cell/image metadata to the database — all directly via the Supabase API using the service role key
- **ICC calculation:** The `pingouin` library computes the Intraclass Correlation Coefficient for each condition and writes the result back to Supabase directly via the Supabase API
- **Invocation:** The frontend POSTs the `.tif` file to the Render API endpoint; all subsequent Supabase writes (storage upload, `image_url`, `icc`) are performed server-to-server by Render, not routed through the GitHub Pages frontend

> **Supabase access on Render:** Render uses the Supabase service role key (stored as a Render environment variable) to bypass Row-Level Security for its writes. The GitHub Pages frontend uses only the anon/public key with RLS enforced.

### 8.3 Database — Supabase

Supabase provides the Postgres database, file storage, and authentication layer.

**Tables:**

```sql
experiments
  id uuid PK, name text, date date, dye text, notes text, created_by uuid FK

conditions
  id uuid PK, experiment_id uuid FK, name text, starvation text, notes text

cells
  id uuid PK, condition_id uuid FK, name text, image_url text, source_filename text

counts
  id uuid PK, cell_id uuid FK, value integer, points jsonb, counted_by uuid FK, created_at timestamptz, type text
```

`counts.type` is `'hand'` for a manual count or a detection-algorithm slug (`otsu_watershed`/`fm_edge_overlay`) for a machine-generated one — see CLAUDE.md for the full breakdown. `cell.average`/`condition.icc` only consider `type = 'hand'` rows.

**Supabase Storage:**
- Bucket: `cell-images` — stores processed PNG exports of each cell crop
- Bucket: `raw-tifs` *(optional)* — stores original `.tif` batch files

**Auth:**
- Supabase Auth with email/password (maps to the username/password login screen)
- Row-Level Security (RLS) policies ensure researchers only read/write data for their own experiments

**Derived values (computed at query time or in JS):**
- `cell.average` = `AVG(counts.value)` grouped by `cell_id`
- `condition.mean` = mean of per-cell averages
- `condition.icc` = written by Python post-processing, stored as a column on `conditions`

---

## 9. Theming

| Token | Default (Paper) |
|---|---|
| Background | Warm off-white `oklch(0.965 0.008 75)` |
| Accent | Brownish-orange `oklch(0.56 0.10 45)` |
| Font (body) | IBM Plex Sans |
| Font (mono / labels) | IBM Plex Mono |
| Font (headings) | Newsreader (serif) |

A secondary theme ("Sage") is available. Theme is a configurable prop.

---

## 10. Configurable Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `theme` | enum: `paper`, `sage` | `paper` | Color theme |
| `appTitle` | string | `Cell Archive` | Title shown in header and login |
| `prototypeBadge` | boolean | `true` | Show/hide "Prototype" badge in top bar |

---

## 11. Out of Scope (v1)

- Multi-user collaboration or role-based access beyond single researcher login
- Mobile / responsive layout
- Automated droplet detection / AI counting
- Password reset or account management UI (handled via Supabase dashboard for now)

---

## 12. Future Considerations

- **CSV export:** Allow download of the Raw Data table directly from the browser
- **Automated counting:** Integrate image analysis (e.g., `cellpose`, `skimage`) in the Python pipeline to suggest droplet locations
- **Inter-rater workflow:** Assign counts to specific named researchers for true blinded counting; track who submitted each count
- **Expanded ICC reporting:** Show per-cell ICC breakdowns and flag outlier counts
- **Edge Function triggers:** Run the Python processing pipeline server-side on `.tif` upload via a Supabase Edge Function, eliminating the need for a local script
- **Admin panel:** Manage users and experiments via a separate admin view

---

## 13. Success Metrics

- Researchers can complete a full workflow (create experiment → add condition → box cells → count → view graph) without leaving the app
- ICC scores are visible at the condition level to assess count reliability
- Raw data table matches what would previously have been assembled manually from spreadsheets
