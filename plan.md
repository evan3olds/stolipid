# Plan: Phase 1 — Foundation

## Context

This is a greenfield project with no source tree yet. Phase 1 establishes the frontend scaffold only. The Supabase setup (schema, RLS, storage) belongs in the Render/Python project — Render is the sole service that talks to Supabase. The frontend never calls Supabase directly.

Architecture:
```
Browser → Render API (Python) → Supabase
```

---

## Files to Create (frontend repo only)

| File | Purpose |
|---|---|
| `index.html` | Shell HTML; loads fonts; `<div id="app">` mount point |
| `style.css` | CSS custom properties for Paper theme, base resets |
| `app.js` | Render API client + minimal screen-switching skeleton |

The `supabase/` folder does NOT belong here — SQL scripts live in the Render/Python repo.

---

## Implementation Details

### `index.html`

- `<link>` for Google Fonts: IBM Plex Sans, IBM Plex Mono, Newsreader
- `<link>` for `style.css`
- `<div id="app"></div>` mount point
- `<script src="app.js">` — no Supabase CDN

### `style.css`

```css
:root {
  --bg:           oklch(0.965 0.008 75);
  --accent:       oklch(0.56 0.10 45);
  --font-body:    'IBM Plex Sans', sans-serif;
  --font-mono:    'IBM Plex Mono', monospace;
  --font-heading: 'Newsreader', serif;
}
```

Base resets: `box-sizing: border-box`, zero margins, `body` uses `--bg` and `--font-body`.

### `app.js`

```js
const RENDER_API_URL = 'YOUR_RENDER_API_URL';

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${RENDER_API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function navigate(screen, params = {}) {
  // expanded in Phase 2+
}
```

No Supabase client. No screens rendered yet.

---

## Verification

1. Open `index.html` directly in a browser (no server needed)
2. DevTools console shows no errors on load
3. Confirm no Supabase CDN script tag is present in the page source

---
---

# Plan: Phase 2 — Auth (Login Screen)

## Context

Phase 1 (foundation scaffolding) is complete: `index.html` has a single `<div id="app">` mount, `style.css` has Paper theme CSS tokens, and `app.js` has an `api()` Render-API helper and a placeholder `navigate()`. The next task is Phase 2 — building the login screen and wiring it to auth.

**Architecture clarification (resolved during planning):** CLAUDE.md/PRD describe the frontend loading the Supabase JS client directly, but tasks.md Phase 1 states "Render is the sole service that talks to Supabase directly," and the existing `api()` helper already routes everything through Render. Confirmed: **the frontend never talks to Supabase directly.** Login POSTs credentials to a Render endpoint; Render validates against Supabase Auth and returns a JWT; the frontend stores that JWT and sends it as a Bearer token on all subsequent Render calls (via the existing `api()` helper). No Supabase JS client or CDN script is added to the frontend.

This is a deviation from CLAUDE.md/PRD as currently written — flagged for a doc update in a follow-up (not part of this implementation task).

---

## What to Build

### Login screen UI
- Full-page centered card on the Paper background
- Monospace header: `Biology Dept · Cell Archive` (IBM Plex Mono, small, muted)
- App title: `Cell Archive` (Newsreader serif, large heading)
- Username and password inputs
- `Log in` button (accent color)
- Error message area (hidden until auth fails)

### Auth flow (all through Render)
- Login button → `api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })`
  - `api()` already skips the Authorization header when no token exists, so this works unmodified for the login call itself
- On success: response is expected as `{ token: '<jwt>' }` → `localStorage.setItem('token', token)` → `navigate('experiments')`
- On failure: `api()` already throws on non-OK responses; catch and display the error message in the error area
- On app load: if `localStorage.getItem('token')` is present, skip the login screen and go straight to `navigate('experiments')` (no server-side validation round trip in this phase — kept simple for prototype status)
- Logout: clear `localStorage.removeItem('token')`, `navigate('login')`

### `navigate()` expansion (minimal, to support post-login routing)
- `navigate('login')` → render login screen
- `navigate('experiments')` → render a stub: `<p>Experiments — coming in Phase 4</p>` plus a "Log out" link (minimal chrome; full nav comes in Phase 3)
- Replaces `#app` innerHTML on each call

### `api()` — no changes needed
The existing implementation already reads the token from `localStorage.getItem('token')` and conditionally attaches the Bearer header — this already matches the Render-only architecture, so it's reused as-is.

---

## Files Modified

