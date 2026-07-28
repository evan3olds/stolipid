# Cell Archive — User Instructions

_A guide to using Cell Archive for lipid droplet counting. Replace bracketed text and screenshots as needed; this is a starting template, not final copy._

---

## 1. Getting Started

1. Go to `[https://evan3olds.github.io/stolipid/]`.
2. Log in with the email/password provided by your lab admin.
3. You'll land on the **Home** screen, showing the projects you're a member of.

> **Note:** First requests to the API may take 30–60 seconds if the server has been idle (free-tier cold start). This is normal — wait for the loading indicator rather than refreshing.

---

## 2. Projects

Projects are the top level of organization, shared with your lab or collaborators via an invite code.

- **Open a project** to see its experiments.
- **Join a project** using an invite code from a labmate. _(TODO: confirm this flow once project join/invite is implemented — see CLAUDE.md Projects note.)_
- **Create a project** — `[fill in once creation UI is finalized]`.

---

## 3. Experiments

An experiment is a top-level folder representing one experimental run (e.g., "Serum starvation timecourse").

1. From a project, click **Add experiment** to open the creation form.
2. Fill in:
   - **Name** — a short descriptive title
   - **Date** — when the experiment was run
   - **Dye** — the fluorescent dye used (applies to the whole experiment)
   - **Notes** — any relevant detail
3. Click an experiment card to view its details in the side panel, or double-click to open it.

---

## 4. Conditions

A condition is a treatment group within an experiment (e.g., "6 Hr Starved", "Control").

1. Inside an experiment, click **New slide** to add a condition.
2. Fill in:
   - **Name**
   - **Starvation length (hours)**
   - **Notes**
3. Open a condition to see:
   - Its cell count
   - The **ICC** (Intraclass Correlation Coefficient) — a measure of agreement across hand counts, with a quality label (e.g., "Good", "Excellent")
   - A mini chart of per-cell averages vs. the condition mean

---

## 5. Adding Cells (Add Photos)

1. Inside a condition, click **Add photos** and select your `.tif` file(s).
2. On the annotation screen:
   - Click anywhere on the image to draw a box around a cell
   - Drag a box to move it, or drag its corner handle to resize
   - Click the **×** on a box to remove it
3. Click **Create N cells** to confirm. Each box becomes one saved cell (processed to PNG automatically) — no counting happens yet.

---

## 6. Counting Lipid Droplets

### Hand counting
1. From the Cells screen, select a cell, then click **Add Hand Count**.
2. On the Count screen:
   - Click on each visible lipid droplet to place a numbered marker
   - Click a marker again to remove it
   - The running total is shown at the top
3. Click **Done** to save the count, or **Cancel** to discard it.
4. Repeat for up to **3 hand counts per cell** (used to calculate the average and ICC). Existing counts can be reopened and edited, or deleted with the **×** next to each entry.

### Auto count
1. From a cell's detail panel, use the **Auto count** section to run one or both detection algorithms:
   - **Standard** (`otsu_watershed`)
   - **FM_edge_overlay (ALDQ)** (`fm_edge_overlay`)
2. Running one does not overwrite the other — a cell can hold both machine counts at once.
3. Click **View** next to a result to see the detected markers on the Count screen.

---

## 7. Viewing Results

### Graph
1. Open the **Graph** screen from the sidebar menu.
2. Select an experiment and condition, then **Add to graph** (or **Add all conditions**).
3. Each condition appears as a column: dots are individual cell averages, the bar is the condition mean. Hover a dot for details.
4. Remove a condition from the graph with the **×** next to its name in the sidebar.

### Raw data
- Open **Raw data** from the sidebar for a full table (one row per count) across all experiments and conditions — useful for exporting to other analysis tools.

---

## 8. Navigation Reference

| Element | Location | Purpose |
|---|---|---|
| Hamburger menu | Top-left | Opens sidebar: Experiments, Graph, Raw data, About, Help |
| Breadcrumb | Subheader | Shows your current folder path; click to jump back up |
| Back button | Subheader | Visible inside Conditions/Cells screens |
| User avatar | Top-right | Account / logout |

---

## 9. Tips & Troubleshooting

- **Slow first upload?** Expect a delay after periods of inactivity — this is the backend waking up, not an error.
- **Need to redo a count?** Delete it from the cell's detail panel and recount, or reopen a saved hand count to edit its markers directly.
- **Dye field missing on a condition?** Dye is set once per experiment, not per condition — check the parent experiment.

---

## 10. Support

Questions or issues? `[point to Help screen in-app, and/or an email or issue tracker link]`
