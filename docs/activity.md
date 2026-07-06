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