| File | Change |
|---|---|
| `app.js` | Added login screen renderer, auth wiring (login submit + error handling), minimal `navigate()` for `login`/`experiments`, app-load session check, logout handler |
| `style.css` | Added login card styles (centered layout, inputs, button, error text) |
| `index.html` | No change needed (no Supabase CDN script required) |

---

## Open Items Flagged

- Phase 11 (Python API / Render) task list did not include a `/auth/login` endpoint — added it to `tasks.md` Phase 11 so the Render side actually implements the endpoint this frontend work assumes.
- CLAUDE.md/PRD's "Frontend (GitHub Pages)" sections describe a direct Supabase JS client that the team has decided not to use — still needs a doc update in a follow-up so it doesn't mislead future work.

---

## Verification

1. Opened `index.html` in headless Chrome — login screen renders with correct Paper theme fonts/colors (screenshot-verified)
2. Submitted credentials — `api('/auth/login', ...)` fails against the still-placeholder `RENDER_API_URL`, and the inline error message displays correctly
3. Pre-set `localStorage.token` and reloaded — skips straight to the experiments stub
4. Clicked "Log out" — clears the token and returns to the login screen
5. Probed empty-field submission — blocked by native `required` validation before `api()` is called

---
---

# Plan: Phase 3 — Core Navigation

## Context

Phases 1–2 are complete. The current app renders whole-screen `innerHTML` swaps via `navigate()`: a login screen (no chrome) and an experiments stub. Phase 3 introduces the persistent authenticated "shell" — top bar, sidebar drawer, subheader — that all later screens (Experiments → Conditions → Cells) live inside.

## The core design shift

Every screen currently replaces all of `#app`. Phase 3's chrome must *persist* across screens and be context-sensitive (breadcrumb, back button, primary action). So a small navigation-state object plus a **shell renderer** draws the chrome once and swaps only the content region.

---

## What to Build

### 1. Navigation state + router refactor (`app.js`)
- Add a `state` object: `{ screen, experiment, condition }` (experiment/condition hold id + name for breadcrumbs; null until Phase 4/5 populate them).
- Rework `navigate(screen, params)` to update `state`, then dispatch:
  - `login` → `renderLogin()` (unchanged, no shell)
  - authenticated screens → `renderShell()` then fill the content area with that screen's stub.
- Keep the boot check and logout as-is.

### 2. Top bar
- App title (`Cell Archive`, from a config constant so Phase 13's `appTitle`/`prototypeBadge` props slot in later), a "Prototype" badge, a hamburger button (left), and a user-avatar circle (right, initial derived from the stored token/username).
- Hamburger toggles the sidebar drawer.

### 3. Sidebar drawer
- Off-canvas panel with a translucent backdrop, `transform: translateX` slide-in animation.
- Links: Experiments, Graph, Raw Data, About, Help. Each calls `navigate(...)` to a **stub** screen and closes the drawer. Clicking the backdrop or Esc closes it.

### 4. Subheader (breadcrumb + context action)
- Breadcrumb built from `state`: `Experiments`, `Experiments / [Exp]`, `Experiments / [Exp] / [Condition]`.
- Right-aligned primary action button whose label/handler is context-sensitive (e.g. "Add experiment" on Experiments, "New slide" on Conditions). For Phase 3 these are wired to no-op stubs with the correct labels; real behavior comes with each screen's phase.

### 5. Back-button logic
- Back button appears in the subheader only on Conditions and Cells screens; pops one level up the hierarchy using `state` (Cells → Conditions → Experiments).

### 6. Styling (`style.css`)
- Add `.topbar`, `.badge`, `.avatar`, `.hamburger`, `.sidebar`/`.sidebar-backdrop` (slide transition), `.subheader`, `.breadcrumb`, `.primary-action`, `.back-btn`, and a `.content` wrapper — all using existing Paper tokens (mono for labels/breadcrumb, accent for the action button).
- Replace the temporary `.app-shell` stub styling with the real shell.

---

## Scope boundary

The Experiments/Graph/Raw Data/About/Help destinations remain **stubs** this phase — Phase 3 is only the chrome and navigation wiring. The stubs render inside the new shell so the breadcrumb, back button, and drawer are all demonstrably functional.

---

## Verification

Open `index.html`, log in (test account), then confirm: hamburger opens/closes the drawer (animation, backdrop, Esc); each sidebar link swaps content and updates the breadcrumb; the primary action button label changes per screen; the back button appears only inside Conditions/Cells and steps up correctly.

---

## Final step (per project convention)

After implementation: check Phase 3 items in `tasks.md`, append a Phase 3 entry to `activity.md`, and keep this plan in `plan.md`.
