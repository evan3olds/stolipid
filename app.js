const RENDER_API_URL = 'https://stolipid.onrender.com';

// All backend calls go through Render, which talks to Supabase server-side
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

const app = document.getElementById('app');

// ---- Preview mode ----
// Set by the login screen's "Preview app" button (logs in as the shared
// local test account — see docs/test-accounts.json — with an extra flag)
// so a visitor can click through real screens with sample data without
// creating, editing, or deleting anything. Every mutating control across
// the app is wired independently per-screen (no shared form/submit
// pipeline to hook into), so this is enforced by a single capture-phase
// listener keyed on a selector allowlist rather than per-button guards.
function isPreviewMode() {
  return localStorage.getItem('previewMode') === 'true';
}

const PREVIEW_BLOCKED_SELECTOR = [
  '#primary-action',                              // + New Experiment/Condition, + Add Photos, Create/Join project
  '#modal-save',                                   // every create/edit modal's submit
  '.card-menu-dropdown [data-action="edit"]',
  '.card-menu-dropdown [data-action="remove"]',
  '.count-delete-btn',
  '.count-edit-btn:not(.auto-count-view-btn)',      // real "Edit count"; auto-count's "View" reuses this class but is read-only
  '.auto-count-run-btn',
  '#count-cta',                                    // "Add Hand Count" — the only entry into an editable Count screen
  '#count-done',
  '#canvas-frame',                                  // draws a box on Add Photos
  '.photo-box',                                     // drag to move a box
  '.photo-box-handle',                              // drag to resize a box
  '.photo-box-remove',
  '#addphotos-create',
  '#addphotos-choose',
  '#addphotos-add-files',
].join(', ');

let previewToastTimer = null;
function showPreviewToast() {
  let toast = document.getElementById('preview-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'preview-toast';
    toast.className = 'preview-toast';
    toast.textContent = 'Preview mode is read-only — log in to make changes.';
    document.body.appendChild(toast);
  }
  toast.classList.add('visible');
  clearTimeout(previewToastTimer);
  previewToastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function initPreviewGuard() {
  const intercept = e => {
    if (!isPreviewMode()) return;
    if (!e.target.closest(PREVIEW_BLOCKED_SELECTOR)) return;
    e.preventDefault();
    e.stopPropagation();
    showPreviewToast();
  };
  document.addEventListener('click', intercept, true);
  document.addEventListener('mousedown', intercept, true);
}

// Runtime-configurable props (see CLAUDE.md / PRD §10). appTitle and
// prototypeBadge are developer-set constants; theme has a user-facing
// toggle (top bar) and persists to localStorage, overriding this default.
const CONFIG = {
  appTitle: 'Cell Archive',
  prototypeBadge: true,
  theme: 'paper',
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

// Avatar picker (Settings screen). All 5 files are placeholders — every id
// maps straight to assets/avatar-N.png, so the eventual real artwork (lab
// animal mascots) can drop in over these same 5 filenames with no code
// change. AVATARS[0] (avatar-1) is the default when nothing is picked yet.
const AVATARS = [1, 2, 3, 4, 5].map(n => ({
  id: `avatar-${n}`,
  src: `assets/avatar-${n}.png`,
  label: `Avatar ${n}`,
}));

function currentAvatarId() {
  const id = localStorage.getItem('avatar');
  return AVATARS.some(a => a.id === id) ? id : AVATARS[0].id;
}

function avatarSrcById(id) {
  return (AVATARS.find(a => a.id === id) || AVATARS[0]).src;
}

// Project color tags (Projects screen). Purely a client-side label — picked
// per project via the swatch button on its folder-card, persisted to
// localStorage['projectColors'] (id -> color id), not synced to other
// project members or the backend.
const PROJECT_COLORS = [
  { id: 'rose',   value: 'oklch(0.62 0.16 15)',  label: 'Rose' },
  { id: 'amber',  value: 'oklch(0.68 0.15 70)',  label: 'Amber' },
  { id: 'olive',  value: 'oklch(0.62 0.12 120)', label: 'Olive' },
  { id: 'teal',   value: 'oklch(0.60 0.09 190)', label: 'Teal' },
  { id: 'blue',   value: 'oklch(0.58 0.12 250)', label: 'Blue' },
  { id: 'violet', value: 'oklch(0.58 0.14 300)', label: 'Violet' },
  { id: 'plum',   value: 'oklch(0.55 0.13 335)', label: 'Plum' },
  { id: 'slate',  value: 'oklch(0.55 0.02 260)', label: 'Slate' },
];

function projectColorMap() {
  try {
    return JSON.parse(localStorage.getItem('projectColors') || '{}');
  } catch {
    return {};
  }
}

function getProjectColor(projectId) {
  const colorId = projectColorMap()[projectId];
  return PROJECT_COLORS.find(c => c.id === colorId) || null;
}

function setProjectColor(projectId, colorId) {
  const map = projectColorMap();
  if (colorId) {
    map[projectId] = colorId;
  } else {
    delete map[projectId];
  }
  localStorage.setItem('projectColors', JSON.stringify(map));
}

// Static Help screen content — one card per workflow step (PRD 5.9)
const HELP_CONTENT = [
  {
    key: 'projects',
    title: 'Projects',
    body: 'A project is the top-level container for a group of experiments, shared with collaborators via an invite code. From Home, click "Create/Join project" to start a new project or join one a labmate already created by entering their invite code. Open a project\'s detail panel to copy its invite code and share it.',
  },
  {
    key: 'experiments',
    title: 'Experiments',
    body: 'An experiment is a folder for one experimental run within a project (e.g. a serum starvation timecourse). Click "Add experiment" to record its name, date, dye, and notes. Open an experiment to see its conditions.',
  },
  {
    key: 'conditions',
    title: 'Conditions',
    body: 'A condition is a treatment group within an experiment (e.g. "6 Hr Starved"). Each condition tracks its own ICC score once its cells have hand counts — ICC measures how well the hand counts agree with each other.',
  },
  {
    key: 'cells-add-photos',
    title: 'Cells & Add Photos',
    body: 'Use "Add photos" to upload .tif microscopy images and draw a box around each cell you want to track. One cell record is created per box. From a cell’s detail panel, run "Standard" or "FM_edge_overlay (ALDQ)" under Auto count to get an automatic droplet count suggestion — this is not a hand count and does not factor into the average or ICC.',
  },
  {
    key: 'counting',
    title: 'Counting',
    body: 'Open a cell and click "Add Hand Count" to record a blind hand count. Click anywhere on the image to place a marker on a droplet, or click a marker to remove it. Use the zoom controls to separate small, closely-clustered droplets. Each cell supports up to three hand counts.',
  },
  {
    key: 'graph',
    title: 'Graph',
    body: 'Pick an experiment and condition (or "All conditions") in the sidebar and add it to the chart to compare counts visually. Choose a chart type — scatter (each dot is one cell, the bar marks the condition mean), bar chart (mean ± standard deviation), or box plot (min/median/max quartiles) — and hover any point, bar, or box for the full breakdown, including hand counts.',
  },
  {
    key: 'raw-data',
    title: 'Raw data',
    body: 'A flat table of every cell across every experiment and condition, including all three hand counts, the average, the auto count, and the source .tif filename. Click a column header to sort, or use the filter box to search by name.',
  },
  {
    key: 'reliability-icc',
    title: 'Reliability (ICC)',
    body: 'ICC (Intraclass Correlation Coefficient) quantifies agreement across a condition\'s hand counts — higher is better. It is computed automatically whenever hand counts are added or removed, so counting a cell a second or third time will update it.',
  },
];

// Static About screen content (PRD 5.10). `links` starts empty — populate
// with citation/protocol/lab documentation entries as they become available.
const ABOUT_CONTENT = {
  purpose: 'Lipid Counter turns manual lipid droplet hand counts from fluorescence microscopy into reproducible, comparable figures. It replaces scattered spreadsheets and folders of unlabeled images with a structured hierarchy: Experiments → Conditions → Cells → Counts.',
  origin: 'Built for biology researchers and students at St. Olaf College quantifying cellular lipid accumulation (BODIPY, Nile Red staining) under different experimental treatments, where the previous process had no link between counts and source images and no way to check inter-rater reliability.',
  status: 'Working prototype. Core workflow (shared projects, experiments, conditions, cells, hand counting, auto-count suggestions, graphing, and raw data export) is functional; see the Prototype badge in the top bar.',
  links: [],
  creators: ["Brooke Barenz, '27", "Evan Olds, '27"],
  credits: [],
};

// Navigation state — persists across the authenticated shell
const state = {
  screen: 'login',
  project: null,           // { id, name, inviteCode }
  experiment: null,        // { id, name }
  condition: null,         // { id, name }
  cell: null,              // { id, name }
  editingCount: null,      // { id, points } when reopening a saved hand count for edit, else null
  viewingAutoPoints: null, // points[] when read-only viewing a cell's auto-count grid, else null
  viewingAllCounts: null,  // counts[] when read-only viewing every hand count's grid overlaid, else null
  returnScreen: null,      // screen to restore on Back from Graph/Raw data — see navigate()
  settingsReturnScreen: null, // screen to restore on Back from Settings — see navigate()
};

// Per-screen chrome metadata: subheader title, primary action label, back button
const SCREENS = {
  experiments: { title: 'Experiments', action: 'Add experiment', back: true },
  conditions:  { title: 'Conditions',  action: 'New Condition', back: true },
  cells:       { title: 'Cells',       action: 'Add photos',   back: true },
  graph:       { title: 'Graph',    back: true },
  rawdata:     { title: 'Raw data', back: true },
  about:       { title: 'About', back: true },
  help:        { title: 'Help',  back: true },
  settings:    { title: 'Settings', back: true },
  count:       { title: 'Count' },
  addphotos:   { title: 'Add Photos' },
};

// Screens that only make sense once a project is selected — visiting one
// directly before ever opening a project bounces back to Projects rather
// than rendering against an undefined state.project.
const PROJECT_SCREENS = ['experiments', 'conditions', 'cells', 'graph', 'rawdata'];

// Screen router
function navigate(screen, params = {}) {
  if ('project' in params) state.project = params.project;
  if ('experiment' in params) state.experiment = params.experiment;
  if ('condition' in params) state.condition = params.condition;
  if ('cell' in params) state.cell = params.cell;
  if (PROJECT_SCREENS.includes(screen) && !state.project) screen = 'projects';

  // Graph/Raw data are a detour from Experiments/Conditions/Cells, reached
  // from the bottom bar — remember where the user came from so Back returns
  // there directly instead of retracing the Experiments→Conditions→Cells
  // hierarchy. Hopping between Graph and Raw data doesn't overwrite it.
  if ((screen === 'graph' || screen === 'rawdata') && !['graph', 'rawdata'].includes(state.screen)) {
    state.returnScreen = state.screen;
  }

  // Settings is reachable from the profile menu on every screen — remember
  // where the user came from (kept separate from returnScreen above, since
  // opening Settings from Graph/Raw data must not clobber the origin those
  // still need for their own Back button) so Back and the breadcrumb return
  // there instead of always bouncing to Home. Graph/Raw data are themselves
  // just a detour tab, not a real hierarchy stop, so opening Settings from
  // one of them collapses through to the Experiments/Conditions/Cells
  // screen underneath rather than showing "Graph"/"Raw data" as the crumb
  // Settings hangs off of.
  if (screen === 'settings' && state.screen !== 'settings') {
    state.settingsReturnScreen = (state.screen === 'graph' || state.screen === 'rawdata')
      ? (state.returnScreen || 'experiments')
      : state.screen;
  }

  state.screen = screen;
  if (screen === 'login') return renderLogin();
  if (screen === 'addphotos') return renderAddPhotos();
  if (screen === 'count') {
    // Reset on every entry (not just `if ('editingCount' in params)`) so a
    // stale edit target or auto-count view from a prior visit can't leak
    // into a fresh count.
    state.editingCount = params.editingCount || null;
    state.viewingAutoPoints = params.viewingAutoPoints || null;
    state.viewingAllCounts = params.viewingAllCounts || null;
    return renderCount();
  }
  // Home and Projects are standalone screens (like Login/Add Photos), not
  // part of the authenticated shell — there's no project yet for
  // Experiments/Graph/etc. to be scoped to.
  if (screen === 'home') return renderHome();
  if (screen === 'projects') return renderProjects();
  renderShell(screen);
  if (screen === 'experiments') initExperiments();
  if (screen === 'conditions') initConditions();
  if (screen === 'cells') initCells();
  if (screen === 'graph') initGraph();
  if (screen === 'rawdata') initRawData();
  if (screen === 'about') initAbout();
  if (screen === 'help') initHelp();
  if (screen === 'settings') initSettings();
}

function initHelp() {
  document.querySelector('.content').innerHTML = renderHelpHTML();
  wireHelp();
}

function renderHelpHTML() {
  return `
    <div class="wiki-layout">
      <aside class="wiki-sidebar">
        <input type="search" class="wiki-search-input" id="help-search" placeholder="Search help..." aria-label="Search help topics">
        <nav class="wiki-toc" aria-label="Table of contents" id="help-toc">
          <div class="wiki-toc-title">Contents</div>
          <ul class="wiki-toc-list">
            ${HELP_CONTENT.map(card => `
              <li class="wiki-toc-item" data-key="${card.key}"><a class="wiki-toc-link" href="#help-${card.key}">${card.title}</a></li>
            `).join('')}
          </ul>
        </nav>
      </aside>
      <div class="wiki-article">
        ${HELP_CONTENT.map(card => `
          <section class="wiki-section" id="help-${card.key}" data-key="${card.key}">
            <h3 class="wiki-section-title">${card.title}</h3>
            <p class="wiki-section-body">${card.body}</p>
          </section>
        `).join('')}
        <p class="wiki-no-results" id="help-no-results" hidden>No help topics match your search.</p>
      </div>
    </div>
  `;
}

function updateWikiFirstVisible() {
  const sections = Array.from(document.querySelectorAll('.wiki-section'));
  sections.forEach(s => s.classList.remove('wiki-section-first-visible'));
  const first = sections.find(s => !s.hidden);
  if (first) first.classList.add('wiki-section-first-visible');
}

function wireHelp() {
  const searchInput = document.getElementById('help-search');
  const noResults = document.getElementById('help-no-results');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let matchCount = 0;

    HELP_CONTENT.forEach(card => {
      const match = !q || card.title.toLowerCase().includes(q) || card.body.toLowerCase().includes(q);
      if (match) matchCount++;
      document.getElementById(`help-${card.key}`).hidden = !match;
      document.querySelector(`.wiki-toc-item[data-key="${card.key}"]`).hidden = !match;
    });

    noResults.hidden = matchCount > 0;
    updateWikiFirstVisible();
  });

  updateWikiFirstVisible();
}

function initAbout() {
  document.querySelector('.content').innerHTML = renderAboutHTML();
}

function renderAboutHTML() {
  const c = ABOUT_CONTENT;
  return `
    <div class="about-panel">
      <div class="about-section">
        <h3 class="about-section-title">Purpose</h3>
        <p class="about-section-body">${c.purpose}</p>
      </div>
      <div class="about-section">
        <h3 class="about-section-title">Origin</h3>
        <p class="about-section-body">${c.origin}</p>
      </div>
      <div class="about-section">
        <h3 class="about-section-title">Status</h3>
        <p class="about-section-body">${c.status}</p>
      </div>
      ${c.links.length ? `
        <div class="about-section">
          <h3 class="about-section-title">Citations &amp; protocols</h3>
          <ul class="about-links">
            ${c.links.map(l => `<li><a class="about-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a></li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="about-footer-row">
        <div class="about-mini-box">
          <h4 class="about-mini-title">Creators</h4>
          ${c.creators.length ? `<ul class="about-mini-list">${c.creators.map(name => `<li>${escHtml(name)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="about-mini-box">
          <h4 class="about-mini-title">Credits</h4>
          ${c.credits.length ? `<ul class="about-mini-list">${c.credits.map(name => `<li>${escHtml(name)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
    </div>
  `;
}

function initSettings() {
  document.querySelector('.content').innerHTML = renderSettingsHTML();
  wireSettings();
}

function renderSettingsHTML() {
  const theme = document.documentElement.dataset.theme === 'sage' ? 'sage' : 'paper';
  const activeAvatar = currentAvatarId();
  return `
    <div class="settings-panel">
      <div class="settings-section">
        <h3 class="settings-section-title">Theme</h3>
        <div class="settings-theme-options">
          <button type="button" class="settings-theme-btn${theme === 'paper' ? ' active' : ''}" data-theme="paper">
            <span class="settings-theme-swatch settings-theme-swatch-light"></span>Light
          </button>
          <button type="button" class="settings-theme-btn${theme === 'sage' ? ' active' : ''}" data-theme="sage">
            <span class="settings-theme-swatch settings-theme-swatch-dark"></span>Dark
          </button>
        </div>
      </div>
      <div class="settings-section">
        <h3 class="settings-section-title">Avatar</h3>
        <div class="settings-avatar-grid">
          ${AVATARS.map(a => `
            <button type="button" class="settings-avatar-btn${a.id === activeAvatar ? ' active' : ''}" data-avatar="${a.id}" aria-label="${escHtml(a.label)}" title="${escHtml(a.label)}">
              <img class="settings-avatar-img" src="${a.src}" alt="">
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function wireSettings() {
  document.querySelectorAll('.settings-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      document.querySelectorAll('.settings-theme-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('.settings-avatar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('avatar', btn.dataset.avatar);
      document.querySelectorAll('.settings-avatar-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.profile-avatar').forEach(img => { img.src = avatarSrcById(btn.dataset.avatar); });
    });
  });
}

// mode: 'login' | 'signup' | 'forgot'
function renderLogin(mode = 'login') {
  const copy = {
    login:  { submit: 'Log in',        error: 'Login failed. Check your email and password.' },
    forgot: { submit: 'Send reset link', error: 'Could not send reset link.' },
  }[mode];

  app.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="login-form">
        <div class="login-eyebrow">Biology Dept &middot; ${CONFIG.appTitle}</div>
        <h1 class="login-title">${CONFIG.appTitle}</h1>
        <div class="login-field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required>
        </div>
        ${mode !== 'forgot' ? `
        <div class="login-field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>` : ''}
        <button class="login-submit" type="submit">${copy.submit}</button>
        <div class="login-message" id="login-message"></div>
        <div class="login-error" id="login-error"></div>
        <div class="login-links">
          ${mode === 'login' ? `
            <button type="button" class="login-link" id="login-forgot-link">Forgot password?</button>
            <button type="button" class="login-link" id="login-signup-link">Create account</button>
          ` : `
            <button type="button" class="login-link" id="login-back-link">Back to log in</button>
          `}
        </div>
        ${mode === 'login' ? `
        <div class="login-divider"><span>or</span></div>
        <button type="button" class="login-preview-btn" id="login-preview-btn">Preview app</button>
        <div class="login-preview-hint">Explore with sample data — no account, view only.</div>
        ` : ''}
      </form>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const messageEl = document.getElementById('login-message');

  if (mode === 'login') {
    document.getElementById('login-forgot-link').addEventListener('click', () => renderLogin('forgot'));
    document.getElementById('login-signup-link').addEventListener('click', () => openSignupModal());
    document.getElementById('login-preview-btn').addEventListener('click', () => {
      localStorage.setItem('token', 'local:test@example.com');
      localStorage.setItem('previewMode', 'true');
      navigate('home');
    });
  } else {
    document.getElementById('login-back-link').addEventListener('click', () => renderLogin('login'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    messageEl.textContent = '';

    const email = document.getElementById('login-email').value;
    const password = mode !== 'forgot' ? document.getElementById('login-password').value : undefined;

    if (mode === 'login') {
      messageEl.textContent = 'Loading...';

      // Check test-accounts.json before hitting the real API
      try {
        const testAccounts = await fetch('docs/test-accounts.json').then(r => r.json());
        const match = testAccounts.find(a => a.email === email && a.password === password);
        if (match) {
          localStorage.setItem('token', `local:${email}`);
          navigate('home');
          return;
        }
      } catch (_) {
        // test-accounts.json unavailable; fall through to real API
      }

      const bootTimer = setTimeout(() => {
        messageEl.textContent = 'Loading... Please wait 1-2 minutes while the site boots up.';
      }, 3000);
      try {
        const { token } = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        localStorage.setItem('token', token);
        navigate('home');
      } catch (err) {
        errorEl.textContent = copy.error;
        messageEl.textContent = '';
      } finally {
        clearTimeout(bootTimer);
      }
      return;
    }

    if (mode === 'forgot') {
      try {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        messageEl.textContent = 'If that email has an account, a reset link is on its way.';
      } catch (err) {
        errorEl.textContent = copy.error;
      }
    }
  });
}

// ---- Create account (popup) ----
// A modal rather than a full-screen swap, so it visually reads as a distinct
// "create account" action layered on top of the login screen instead of
// just another mode of the same page.

function openSignupModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">Create account</div>
      <form class="modal-form" id="signup-form">
        <div class="modal-field">
          <label for="signup-email">Email</label>
          <input id="signup-email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="modal-field">
          <label for="signup-password">Password</label>
          <input id="signup-password" name="password" type="password" autocomplete="new-password" required>
        </div>
        <div class="login-message" id="signup-message"></div>
        <div class="modal-error" id="signup-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="signup-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="signup-submit">Create account</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('signup-cancel').addEventListener('click', removeModal);

  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('signup-error');
  const messageEl = document.getElementById('signup-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    messageEl.textContent = '';

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
      const result = await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.token) {
        localStorage.setItem('token', result.token);
        removeModal();
        navigate('home');
      } else {
        messageEl.textContent = 'Check your email to confirm your account, then log in.';
      }
    } catch (err) {
      errorEl.textContent = 'Could not create account.';
    }
  });
}

// ---- Password recovery ----
// Supabase's reset-password email redirects here with the session in the URL
// fragment (`#access_token=...&type=recovery&...`) rather than a query string,
// so it's on the frontend to notice it and swap in a "set new password" form.

function renderResetPassword(accessToken) {
  app.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="reset-form">
        <div class="login-eyebrow">Biology Dept &middot; ${CONFIG.appTitle}</div>
        <h1 class="login-title">Set a new password</h1>
        <div class="login-field">
          <label for="reset-password">New password</label>
          <input id="reset-password" name="password" type="password" autocomplete="new-password" required minlength="6">
        </div>
        <div class="login-field">
          <label for="reset-password-confirm">Confirm password</label>
          <input id="reset-password-confirm" name="password-confirm" type="password" autocomplete="new-password" required minlength="6">
        </div>
        <button class="login-submit" type="submit">Set password</button>
        <div class="login-message" id="reset-message"></div>
        <div class="login-error" id="reset-error"></div>
      </form>
    </div>
  `;

  const form = document.getElementById('reset-form');
  const errorEl = document.getElementById('reset-error');
  const messageEl = document.getElementById('reset-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    messageEl.textContent = '';

    const password = document.getElementById('reset-password').value;
    const confirm = document.getElementById('reset-password-confirm').value;
    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }

    try {
      const res = await fetch(`${RENDER_API_URL}/auth/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error(await res.text());
      localStorage.setItem('token', accessToken);
      navigate('home');
    } catch (err) {
      errorEl.textContent = 'Could not set new password. The reset link may have expired — request a new one.';
    }
  });
}

// ---- Authenticated shell (top bar + subheader + content) ----

let profileMenuDocHandler = null; // tracked so we can detach it before each re-render

function currentUser() {
  const t = localStorage.getItem('token') || '';
  if (t.startsWith('local:')) return t.slice(6);

  // Real logins store a raw Supabase JWT (header.payload.signature). Decode
  // the payload (no signature check needed — this is display-only) to pull
  // out the email claim Supabase puts there.
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.email || payload.user_metadata?.email || 'user';
  } catch (_) {
    return 'user';
  }
}

// Just the local part of the email (before "@"), for display where the full
// address would be more than needed (e.g. the profile dropdown).
function currentUserName() {
  return currentUser().split('@')[0];
}

// Same local-part-of-email convention, applied to whoever counted a cell
// (count.counted_by_email, resolved server-side from counts.counted_by —
// see list_cells in api/main.py) rather than the logged-in user.
function usernameFromEmail(email) {
  return email ? email.split('@')[0] : null;
}

function renderShell(screen) {
  const meta = SCREENS[screen] || {};
  app.innerHTML = `
    <div class="shell${screen === 'help' ? ' shell-sticky-header' : ''}">
      <div class="shell-header-group">
        ${topbarHTML()}
        ${subheaderHTML(screen, meta)}
      </div>
      <main class="content">${screenStub(screen, meta)}</main>
      ${bottomBarHTML(screen)}
    </div>
  `;
  wireShell(screen);
}

function topbarHTML() {
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="home-btn" id="home-btn" aria-label="Go to home" title="Home">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5"/>
            <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9"/>
          </svg>
        </button>
        <span class="topbar-title">${CONFIG.appTitle}</span>
        ${CONFIG.prototypeBadge ? '<span class="badge">Prototype</span>' : ''}
        ${isPreviewMode() ? '<span class="badge badge-preview">Preview mode &middot; read only</span>' : ''}
      </div>
      <div class="topbar-right">
        ${profileMenuHTML()}
      </div>
    </header>
  `;
}

// Just the account menu — reused by topbarHTML() for the full topbar and by
// the Home screen's corner-only chrome (see renderHome), which has no
// topbar bar at all but still needs sign-out to be reachable.
function profileMenuHTML() {
  return `
    <div class="profile-menu">
      <button type="button" class="profile-btn" id="profile-btn" aria-label="Account menu" aria-haspopup="true" aria-expanded="false" title="${escHtml(currentUser())}">
        <img class="profile-avatar" src="${avatarSrcById(currentAvatarId())}" alt="">
      </button>
      <div class="profile-dropdown" id="profile-dropdown">
        <div class="profile-dropdown-user">${escHtml(currentUserName())}</div>
        <button type="button" class="profile-dropdown-item" id="profile-settings">Settings</button>
        <button type="button" class="profile-dropdown-item" id="profile-logout">Log out</button>
      </div>
    </div>
  `;
}

function subheaderHTML(screen, meta) {
  return `
    <div class="subheader">
      <div class="subheader-left">
        ${meta.back ? '<button class="back-btn" id="back-btn" aria-label="Go back">←</button>' : ''}
        <nav class="breadcrumb">${breadcrumbHTML(screen)}</nav>
      </div>
      ${meta.action ? `<button class="primary-action" id="primary-action">${meta.action}</button>` : ''}
    </div>
  `;
}

// Full breadcrumb path leading to (and including) `screen`, as a list of
// {label, target} crumbs — every crumb but the last is rendered clickable.
// Reflects the project → experiment → condition hierarchy (Home / Projects /
// Project / Experiment / Condition) for folder screens; mirrors that same
// hierarchy for the Graph/Raw data detour (via state.returnScreen) and the
// Settings detour (via state.settingsReturnScreen) by recursing into
// whatever screen the detour was launched from, so the path — and the Back
// button, which targets that same stored screen — always agree. Falls back
// to a flat "Home / <title>" for screens with no recorded origin (About and
// Help are only ever reached from Home; Settings reached directly from Home
// behaves the same).
function hierarchyCrumbs(screen) {
  if (['experiments', 'conditions', 'cells'].includes(screen)) {
    const crumbs = [{ label: 'Home', target: 'home' }, { label: 'Projects', target: 'projects' }];
    if (state.project) crumbs.push({ label: state.project.name, target: 'experiments' });
    if (screen === 'conditions' || screen === 'cells') {
      crumbs.push({ label: state.experiment?.name || 'Experiment', target: 'conditions' });
    }
    if (screen === 'cells') {
      crumbs.push({ label: state.condition?.name || 'Condition', target: 'cells' });
    }
    return crumbs;
  }
  if (screen === 'graph' || screen === 'rawdata') {
    const crumbs = hierarchyCrumbs(state.returnScreen || 'experiments');
    crumbs.push({ label: SCREENS[screen]?.title || screen, target: screen });
    return crumbs;
  }
  if (screen === 'settings' && state.settingsReturnScreen && state.settingsReturnScreen !== 'home') {
    const crumbs = hierarchyCrumbs(state.settingsReturnScreen);
    crumbs.push({ label: 'Settings', target: 'settings' });
    return crumbs;
  }
  return [
    { label: 'Home', target: 'home' },
    { label: screen === 'projects' ? 'Projects' : (SCREENS[screen]?.title || screen), target: screen },
  ];
}

function breadcrumbHTML(screen) {
  return hierarchyCrumbs(screen)
    .map((c, i, crumbs) => {
      const last = i === crumbs.length - 1;
      return last
        ? `<span class="crumb crumb-current">${c.label}</span>`
        : `<button class="crumb" data-target="${c.target}">${c.label}</button>`;
    })
    .join('<span class="crumb-sep">/</span>');
}

// Bottom bar — Graph and Raw data are scoped to a project, so they live here
// instead of the main menu, and only show once a project is loaded
// (PROJECT_SCREENS: experiments/conditions/cells/graph/rawdata).
function bottomBarHTML(screen) {
  if (!PROJECT_SCREENS.includes(screen)) return '';
  return `
    <nav class="bottom-bar" aria-label="Data views">
      <button class="bottom-bar-btn${screen === 'graph' ? ' active' : ''}" data-screen="graph">Graph</button>
      <button class="bottom-bar-btn${screen === 'rawdata' ? ' active' : ''}" data-screen="rawdata">Raw data</button>
    </nav>
  `;
}

// Placeholder content — real screens land in their own phases
function screenStub(screen, meta) {
  const title = meta.title || screen;
  return `
    <div class="stub">
      <h2 class="stub-title">${title}</h2>
      <p class="stub-note">The ${title} screen is coming in a later phase.</p>
    </div>
  `;
}

// Account menu wiring, shared by the full shell (wireShell) and the
// standalone Projects screen (renderProjects) — both render the full
// topbarHTML(). The Home screen (renderHome) has no topbar at all, only
// the account menu, so it calls wireProfileMenu() directly instead.
function wireTopbarChrome() {
  const homeBtn = document.getElementById('home-btn');
  if (homeBtn) homeBtn.addEventListener('click', () => navigate('home'));

  wireProfileMenu();
}

// Wires the #profile-btn/#profile-dropdown/#profile-logout markup rendered
// by profileMenuHTML(). Split out from wireTopbarChrome() so the Home
// screen's corner-only account menu (no topbar at all) can wire itself
// without depending on the rest of wireTopbarChrome()'s elements.
function wireProfileMenu() {
  const profileBtn = document.getElementById('profile-btn');
  const profileDropdown = document.getElementById('profile-dropdown');
  const closeProfileMenu = () => {
    profileDropdown.classList.remove('open');
    profileBtn.setAttribute('aria-expanded', 'false');
  };
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = profileDropdown.classList.contains('open');
    closeProfileMenu();
    if (!wasOpen) {
      profileDropdown.classList.add('open');
      profileBtn.setAttribute('aria-expanded', 'true');
    }
  });

  // Outside-click closes the dropdown. The listener lives on document, so
  // detach the previous render's handler before attaching this one.
  if (profileMenuDocHandler) document.removeEventListener('click', profileMenuDocHandler);
  profileMenuDocHandler = closeProfileMenu;
  document.addEventListener('click', profileMenuDocHandler);

  document.getElementById('profile-settings').addEventListener('click', () => {
    closeProfileMenu();
    navigate('settings');
  });

  document.getElementById('profile-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('previewMode');
    state.project = null;
    navigate('login');
  });
}

function wireShell(screen) {
  wireTopbarChrome();

  document.querySelectorAll('.breadcrumb .crumb[data-target]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.target));
  });

  document.querySelectorAll('.bottom-bar-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
  });

  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (screen === 'graph' || screen === 'rawdata') {
        navigate(state.returnScreen || 'experiments');
        return;
      }
      if (screen === 'settings') {
        navigate(state.settingsReturnScreen || 'home');
        return;
      }
      if (screen === 'about' || screen === 'help') {
        navigate('home');
        return;
      }
      navigate(screen === 'cells' ? 'conditions' : screen === 'conditions' ? 'experiments' : 'projects');
    });
  }

}

// ---- Test data (used when logged in with a local: token) ----

const TEST_EXPERIMENTS = [
  {
    id: 'test-exp-001',
    name: 'Serum Starvation Timecourse',
    date: '2026-07-02',
    dye: 'BODIPY',
    notes: 'Investigating lipid droplet accumulation under serum starvation at 0, 6, and 24 hour timepoints.',
    condition_count: 3,
  },
  {
    id: 'test-exp-002',
    name: 'Oleic Acid Loading Panel',
    date: '2026-06-18',
    dye: 'Nile Red',
    notes: 'Comparing lipid droplet accumulation after oleic acid supplementation vs untreated controls.',
    condition_count: 2,
  },
];

// Projects are the new top-level container above experiments (shared with
// collaborators via an invite code — see docs/tasks.md Phase 14). The real
// backend/schema isn't implemented yet, so local test accounts wrap the
// existing TEST_EXPERIMENTS fixture as one project's experiment list; a
// second, empty project exercises the empty state. otherMembers exercises
// the Projects screen's member list (see initProjects) — always shown,
// alongside the current user, even when there are no collaborators.
const TEST_PROJECTS = [
  { id: 'test-project-001', name: 'Lipid Droplet Study', inviteCode: 'LDROP-4821', experiments: TEST_EXPERIMENTS, otherMembers: ['jsmith@stolaf.edu', 'rlopez@stolaf.edu'] },
  { id: 'test-project-002', name: 'Starvation Timecourse', inviteCode: 'STARV-1090', experiments: [], otherMembers: [] },
];

function currentProjectExperiments() {
  const project = TEST_PROJECTS.find(p => String(p.id) === String(state.project?.id));
  return project ? project.experiments : [];
}

const TEST_CONDITIONS = {
  'test-exp-001': [
    {
      id: 'test-cond-001',
      name: '0 Hr Starved',
      notes: 'Baseline, fed condition.',
      icc: 0.88,
      cells: [
        { id: 'test-cell-001', name: 'Cell 1', counts: [
          { id: 'test-cnt-001-auto1', value: 3, type: 'otsu_watershed', points: [{ x: 22, y: 30 }, { x: 58, y: 45 }, { x: 71, y: 68 }] },
          { id: 'test-cnt-001-auto2', value: 4, type: 'fm_edge_overlay', points: [{ x: 20, y: 28 }, { x: 40, y: 44 }, { x: 60, y: 46 }, { x: 72, y: 66 }] },
        ], source_filename: 'Image_43391.tif' },
        { id: 'test-cell-002', name: 'Cell 2', counts: [{ id: 'test-cnt-002-1', value: 4, type: 'hand', counted_by_email: 'test@example.com' }] },
        { id: 'test-cell-003', name: 'Cell 3', counts: [
          { id: 'test-cnt-003-1', value: 3, type: 'hand', counted_by_email: 'jsmith@stolaf.edu', points: [{ x: 16, y: 22 }, { x: 34, y: 51 }, { x: 69, y: 61 }] },
          { id: 'test-cnt-003-2', value: 2, type: 'hand', counted_by_email: 'rlopez@stolaf.edu', points: [{ x: 20, y: 25 }, { x: 53, y: 29 }] },
          { id: 'test-cnt-003-auto', value: 5, type: 'fm_edge_overlay', points: [{ x: 15, y: 20 }, { x: 33, y: 50 }, { x: 52, y: 28 }, { x: 68, y: 60 }, { x: 82, y: 40 }] },
        ], source_filename: 'Image_43391.tif' },
        { id: 'test-cell-011', name: 'Cell 4', counts: [
          { id: 'test-cnt-011-1', value: 3, type: 'hand', counted_by_email: 'test@example.com', points: [{ x: 25, y: 30 }, { x: 50, y: 45 }, { x: 70, y: 65 }] },
          { id: 'test-cnt-011-2', value: 4, type: 'hand', counted_by_email: 'jsmith@stolaf.edu', points: [{ x: 27, y: 33 }, { x: 48, y: 42 }, { x: 65, y: 60 }, { x: 80, y: 35 }] },
          { id: 'test-cnt-011-3', value: 3, type: 'hand', counted_by_email: 'rlopez@stolaf.edu', points: [{ x: 30, y: 28 }, { x: 52, y: 48 }, { x: 72, y: 62 }] },
        ] },
      ],
    },
    {
      id: 'test-cond-002',
      name: '6 Hr Starved',
      notes: '',
      icc: 0.93,
      cells: [
        { id: 'test-cell-004', name: 'Cell 1', counts: [{ id: 'test-cnt-004-1', value: 6, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-004-2', value: 6, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-004-3', value: 7, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-005', name: 'Cell 2', counts: [{ id: 'test-cnt-005-1', value: 7, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-005-2', value: 8, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-005-3', value: 7, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-006', name: 'Cell 3', counts: [{ id: 'test-cnt-006-1', value: 6, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-006-2', value: 6, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-006-3', value: 6, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-007', name: 'Cell 4', counts: [{ id: 'test-cnt-007-1', value: 7, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-007-2', value: 7, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-007-3', value: 7, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
      ],
    },
    {
      id: 'test-cond-003',
      name: '24 Hr Starved',
      notes: 'High variance between raters on Cell 2.',
      icc: 0.61,
      cells: [
        { id: 'test-cell-008', name: 'Cell 1', counts: [{ id: 'test-cnt-008-1', value: 9, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-008-2', value: 9, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-008-3', value: 10, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-009', name: 'Cell 2', counts: [{ id: 'test-cnt-009-1', value: 8, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-009-2', value: 14, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-009-3', value: 15, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-010', name: 'Cell 3', counts: [{ id: 'test-cnt-010-1', value: 7, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-010-2', value: 8, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }] },
      ],
    },
  ],
  'test-exp-002': [
    {
      id: 'test-cond-004',
      name: 'Untreated',
      notes: '',
      icc: 0.79,
      cells: [
        { id: 'test-cell-012', name: 'Cell 1', counts: [{ id: 'test-cnt-012-1', value: 5, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-012-2', value: 4, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }] },
        { id: 'test-cell-013', name: 'Cell 2', counts: [{ id: 'test-cnt-013-1', value: 6, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-013-2', value: 5, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-013-3', value: 6, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
      ],
    },
    {
      id: 'test-cond-005',
      name: 'Oleic Acid 24hr',
      notes: 'Robust droplet accumulation observed across all cells.',
      icc: 0.95,
      cells: [
        { id: 'test-cell-014', name: 'Cell 1', counts: [{ id: 'test-cnt-014-1', value: 18, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-014-2', value: 17, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }, { id: 'test-cnt-014-3', value: 19, type: 'hand', counted_by_email: 'rlopez@stolaf.edu' }] },
        { id: 'test-cell-015', name: 'Cell 2', counts: [{ id: 'test-cnt-015-1', value: 21, type: 'hand', counted_by_email: 'test@example.com' }, { id: 'test-cnt-015-2', value: 20, type: 'hand', counted_by_email: 'jsmith@stolaf.edu' }] },
      ],
    },
  ],
};

// ---- Card menu (three-dot edit/remove, shared by experiments/conditions/cells) ----

function cardMenuHTML(id, { showOpen = false } = {}) {
  const safeId = escHtml(String(id));
  return `
    <div class="card-menu">
      <button type="button" class="card-menu-btn" data-id="${safeId}" aria-label="More options" aria-haspopup="true" aria-expanded="false">&#8942;</button>
      <div class="card-menu-dropdown" data-id="${safeId}">
        ${showOpen ? '<button type="button" class="card-menu-item" data-action="open">Open</button>' : ''}
        <button type="button" class="card-menu-item" data-action="edit">Edit</button>
        <button type="button" class="card-menu-item card-menu-item-danger" data-action="remove">Remove</button>
      </div>
    </div>
  `;
}

function closeAllCardMenus(grid) {
  grid.querySelectorAll('.card-menu-dropdown.open').forEach(d => d.classList.remove('open'));
  grid.querySelectorAll('.card-menu-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

// Tracked so the previous screen's outside-click listener is detached before
// a new one is attached, mirroring the profileMenuDocHandler pattern above.
let cardMenuDocHandler = null;

function wireCardMenus(grid, { onOpen, onEdit, onRemove }) {
  if (cardMenuDocHandler) document.removeEventListener('click', cardMenuDocHandler);
  cardMenuDocHandler = () => closeAllCardMenus(grid);
  document.addEventListener('click', cardMenuDocHandler);

  grid.querySelectorAll('.card-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      const wasOpen = dropdown.classList.contains('open');
      closeAllCardMenus(grid);
      if (!wasOpen) {
        dropdown.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  grid.querySelectorAll('.card-menu-dropdown').forEach(dropdown => {
    const id = dropdown.dataset.id;
    dropdown.querySelector('[data-action="open"]')?.addEventListener('click', e => {
      e.stopPropagation();
      closeAllCardMenus(grid);
      onOpen(id);
    });
    dropdown.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      closeAllCardMenus(grid);
      onEdit(id);
    });
    dropdown.querySelector('[data-action="remove"]').addEventListener('click', e => {
      e.stopPropagation();
      closeAllCardMenus(grid);
      onRemove(id);
    });
  });
}

// Generic "are you sure?" modal, reused for every remove action.
function openConfirmModal({ title, message, confirmLabel = 'Remove', onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">${escHtml(title)}</div>
      <div class="modal-form">
        <p class="modal-confirm-message">${escHtml(message)}</p>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="button" class="modal-save modal-danger" id="modal-confirm">${escHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('modal-confirm');
    const errEl = document.getElementById('modal-error');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Removing…';
    errEl.textContent = '';

    try {
      await onConfirm();
      removeModal();
    } catch {
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmLabel;
      errEl.textContent = 'Could not remove. Check the API connection.';
    }
  });
}

// ---- Experiments screen ----

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ---- Home screen (landing) ----
// The true top-level landing screen: big centered app title over three
// big accent-colored boxes (Projects/Help/About) that fan out to the
// standalone Projects screen and the About/Help screens in the shell.
// Like Projects below, it does NOT go through renderShell/wireShell — no
// project is selected yet, so there's nothing for a Home button to scope
// to. Unlike every other screen it has no topbar at all (no topbarHTML()
// call) — just the account menu floating in the corner, via
// profileMenuHTML()/wireProfileMenu(), so sign-out and Settings stay
// reachable.
function renderHome() {
  app.innerHTML = `
    <div class="shell home-shell">
      <div class="home-profile-corner">${profileMenuHTML()}</div>
      <main class="content home-content">
        <div class="home-title-wrap">
          <h1 class="home-title">${escHtml(CONFIG.appTitle)}</h1>
        </div>
        <div class="home-boxes-wrap">
          <div class="home-boxes">
            <button type="button" class="home-box" id="home-box-projects">
              <span class="home-box-title">Projects</span>
              <span class="home-box-desc">Add/view cells, Graph data, Raw data</span>
            </button>
            <button type="button" class="home-box" id="home-box-help">
              <span class="home-box-title">Help</span>
              <span class="home-box-desc">Tutorial and Page explanations</span>
            </button>
            <button type="button" class="home-box" id="home-box-about">
              <span class="home-box-title">About</span>
              <span class="home-box-desc">Maintainers, Background, and History</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  `;
  wireProfileMenu();
  document.getElementById('home-box-projects').addEventListener('click', () => navigate('projects'));
  document.getElementById('home-box-help').addEventListener('click', () => navigate('help'));
  document.getElementById('home-box-about').addEventListener('click', () => navigate('about'));
}

// Placeholder shown in every folder-grid screen's detail panel before a card
// is selected — the panel itself (`.detail-panel.visible`) is always present
// so its position/size doesn't shift once a card populates it.
const DETAIL_PANEL_EMPTY_HTML = '<div class="detail-empty">Detail panel</div>';

// ---- Projects screen ----
// Mirrors initExperiments/renderExperimentsHTML/wireExperiments below —
// same .folder-layout two-column grid + detail panel, one level up the
// hierarchy. See docs/tasks.md Phase 14: the real GET /projects,
// POST /projects, and POST /projects/join endpoints are assumed, not yet
// implemented server-side.
//
// Unlike every other authenticated screen, Projects does NOT go through
// renderShell/wireShell — it's a standalone top-level screen (like Login or
// Add Photos), reusing .shell/.topbar/.subheader purely for visual
// consistency, alongside its own explicit Home breadcrumb/back arrow.
function renderProjects() {
  app.innerHTML = `
    <div class="shell">
      ${topbarHTML()}
      <div class="subheader">
        <div class="subheader-left">
          <button class="back-btn" id="back-btn" aria-label="Go back">←</button>
          <nav class="breadcrumb">
            <button class="crumb" data-target="home">Home</button><span class="crumb-sep">/</span><span class="crumb crumb-current">Projects</span>
          </nav>
        </div>
        <button class="primary-action" id="primary-action">Create/Join project</button>
      </div>
      <main class="content"></main>
    </div>
  `;
  wireTopbarChrome();
  document.getElementById('back-btn').addEventListener('click', () => navigate('home'));
  document.querySelector('.breadcrumb .crumb[data-target]').addEventListener('click', () => navigate('home'));
  initProjects();
}

async function initProjects() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading projects…</div>';

  let projects;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    projects = TEST_PROJECTS.map(p => ({
      id: p.id,
      name: p.name,
      invite_code: p.inviteCode,
      experiment_count: p.experiments.length,
      experiment_names: p.experiments.map(e => e.name),
      members: [currentUser(), ...(p.otherMembers || [])],
    }));
  }

  if (!projects) {
    try {
      projects = await api('/projects');
    } catch {
      content.innerHTML = '<div class="error-state">Could not load projects. The API may not be reachable yet.</div>';
      wireProjectsAction();
      return;
    }
  }

  content.innerHTML = renderProjectsHTML(projects);
  wireProjects(projects);
}

function renderProjectsHTML(projects) {
  const cards = projects.length === 0
    ? '<p class="empty-state">No projects yet. Click "Create/Join project" to get started.</p>'
    : projects.map(p => {
        const expCount = p.experiment_count ?? 0;
        const expLabel = `${expCount} experiment${expCount !== 1 ? 's' : ''}`;
        const color = getProjectColor(p.id);
        const cardStyle = color ? ` style="--project-color: ${color.value}"` : '';
        const swatchStyle = color ? ` style="--swatch-color: ${color.value}"` : '';
        return `
          <div class="folder-card folder-card--project" data-id="${escHtml(String(p.id))}" role="button" tabindex="0"${cardStyle}>
            <button type="button" class="project-color-btn" data-project-id="${escHtml(String(p.id))}" aria-label="Choose color for ${escHtml(p.name)}" aria-haspopup="true"${swatchStyle}></button>
            <div class="folder-name">${escHtml(p.name)}</div>
            <div class="folder-meta">
              <span class="folder-meta-item">${expLabel}</span>
              ${p.invite_code ? `<span class="folder-meta-item folder-meta-code">${escHtml(p.invite_code)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel detail-panel--half visible" id="detail-panel" aria-label="Project details">${DETAIL_PANEL_EMPTY_HTML}</aside>
    </div>
  `;
}

function wireProjects(projects) {
  const grid = document.getElementById('folder-grid');
  const panel = document.getElementById('detail-panel');

  function openProject(p) {
    navigate('experiments', { project: { id: p.id, name: p.name, inviteCode: p.invite_code } });
  }

  function selectProject(id) {
    const p = projects.find(pr => String(pr.id) === String(id));
    if (!p) return;

    grid.querySelectorAll('.folder-card').forEach(c => c.classList.remove('selected'));
    const card = grid.querySelector(`.folder-card[data-id="${CSS.escape(String(id))}"]`);
    if (card) card.classList.add('selected');

    const expCount = p.experiment_count ?? 0;
    const expNames = p.experiment_names || [];
    const members = p.members || [];
    panel.innerHTML = `
      <div class="detail-name">${escHtml(p.name)}</div>
      <div class="detail-row">
        <span class="detail-label">Invite code</span>
        <span class="detail-value detail-code">${escHtml(p.invite_code || '—')}${p.invite_code ? '<button class="detail-copy-btn" id="detail-copy" type="button">Copy</button>' : ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Experiments${expCount ? ` (${expCount})` : ''}</span>
        ${expNames.length
          ? `<ul class="detail-list">${expNames.map(n => `<li class="detail-list-item">${escHtml(n)}</li>`).join('')}</ul>`
          : '<span class="detail-value">None yet</span>'}
      </div>
      <div class="detail-row">
        <span class="detail-label">Members</span>
        ${members.length
          ? `<ul class="detail-list">${members.map(m => `<li class="detail-list-item">${escHtml(m)}</li>`).join('')}</ul>`
          : '<span class="detail-value">—</span>'}
      </div>
      <button class="detail-open-btn" id="detail-open">Open project</button>
    `;
    panel.classList.add('visible');

    const copyBtn = document.getElementById('detail-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(p.invite_code);
          copyBtn.textContent = 'Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        } catch {
          // Clipboard API unavailable (e.g. insecure context) — the invite
          // code is still visible in the panel to select and copy by hand.
        }
      });
    }

    document.getElementById('detail-open').addEventListener('click', () => openProject(p));
  }

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => selectProject(card.dataset.id));
    card.addEventListener('dblclick', () => {
      const p = projects.find(pr => String(pr.id) === card.dataset.id);
      if (p) openProject(p);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectProject(card.dataset.id);
    });
  });

  grid.querySelectorAll('.project-color-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = btn.closest('.folder-card');
      const wasOpen = !!card.querySelector('.color-picker-popover');
      grid.querySelectorAll('.color-picker-popover').forEach(el => el.remove());
      if (wasOpen) return;

      const projectId = btn.dataset.projectId;
      const current = getProjectColor(projectId);
      const popover = document.createElement('div');
      popover.className = 'color-picker-popover';
      popover.innerHTML = `
        <button type="button" class="color-swatch-btn color-swatch-btn--none${!current ? ' active' : ''}" data-color-id="" aria-label="No color" title="No color"></button>
        ${PROJECT_COLORS.map(c => `
          <button type="button" class="color-swatch-btn${current?.id === c.id ? ' active' : ''}" data-color-id="${c.id}" style="--swatch-color: ${c.value}" aria-label="${escHtml(c.label)}" title="${escHtml(c.label)}"></button>
        `).join('')}
      `;
      popover.addEventListener('click', e2 => e2.stopPropagation());
      popover.querySelectorAll('.color-swatch-btn').forEach(sw => {
        sw.addEventListener('click', () => {
          const colorId = sw.dataset.colorId || null;
          setProjectColor(projectId, colorId);
          const newColor = colorId ? PROJECT_COLORS.find(c => c.id === colorId) : null;
          card.style.setProperty('--project-color', newColor ? newColor.value : '');
          btn.style.setProperty('--swatch-color', newColor ? newColor.value : '');
          popover.remove();
        });
      });
      card.appendChild(popover);
    });
  });

  if (projects.length) selectProject(projects[0].id);

  wireProjectsAction();
}

// Dismiss an open project color-picker popover on any click outside it —
// wired once globally (not inside wireProjects, which reruns every time the
// Projects screen renders) since the popover it targets can outlive a single
// render pass.
document.addEventListener('click', e => {
  if (e.target.closest('.project-color-btn, .color-picker-popover')) return;
  document.querySelectorAll('.color-picker-popover').forEach(el => el.remove());
});

function wireProjectsAction() {
  const actionBtn = document.getElementById('primary-action');
  if (actionBtn) {
    actionBtn.onclick = () => openCreateJoinProjectModal(() => initProjects());
  }
}

function openCreateJoinProjectModal(onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">Create/Join project</div>
      <div class="modal-tabs" role="tablist">
        <button type="button" class="modal-tab active" id="tab-create" data-tab="create" role="tab" aria-selected="true">Create new</button>
        <button type="button" class="modal-tab" id="tab-join" data-tab="join" role="tab" aria-selected="false">Join existing</button>
      </div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field" id="field-create">
          <label for="modal-project-name">Project name</label>
          <input id="modal-project-name" type="text" required autocomplete="off" placeholder="e.g. Lipid Droplet Study">
        </div>
        <div class="modal-field" id="field-join" hidden>
          <label for="modal-invite-code">Invite code</label>
          <input id="modal-invite-code" type="text" autocomplete="off" placeholder="e.g. LDROP-4821">
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Create project</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  let activeTab = 'create';
  const tabCreate = document.getElementById('tab-create');
  const tabJoin = document.getElementById('tab-join');
  const fieldCreate = document.getElementById('field-create');
  const fieldJoin = document.getElementById('field-join');
  const nameInput = document.getElementById('modal-project-name');
  const codeInput = document.getElementById('modal-invite-code');
  const saveBtn = document.getElementById('modal-save');
  const errEl = document.getElementById('modal-error');

  function setTab(tab) {
    activeTab = tab;
    tabCreate.classList.toggle('active', tab === 'create');
    tabJoin.classList.toggle('active', tab === 'join');
    tabCreate.setAttribute('aria-selected', String(tab === 'create'));
    tabJoin.setAttribute('aria-selected', String(tab === 'join'));
    fieldCreate.hidden = tab !== 'create';
    fieldJoin.hidden = tab !== 'join';
    nameInput.required = tab === 'create';
    codeInput.required = tab === 'join';
    saveBtn.textContent = tab === 'create' ? 'Create project' : 'Join project';
    errEl.textContent = '';
  }

  tabCreate.addEventListener('click', () => setTab('create'));
  tabJoin.addEventListener('click', () => setTab('join'));

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = activeTab === 'create' ? 'Creating…' : 'Joining…';
    errEl.textContent = '';

    try {
      if (activeTab === 'create') {
        await api('/projects', {
          method: 'POST',
          body: JSON.stringify({ name: nameInput.value }),
        });
      } else {
        await api('/projects/join', {
          method: 'POST',
          body: JSON.stringify({ invite_code: codeInput.value }),
        });
      }
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = activeTab === 'create' ? 'Create project' : 'Join project';
      errEl.textContent = activeTab === 'create'
        ? 'Could not create project. Check the API connection.'
        : 'Could not join project. Check the invite code and API connection.';
    }
  });

  nameInput.focus();
}

async function initExperiments() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading experiments…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = currentProjectExperiments();
  }

  if (!experiments) {
    try {
      experiments = await api(`/projects/${state.project.id}/experiments`);
    } catch {
      content.innerHTML = '<div class="error-state">Could not load experiments. The API may not be reachable yet.</div>';
      wireExperimentsAction();
      return;
    }
  }

  content.innerHTML = renderExperimentsHTML(experiments);
  wireExperiments(experiments);
}

function renderExperimentsHTML(experiments) {
  const cards = experiments.length === 0
    ? '<p class="empty-state">No experiments yet. Click "Add experiment" to create one.</p>'
    : experiments.map(exp => {
        return `
          <div class="folder-card" data-id="${escHtml(String(exp.id))}" role="button" tabindex="0">
            ${cardMenuHTML(exp.id, { showOpen: true })}
            <div class="folder-name">${escHtml(exp.name)}</div>
            ${exp.date ? `
              <div class="folder-meta">
                <span class="folder-meta-item">${formatDate(exp.date)}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel detail-panel--medium visible" id="detail-panel" aria-label="Experiment details">${DETAIL_PANEL_EMPTY_HTML}</aside>
    </div>
  `;
}

function wireExperiments(experiments) {
  const grid = document.getElementById('folder-grid');
  const panel = document.getElementById('detail-panel');

  function selectExperiment(id) {
    const exp = experiments.find(e => String(e.id) === String(id));
    if (!exp) return;

    grid.querySelectorAll('.folder-card').forEach(c => c.classList.remove('selected'));
    const card = grid.querySelector(`.folder-card[data-id="${CSS.escape(String(id))}"]`);
    if (card) card.classList.add('selected');

    const condCount = exp.condition_count ?? 0;
    panel.innerHTML = `
      <div class="detail-name">${escHtml(exp.name)}</div>
      <div class="detail-row">
        <span class="detail-label">Date</span>
        <span class="detail-value">${exp.date ? formatDate(exp.date) : '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Dye</span>
        <span class="detail-value">${exp.dye ? escHtml(exp.dye) : '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Conditions</span>
        <span class="detail-value">${condCount}</span>
      </div>
      ${exp.notes ? `
        <div class="detail-row">
          <span class="detail-label">Notes</span>
          <span class="detail-notes">${escHtml(exp.notes)}</span>
        </div>
      ` : ''}
      <button class="detail-open-btn" id="detail-open">Open experiment</button>
    `;
    panel.classList.add('visible');

    document.getElementById('detail-open').addEventListener('click', () => {
      navigate('conditions', { experiment: { id: exp.id, name: exp.name, dye: exp.dye } });
    });
  }

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => selectExperiment(card.dataset.id));
    card.addEventListener('dblclick', () => {
      const exp = experiments.find(e => String(e.id) === card.dataset.id);
      if (exp) navigate('conditions', { experiment: { id: exp.id, name: exp.name, dye: exp.dye } });
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectExperiment(card.dataset.id);
    });
  });

  if (experiments.length) selectExperiment(experiments[0].id);

  wireCardMenus(grid, {
    onOpen: id => {
      const exp = experiments.find(e => String(e.id) === String(id));
      if (exp) navigate('conditions', { experiment: { id: exp.id, name: exp.name, dye: exp.dye } });
    },
    onEdit: id => {
      const exp = experiments.find(e => String(e.id) === String(id));
      if (exp) openEditExperimentModal(exp, () => initExperiments());
    },
    onRemove: id => {
      const exp = experiments.find(e => String(e.id) === String(id));
      if (!exp) return;
      openConfirmModal({
        title: 'Remove experiment',
        message: `Delete "${exp.name}" and all of its conditions, cells, and counts? This cannot be undone.`,
        onConfirm: () => deleteExperiment(exp.id),
      });
    },
  });

  wireExperimentsAction();
}

async function deleteExperiment(id) {
  if (localStorage.getItem('token')?.startsWith('local:')) {
    const experiments = currentProjectExperiments();
    const idx = experiments.findIndex(e => String(e.id) === String(id));
    if (idx !== -1) experiments.splice(idx, 1);
    delete TEST_CONDITIONS[id];
  } else {
    await api(`/experiments/${id}`, { method: 'DELETE' });
  }
  initExperiments();
}

function wireExperimentsAction() {
  const actionBtn = document.getElementById('primary-action');
  if (actionBtn) {
    actionBtn.onclick = () => openAddExperimentModal(() => initExperiments());
  }
}

function openAddExperimentModal(onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">Add experiment</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off" placeholder="e.g. Serum Starvation Timecourse">
        </div>
        <div class="modal-field">
          <label for="modal-date">Date</label>
          <input id="modal-date" type="date" required>
        </div>
        <div class="modal-field">
          <label for="modal-dye">Dye</label>
          <input id="modal-dye" type="text" autocomplete="off" placeholder="e.g. BODIPY">
        </div>
        <div class="modal-field">
          <label for="modal-notes">Notes</label>
          <textarea id="modal-notes" rows="3"></textarea>
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();

  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    const errEl = document.getElementById('modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    errEl.textContent = '';

    try {
      await api(`/projects/${state.project.id}/experiments`, {
        method: 'POST',
        body: JSON.stringify({
          name:  document.getElementById('modal-name').value,
          date:  document.getElementById('modal-date').value,
          dye:   document.getElementById('modal-dye').value,
          notes: document.getElementById('modal-notes').value,
        }),
      });
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      errEl.textContent = 'Could not save. Check the API connection.';
    }
  });

  document.getElementById('modal-name').focus();
}

function openEditExperimentModal(exp, onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">Edit experiment</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off" value="${escHtml(exp.name || '')}">
        </div>
        <div class="modal-field">
          <label for="modal-date">Date</label>
          <input id="modal-date" type="date" required value="${escHtml(exp.date || '')}">
        </div>
        <div class="modal-field">
          <label for="modal-dye">Dye</label>
          <input id="modal-dye" type="text" autocomplete="off" placeholder="e.g. BODIPY" value="${escHtml(exp.dye || '')}">
        </div>
        <div class="modal-field">
          <label for="modal-notes">Notes</label>
          <textarea id="modal-notes" rows="3">${escHtml(exp.notes || '')}</textarea>
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();

  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    const errEl = document.getElementById('modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    errEl.textContent = '';

    const updated = {
      name:  document.getElementById('modal-name').value,
      date:  document.getElementById('modal-date').value,
      dye:   document.getElementById('modal-dye').value,
      notes: document.getElementById('modal-notes').value,
    };

    try {
      if (localStorage.getItem('token')?.startsWith('local:')) {
        Object.assign(exp, updated);
      } else {
        await api(`/experiments/${exp.id}`, { method: 'PUT', body: JSON.stringify(updated) });
      }
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      errEl.textContent = 'Could not save. Check the API connection.';
    }
  });

  document.getElementById('modal-name').focus();
}

// ---- Conditions screen ----

// ICC quality label per Koo & Li (2016) buckets
function iccQualityLabel(icc) {
  if (icc == null) return { label: '—', tier: 'none' };
  if (icc < 0.5) return { label: 'Poor', tier: 'poor' };
  if (icc < 0.75) return { label: 'Moderate', tier: 'moderate' };
  if (icc < 0.9) return { label: 'Good', tier: 'good' };
  return { label: 'Excellent', tier: 'excellent' };
}

// counts.type is 'hand' for a manual count, or a detection algorithm slug
// ('otsu_watershed'/'fm_edge_overlay' — see AUTO_ALGORITHMS) for a
// machine-generated one. A cell can hold up to one row per algorithm (so up
// to two auto rows total), written on demand from the Cells screen's Auto
// count section (PUT /cells/{id}/auto-count) rather than at upload time.
function handCounts(cell) {
  return (cell.counts || []).filter(c => c.type === 'hand');
}

function autoCountForAlgorithm(cell, algorithm) {
  return (cell.counts || []).find(c => c.type === algorithm) || null;
}

// Every auto-count row a cell currently has, in AUTO_ALGORITHMS order.
function cellAutoCounts(cell) {
  return AUTO_ALGORITHMS.map(algo => autoCountForAlgorithm(cell, algo)).filter(Boolean);
}

// cell.average is derived from hand counts, never stored (per data model)
function cellAverage(cell) {
  const counts = handCounts(cell);
  if (!counts.length) return null;
  return counts.reduce((sum, c) => sum + c.value, 0) / counts.length;
}

// Graph screen defaults to plotting the machine-suggested auto count per
// cell — averaged across whichever algorithm(s) have been run, see
// cellAutoCounts — but lets the user switch to hand-count or combined via
// the metric selector — see cellValueForMetric/conditionMeanForMetric below.
function cellAutoCount(cell) {
  const rows = cellAutoCounts(cell);
  if (!rows.length) return null;
  return rows.reduce((sum, r) => sum + r.value, 0) / rows.length;
}

// Display labels for an auto count's counts.type, matching the Cells
// screen's Auto count run-button text so a cell's detail panel reads the
// same name the researcher picked when they ran it.
const AUTO_ALGORITHM_LABELS = {
  otsu_watershed: 'Standard',
  fm_edge_overlay: 'FM_edge_overlay (ALDQ)',
};

const AUTO_ALGORITHMS = Object.keys(AUTO_ALGORITHM_LABELS);

function autoAlgorithmLabel(algorithm) {
  return AUTO_ALGORITHM_LABELS[algorithm] || algorithm;
}

function truncateLabel(str, max = 10) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function initConditions() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading conditions…</div>';

  let conditions;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    conditions = TEST_CONDITIONS[state.experiment?.id] || [];
  }

  if (!conditions) {
    try {
      conditions = await api(`/experiments/${state.experiment.id}/conditions`);
    } catch {
      content.innerHTML = '<div class="error-state">Could not load conditions. The API may not be reachable yet.</div>';
      wireConditionsAction();
      return;
    }
  }

  content.innerHTML = renderConditionsHTML(conditions);
  wireConditions(conditions);
}

function renderConditionsHTML(conditions) {
  const cards = conditions.length === 0
    ? '<p class="empty-state">No conditions yet. Click "New Condition" to create one.</p>'
    : conditions.map(cond => {
        return `
          <div class="folder-card" data-id="${escHtml(String(cond.id))}" role="button" tabindex="0">
            ${cardMenuHTML(cond.id, { showOpen: true })}
            <div class="folder-name">${escHtml(cond.name)}</div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel detail-panel--medium visible" id="detail-panel" aria-label="Condition details">${DETAIL_PANEL_EMPTY_HTML}</aside>
    </div>
  `;
}

function wireConditions(conditions) {
  const grid = document.getElementById('folder-grid');
  const panel = document.getElementById('detail-panel');

  function selectCondition(id) {
    const cond = conditions.find(c => String(c.id) === String(id));
    if (!cond) return;

    grid.querySelectorAll('.folder-card').forEach(c => c.classList.remove('selected'));
    const card = grid.querySelector(`.folder-card[data-id="${CSS.escape(String(id))}"]`);
    if (card) card.classList.add('selected');

    const cellCount = (cond.cells || []).length;
    const { label, tier } = iccQualityLabel(cond.icc);

    panel.innerHTML = `
      <div class="detail-name">${escHtml(cond.name)}</div>
      <div class="detail-row">
        <span class="detail-label">Dye</span>
        <span class="detail-value">${state.experiment?.dye ? escHtml(state.experiment.dye) : '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Cells</span>
        <span class="detail-value">${cellCount}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ICC</span>
        <span class="detail-value">${cond.icc != null ? cond.icc.toFixed(2) : '—'}<span class="icc-pill icc-pill-${tier}">${label}</span></span>
      </div>
      ${cond.notes ? `
        <div class="detail-row">
          <span class="detail-label">Notes</span>
          <span class="detail-notes">${escHtml(cond.notes)}</span>
        </div>
      ` : ''}
      <button class="detail-open-btn" id="detail-open">Open condition</button>
    `;
    panel.classList.add('visible');

    document.getElementById('detail-open').addEventListener('click', () => {
      navigate('cells', { condition: { id: cond.id, name: cond.name } });
    });
  }

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => selectCondition(card.dataset.id));
    card.addEventListener('dblclick', () => {
      const cond = conditions.find(c => String(c.id) === card.dataset.id);
      if (cond) navigate('cells', { condition: { id: cond.id, name: cond.name } });
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectCondition(card.dataset.id);
    });
  });

  if (conditions.length) selectCondition(conditions[0].id);

  wireCardMenus(grid, {
    onOpen: id => {
      const cond = conditions.find(c => String(c.id) === String(id));
      if (cond) navigate('cells', { condition: { id: cond.id, name: cond.name } });
    },
    onEdit: id => {
      const cond = conditions.find(c => String(c.id) === String(id));
      if (cond) openEditConditionModal(cond, () => initConditions());
    },
    onRemove: id => {
      const cond = conditions.find(c => String(c.id) === String(id));
      if (!cond) return;
      openConfirmModal({
        title: 'Remove condition',
        message: `Delete "${cond.name}" and all of its cells and counts? This cannot be undone.`,
        onConfirm: () => deleteCondition(cond.id),
      });
    },
  });

  wireConditionsAction();
}

async function deleteCondition(id) {
  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const idx = conditions.findIndex(c => String(c.id) === String(id));
    if (idx !== -1) conditions.splice(idx, 1);
  } else {
    await api(`/conditions/${id}`, { method: 'DELETE' });
  }
  initConditions();
}

function wireConditionsAction() {
  const actionBtn = document.getElementById('primary-action');
  if (actionBtn) {
    actionBtn.onclick = () => openAddConditionModal(() => initConditions());
  }
}

function openAddConditionModal(onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">New Condition</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off" placeholder="e.g. 6 hours starved">
        </div>
        <div class="modal-field">
          <label for="modal-notes">Notes</label>
          <textarea id="modal-notes" rows="3"></textarea>
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();

  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    const errEl = document.getElementById('modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    errEl.textContent = '';

    try {
      await api(`/experiments/${state.experiment.id}/conditions`, {
        method: 'POST',
        body: JSON.stringify({
          name:  document.getElementById('modal-name').value,
          notes: document.getElementById('modal-notes').value,
        }),
      });
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      errEl.textContent = 'Could not save. Check the API connection.';
    }
  });

  document.getElementById('modal-name').focus();
}

function openEditConditionModal(cond, onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">Edit condition</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off" value="${escHtml(cond.name || '')}">
          <span class="modal-field-hint">e.g. 6 hours starved</span>
        </div>
        <div class="modal-field">
          <label for="modal-notes">Notes</label>
          <textarea id="modal-notes" rows="3">${escHtml(cond.notes || '')}</textarea>
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();

  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    const errEl = document.getElementById('modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    errEl.textContent = '';

    const updated = {
      name:  document.getElementById('modal-name').value,
      notes: document.getElementById('modal-notes').value,
    };

    try {
      if (localStorage.getItem('token')?.startsWith('local:')) {
        Object.assign(cond, updated);
      } else {
        await api(`/conditions/${cond.id}`, { method: 'PUT', body: JSON.stringify(updated) });
      }
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      errEl.textContent = 'Could not save. Check the API connection.';
    }
  });

  document.getElementById('modal-name').focus();
}

// ---- Cells screen ----

// Extracts every digit run from a cell name (e.g. "Cell12_3" -> [12, 3], the
// from-tif file number and next_number) and compares them left-to-right, so
// cells sort by those embedded numbers instead of lexicographically
// ("Cell10" would otherwise sort before "Cell2").
function cellNameSortKey(name) {
  return (String(name || '').match(/\d+/g) || []).map(Number);
}

function compareCellNames(a, b) {
  const ak = cellNameSortKey(a);
  const bk = cellNameSortKey(b);
  const len = Math.max(ak.length, bk.length);
  for (let i = 0; i < len; i++) {
    if (ak[i] === bk[i]) continue;
    if (ak[i] === undefined) return -1;
    if (bk[i] === undefined) return 1;
    return ak[i] - bk[i];
  }
  return 0;
}

function cellCountStatus(cell) {
  const n = handCounts(cell).length;
  return n === 0 ? 'needs count' : `${n} count${n !== 1 ? 's' : ''}`;
}

// Simple seeded PRNG (Park-Miller) so a cell's placeholder thumbnail is
// stable across re-renders instead of reshuffling every time.
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash) || 1;
}

// Real microscopy image rendering is Phase 11 (Render/Python pipeline).
// Until image_url is populated, cards show a deterministic simulated
// fluorescence thumbnail: green droplets on a dark background.
function renderCellThumbnailSVG(cell) {
  const width = 160, height = 100;
  const rand = seededRandom(hashStringToInt(String(cell.id)));
  const dropletCount = 6 + Math.floor(rand() * 8);
  const droplets = Array.from({ length: dropletCount }).map(() => {
    const cx = (4 + rand() * (width - 8)).toFixed(1);
    const cy = (4 + rand() * (height - 8)).toFixed(1);
    const r = (1.5 + rand() * 2.5).toFixed(1);
    const opacity = (0.5 + rand() * 0.5).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" class="cell-thumb-droplet" opacity="${opacity}" />`;
  }).join('');

  return `
    <svg class="cell-thumb-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Simulated fluorescence thumbnail">
      <rect class="cell-thumb-bg" width="${width}" height="${height}" />
      ${droplets}
    </svg>
  `;
}

async function initCells() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading cells…</div>';

  let cells;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const cond = conditions.find(c => String(c.id) === String(state.condition?.id));
    cells = cond?.cells || [];
  }

  if (!cells) {
    try {
      cells = await api(`/conditions/${state.condition.id}/cells`);
    } catch {
      content.innerHTML = '<div class="error-state">Could not load cells. The API may not be reachable yet.</div>';
      wireCellsAction();
      return;
    }
  }

  cells = cells.slice().sort((a, b) => compareCellNames(a.name, b.name));

  content.innerHTML = renderCellsHTML(cells);
  wireCells(cells);
}

function renderCellsHTML(cells) {
  const cards = cells.length === 0
    ? '<p class="empty-state">No cells yet. Click "Add photos" to box some cells.</p>'
    : cells.map(cell => {
        const tier = handCounts(cell).length === 0 ? 'needs' : 'counted';
        return `
          <div class="folder-card folder-card--compact" data-id="${escHtml(String(cell.id))}" role="button" tabindex="0">
            ${cardMenuHTML(cell.id)}
            <div class="folder-name">${escHtml(cell.name)}</div>
            <div class="folder-meta">
              <span class="status-tag status-tag-${tier}">${cellCountStatus(cell)}</span>
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid folder-grid--compact" id="folder-grid">${cards}</div>
      <aside class="detail-panel detail-panel--large visible" id="detail-panel" aria-label="Cell details">${DETAIL_PANEL_EMPTY_HTML}</aside>
    </div>
  `;
}

function wireCells(cells) {
  const grid = document.getElementById('folder-grid');
  const panel = document.getElementById('detail-panel');

  function renderDetail(cell) {
    const avg = cellAverage(cell);
    const counts = handCounts(cell);
    const needsMore = counts.length < 3;
    const doneAlgorithms = AUTO_ALGORITHMS.filter(algo => autoCountForAlgorithm(cell, algo));
    const pendingAlgorithms = AUTO_ALGORITHMS.filter(algo => !autoCountForAlgorithm(cell, algo));

    const preview = cell.image_url
      ? `<img class="detail-thumb-img" src="${escHtml(cell.image_url)}" alt="Low-res preview of ${escHtml(cell.name)}">`
      : renderCellThumbnailSVG(cell);

    panel.innerHTML = `
      <div class="detail-name">${escHtml(cell.name)}</div>
      <div class="detail-thumbnail">${preview}</div>
      <div class="detail-row-split">
        ${cell.source_filename ? `
          <div class="detail-row">
            <span class="detail-label">Source file</span>
            <span class="detail-value">${escHtml(cell.source_filename)}</span>
          </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Average hand count</span>
          <span class="detail-average">${avg != null ? avg.toFixed(1) : '—'}</span>
        </div>
      </div>
      <div class="detail-row">
        <span class="detail-label">Auto count</span>
        ${doneAlgorithms.map(algo => {
          const row = autoCountForAlgorithm(cell, algo);
          return `
            <ul class="count-list">
              <li class="count-list-item">
                <span class="count-meta">
                  <span class="count-value">${row.value}</span>
                  <span class="count-rater">${escHtml(autoAlgorithmLabel(algo))}</span>
                </span>
                <span class="count-actions">
                  <button class="count-edit-btn auto-count-view-btn" data-algorithm="${algo}" aria-label="View ${escHtml(autoAlgorithmLabel(algo))} auto count grid">View</button>
                  <button class="count-delete-btn" data-count-id="${escHtml(String(row.id))}" aria-label="Delete ${escHtml(autoAlgorithmLabel(algo))} auto count">&times;</button>
                </span>
              </li>
            </ul>
          `;
        }).join('')}
        ${pendingAlgorithms.length ? `
          <div class="auto-count-run">
            ${pendingAlgorithms.map(algo => `<button class="auto-count-run-btn" data-algorithm="${algo}">${escHtml(autoAlgorithmLabel(algo))}</button>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="detail-row">
        <span class="detail-label">Hand counts</span>
        ${counts.length === 0
          ? '<span class="detail-value">No counts yet.</span>'
          : `<ul class="count-list">${counts.map(c => `
              <li class="count-list-item">
                <span class="count-meta">
                  <span class="count-value">${c.value}</span>
                  ${usernameFromEmail(c.counted_by_email) ? `<span class="count-rater">${escHtml(usernameFromEmail(c.counted_by_email))}</span>` : ''}
                </span>
                <span class="count-actions">
                  <button class="count-edit-btn" data-count-id="${escHtml(String(c.id))}" aria-label="Edit count">Edit</button>
                  <button class="count-delete-btn" data-count-id="${escHtml(String(c.id))}" aria-label="Delete count">&times;</button>
                </span>
              </li>
            `).join('')}</ul>`}
      </div>
      ${needsMore ? '<button class="count-cta-btn" id="count-cta">Add Hand Count</button>' : ''}
      ${(counts.length > 0 || doneAlgorithms.length > 0) ? '<button class="count-viewall-btn" id="counts-viewall-btn">Compare all counts</button>' : ''}
    `;
    panel.classList.add('visible');

    panel.querySelectorAll('.count-delete-btn').forEach(btn => {
      const countId = btn.dataset.countId;
      btn.addEventListener('click', () => {
        const li = btn.closest('.count-list-item');
        li.innerHTML = `
          <span class="count-confirm-label">Delete this count?</span>
          <span class="count-confirm-actions">
            <button class="count-cancel-btn">Cancel</button>
            <button class="count-confirm-btn">Delete</button>
          </span>
        `;
        li.querySelector('.count-confirm-btn').addEventListener('click', () => deleteCount(cell, countId));
        li.querySelector('.count-cancel-btn').addEventListener('click', () => renderDetail(cell));
      });
    });

    panel.querySelectorAll('.count-edit-btn[data-count-id]').forEach(btn => {
      const countId = btn.dataset.countId;
      btn.addEventListener('click', () => {
        const count = counts.find(c => String(c.id) === String(countId));
        if (!count) return;
        navigate('count', {
          cell: { id: cell.id, name: cell.name, image_url: cell.image_url },
          editingCount: { id: count.id, points: count.points || [] },
        });
      });
    });

    panel.querySelectorAll('.auto-count-run-btn').forEach(btn => {
      btn.addEventListener('click', () => runAutoCount(cell, btn.dataset.algorithm));
    });

    panel.querySelectorAll('.auto-count-view-btn').forEach(btn => {
      const algo = btn.dataset.algorithm;
      btn.addEventListener('click', () => {
        const row = autoCountForAlgorithm(cell, algo);
        navigate('count', {
          cell: { id: cell.id, name: cell.name, image_url: cell.image_url },
          viewingAutoPoints: (row && row.points) || [],
        });
      });
    });

    const viewAllBtn = document.getElementById('counts-viewall-btn');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        navigate('count', {
          cell: { id: cell.id, name: cell.name, image_url: cell.image_url },
          viewingAllCounts: {
            counts,
            autoResults: cellAutoCounts(cell).map(r => ({ algorithm: r.type, points: r.points || [] })),
          },
        });
      });
    }

    const ctaBtn = document.getElementById('count-cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => {
        navigate('count', { cell: { id: cell.id, name: cell.name, image_url: cell.image_url } });
      });
    }
  }

  function updateCardStatus(cell) {
    const card = grid.querySelector(`.folder-card[data-id="${CSS.escape(String(cell.id))}"]`);
    if (!card) return;
    const tag = card.querySelector('.status-tag');
    const tier = handCounts(cell).length === 0 ? 'needs' : 'counted';
    tag.className = `status-tag status-tag-${tier}`;
    tag.textContent = cellCountStatus(cell);
  }

  async function runAutoCount(cell, algorithm) {
    const container = panel.querySelector('.auto-count-run');
    if (!container) return;
    const buttons = container.querySelectorAll('.auto-count-run-btn');
    const clickedBtn = container.querySelector(`[data-algorithm="${algorithm}"]`);
    const originalLabel = clickedBtn.textContent;
    buttons.forEach(b => { b.disabled = true; });
    clickedBtn.textContent = 'Running…';

    try {
      let newRow;
      if (localStorage.getItem('token')?.startsWith('local:')) {
        // No local Python pipeline to call — fabricate a plausible result
        // the same way the placeholder thumbnail fabricates droplets.
        const rand = seededRandom(hashStringToInt(String(cell.id) + algorithm));
        const count = 3 + Math.floor(rand() * 6);
        const points = Array.from({ length: count }).map(() => ({
          x: Math.round(rand() * 90 + 5),
          y: Math.round(rand() * 90 + 5),
        }));
        newRow = { id: genLocalId('cnt'), value: count, points, type: algorithm };
      } else {
        newRow = await api(`/cells/${cell.id}/auto-count`, {
          method: 'PUT',
          body: JSON.stringify({ algorithm }),
        });
      }
      // Replace any existing row of this algorithm's type — running the
      // other model must not clobber it, so a cell can carry up to one row
      // per entry in AUTO_ALGORITHMS (i.e. up to two auto rows) at once.
      cell.counts = [...(cell.counts || []).filter(c => c.type !== algorithm), newRow];
      renderDetail(cell);
    } catch (err) {
      console.error('auto-count failed:', err);
      clickedBtn.textContent = originalLabel;
      buttons.forEach(b => { b.disabled = false; });
    }
  }

  async function deleteCount(cell, countId) {
    if (localStorage.getItem('token')?.startsWith('local:')) {
      cell.counts = (cell.counts || []).filter(c => String(c.id) !== String(countId));
    } else {
      try {
        await api(`/counts/${countId}`, { method: 'DELETE' });
      } catch {
        return;
      }
      cell.counts = (cell.counts || []).filter(c => String(c.id) !== String(countId));
    }
    renderDetail(cell);
    updateCardStatus(cell);
  }

  function selectCell(id) {
    const cell = cells.find(c => String(c.id) === String(id));
    if (!cell) return;

    grid.querySelectorAll('.folder-card').forEach(c => c.classList.remove('selected'));
    const card = grid.querySelector(`.folder-card[data-id="${CSS.escape(String(id))}"]`);
    if (card) card.classList.add('selected');

    renderDetail(cell);
  }

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => selectCell(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectCell(card.dataset.id);
    });
  });

  wireCardMenus(grid, {
    onEdit: id => {
      const cell = cells.find(c => String(c.id) === String(id));
      if (cell) openEditCellModal(cell, () => initCells());
    },
    onRemove: id => {
      const cell = cells.find(c => String(c.id) === String(id));
      if (!cell) return;
      openConfirmModal({
        title: 'Remove cell',
        message: `Delete "${cell.name}" and all of its hand counts? This cannot be undone.`,
        onConfirm: () => deleteCell(cell.id),
      });
    },
  });

  wireCellsAction();

  if (cells.length > 0) selectCell(cells[0].id);
}

async function deleteCell(id) {
  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const cond = conditions.find(c => String(c.id) === String(state.condition?.id));
    if (cond) {
      const idx = (cond.cells || []).findIndex(c => String(c.id) === String(id));
      if (idx !== -1) cond.cells.splice(idx, 1);
    }
  } else {
    await api(`/cells/${id}`, { method: 'DELETE' });
  }
  initCells();
}

function openEditCellModal(cell, onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">Edit cell</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off" value="${escHtml(cell.name || '')}">
        </div>
        <div class="modal-error" id="modal-error"></div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel" id="modal-cancel">Cancel</button>
          <button type="submit" class="modal-save" id="modal-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const removeModal = () => backdrop.remove();

  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeModal(); });
  document.getElementById('modal-cancel').addEventListener('click', removeModal);

  document.getElementById('modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    const errEl = document.getElementById('modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    errEl.textContent = '';

    const name = document.getElementById('modal-name').value;

    try {
      if (localStorage.getItem('token')?.startsWith('local:')) {
        cell.name = name;
      } else {
        await api(`/cells/${cell.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      }
      removeModal();
      onSuccess();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      errEl.textContent = 'Could not save. Check the API connection.';
    }
  });

  document.getElementById('modal-name').focus();
}

function wireCellsAction() {
  const actionBtn = document.getElementById('primary-action');
  if (actionBtn) {
    actionBtn.onclick = () => navigate('addphotos');
  }
}

// ---- Add Photos screen ----
// Full-screen annotation tool; bypasses the standard shell like Login does
// (see navigate()). Screen-local state, reset every time the screen mounts.

function genLocalId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// Multipart uploads (raw .tif files) can't go through api() — it always
// JSON-encodes the body — so this attaches the same Bearer token manually.
async function apiUpload(path, formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${RENDER_API_URL}${path}`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Real preview rendering (contrast-normalized, LUT-applied PNG) is Phase 11's
// job on Render. Until that endpoint exists, local test accounts get a
// deterministic simulated fluorescence frame, seeded by filename, so the
// box-drawing UX is fully exercisable without it.
function renderPhotoPreviewSVG(name) {
  const width = 640, height = 400;
  const rand = seededRandom(hashStringToInt(String(name)));
  const dropletCount = 40 + Math.floor(rand() * 40);
  const droplets = Array.from({ length: dropletCount }).map(() => {
    const cx = (8 + rand() * (width - 16)).toFixed(1);
    const cy = (8 + rand() * (height - 16)).toFixed(1);
    const r = (2 + rand() * 5).toFixed(1);
    const opacity = (0.4 + rand() * 0.5).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" class="cell-thumb-droplet" opacity="${opacity}" />`;
  }).join('');

  return `
    <svg class="photo-preview-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Simulated fluorescence preview">
      <rect class="cell-thumb-bg" width="${width}" height="${height}" />
      ${droplets}
    </svg>
  `;
}

let addPhotosState = null;

function renderAddPhotos() {
  addPhotosState = { files: [], activeFileId: null };
  refreshAddPhotos();
}

function refreshAddPhotos() {
  app.innerHTML = renderAddPhotosHTML();
  wireAddPhotos();
}

function renderAddPhotosHTML() {
  const totalBoxes = addPhotosState.files.reduce((sum, f) => sum + f.boxes.length, 0);
  const conditionName = state.condition?.name || 'Condition';

  return `
    <div class="addphotos-screen">
      <header class="addphotos-topbar">
        <div class="addphotos-topbar-left">
          <div class="addphotos-condition">${escHtml(conditionName)}</div>
        </div>
        <div class="addphotos-instructions">Click anywhere on the image to box a cell.</div>
        <div class="addphotos-topbar-right">
          <div class="addphotos-topbar-actions">
            <button class="modal-cancel" id="addphotos-cancel">Cancel</button>
            <button class="primary-action" id="addphotos-create" ${totalBoxes === 0 ? 'disabled' : ''}>Create ${totalBoxes} cell${totalBoxes !== 1 ? 's' : ''}</button>
          </div>
        </div>
      </header>
      <div class="addphotos-error" id="addphotos-error"></div>
      <div class="addphotos-body">
        ${renderAddPhotosSidebarHTML()}
        ${renderAddPhotosCanvasHTML()}
      </div>
      <input type="file" id="addphotos-file-input" accept=".tif,.tiff" multiple hidden>
    </div>
  `;
}

function renderAddPhotosSidebarHTML() {
  const { files, activeFileId } = addPhotosState;
  const items = files.map(f => `
    <div class="addphotos-file${f.id === activeFileId ? ' active' : ''}" data-file-id="${escHtml(f.id)}" role="button" tabindex="0">
      <div class="addphotos-file-thumb">${
        f.status === 'ready' ? f.previewSvg :
        f.status === 'error' ? '<div class="addphotos-file-error">!</div>' :
        '<div class="addphotos-file-loading">…</div>'
      }</div>
      <div class="addphotos-file-info">
        <div class="addphotos-file-name">${escHtml(f.name)}</div>
        <div class="addphotos-file-count">${f.boxes.length} box${f.boxes.length !== 1 ? 'es' : ''}</div>
      </div>
    </div>
  `).join('');

  return `
    <aside class="addphotos-sidebar">
      <div class="addphotos-sidebar-header">
        <span>Photos</span>
        ${files.length > 0 ? '<button class="addphotos-add-files-btn" id="addphotos-add-files">+ Add files</button>' : ''}
      </div>
      <div class="addphotos-file-list">
        ${files.length === 0
          ? '<div class="addphotos-empty"><p>No photos yet.</p><p>Drag and drop .tif files here, or</p><button class="detail-open-btn" id="addphotos-choose">Choose .tif files</button></div>'
          : items}
      </div>
    </aside>
  `;
}

function renderAddPhotosCanvasHTML() {
  const { files, activeFileId } = addPhotosState;
  const file = files.find(f => f.id === activeFileId);

  if (!file) {
    return '<div class="addphotos-canvas-empty"><p>Select or add a photo to begin boxing cells.</p></div>';
  }
  if (file.status === 'loading') {
    return '<div class="addphotos-canvas-empty"><p>Rendering preview…</p></div>';
  }
  if (file.status === 'error') {
    return `<div class="addphotos-canvas-empty addphotos-canvas-error"><p>Could not render a preview for "${escHtml(file.name)}". The API may not be reachable yet.</p></div>`;
  }

  const boxes = file.boxes.map((box, i) => `
    <div class="photo-box" data-box-id="${escHtml(box.id)}" style="left:${box.x}%; top:${box.y}%; width:${box.w}%; height:${box.h}%;">
      <span class="photo-box-label">${i + 1}</span>
      <button class="photo-box-remove" data-box-id="${escHtml(box.id)}" aria-label="Remove box">&times;</button>
      <span class="photo-box-handle" data-box-id="${escHtml(box.id)}"></span>
    </div>
  `).join('');

  return `
    <div class="addphotos-canvas">
      <div class="canvas-frame" id="canvas-frame" style="aspect-ratio: ${file.aspectRatio || '8 / 5'};">
        ${file.previewSvg}
        ${boxes}
      </div>
    </div>
  `;
}

function registerPhotoFile(file) {
  const entry = { id: genLocalId('file'), name: file.name, rawFile: file, status: 'loading', previewSvg: '', boxes: [] };
  addPhotosState.files.push(entry);
  if (!addPhotosState.activeFileId) addPhotosState.activeFileId = entry.id;
  return entry;
}

function uploadPhotoPreview(entry, file) {
  if (localStorage.getItem('token')?.startsWith('local:')) {
    entry.previewSvg = renderPhotoPreviewSVG(entry.name);
    entry.status = 'ready';
    refreshAddPhotos();
    return Promise.resolve();
  }

  const formData = new FormData();
  formData.append('file', file);

  return apiUpload(`/conditions/${state.condition.id}/tif-preview`, formData)
    .then(({ preview_url }) => {
      entry.previewSvg = `<img class="photo-preview-img" src="${escHtml(preview_url)}" alt="Rendered preview of ${escHtml(entry.name)}">`;
      entry.status = 'ready';
      // Boxes are drawn (and sent to the backend) as percentages of the
      // canvas-frame. The frame must match the source image's own aspect
      // ratio, or object-fit: cover silently crops the display and those
      // percentages stop lining up with the full, uncropped image the
      // backend actually crops from.
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          entry.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = preview_url;
      });
    })
    .catch((err) => {
      console.error(`tif-preview failed for "${entry.name}":`, err);
      entry.status = 'error';
    })
    .finally(() => {
      refreshAddPhotos();
    });
}

// Selecting several .tif files at once used to fire a tif-preview request
// per file concurrently, which could spike Render's memory enough to OOM
// the process. Entries show up in the sidebar immediately (all "loading"),
// but the actual uploads run one at a time.
async function queuePhotoFiles(files) {
  if (isPreviewMode()) { showPreviewToast(); return; }
  const queued = files.map(file => ({ file, entry: registerPhotoFile(file) }));
  refreshAddPhotos();
  for (const { entry, file } of queued) {
    await uploadPhotoPreview(entry, file);
  }
}

function addBoxAt(xPct, yPct) {
  const file = addPhotosState.files.find(f => f.id === addPhotosState.activeFileId);
  if (!file) return;
  const w = 20, h = 20;
  const x = clamp(xPct - w / 2, 0, 100 - w);
  const y = clamp(yPct - h / 2, 0, 100 - h);
  file.boxes.push({ id: genLocalId('box'), x, y, w, h });
  refreshAddPhotos();
}

function removeBox(boxId) {
  const file = addPhotosState.files.find(f => f.id === addPhotosState.activeFileId);
  if (!file) return;
  file.boxes = file.boxes.filter(b => b.id !== boxId);
  refreshAddPhotos();
}

// Drag/resize mutate the box element's style directly on every mousemove for
// smooth visuals; the underlying state (and hence sidebar box count / labels,
// which don't change mid-drag) is only committed, not re-rendered, until drop.
function startBoxDrag(e, boxEl, frame) {
  e.preventDefault();
  const file = addPhotosState.files.find(f => f.id === addPhotosState.activeFileId);
  const box = file?.boxes.find(b => b.id === boxEl.dataset.boxId);
  if (!box) return;

  const frameRect = frame.getBoundingClientRect();
  const startX = e.clientX, startY = e.clientY;
  const startBoxX = box.x, startBoxY = box.y;

  function onMove(ev) {
    const dxPct = ((ev.clientX - startX) / frameRect.width) * 100;
    const dyPct = ((ev.clientY - startY) / frameRect.height) * 100;
    box.x = clamp(startBoxX + dxPct, 0, 100 - box.w);
    box.y = clamp(startBoxY + dyPct, 0, 100 - box.h);
    boxEl.style.left = `${box.x}%`;
    boxEl.style.top = `${box.y}%`;
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startBoxResize(e, boxEl, frame) {
  e.preventDefault();
  const file = addPhotosState.files.find(f => f.id === addPhotosState.activeFileId);
  const box = file?.boxes.find(b => b.id === boxEl.dataset.boxId);
  if (!box) return;

  const frameRect = frame.getBoundingClientRect();
  const startX = e.clientX, startY = e.clientY;
  const startW = box.w, startH = box.h;
  const MIN_SIZE = 5;

  function onMove(ev) {
    const dwPct = ((ev.clientX - startX) / frameRect.width) * 100;
    const dhPct = ((ev.clientY - startY) / frameRect.height) * 100;
    box.w = clamp(startW + dwPct, MIN_SIZE, 100 - box.x);
    box.h = clamp(startH + dhPct, MIN_SIZE, 100 - box.y);
    boxEl.style.width = `${box.w}%`;
    boxEl.style.height = `${box.h}%`;
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

async function confirmAddPhotos() {
  const totalBoxes = addPhotosState.files.reduce((sum, f) => sum + f.boxes.length, 0);
  if (totalBoxes === 0) return;

  const errEl = document.getElementById('addphotos-error');
  const createBtn = document.getElementById('addphotos-create');
  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';
  errEl.textContent = '';

  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const cond = conditions.find(c => String(c.id) === String(state.condition?.id));
    if (cond) {
      let nextNumber = cond.cells.reduce((max, c) => {
        const nums = cellNameSortKey(c.name);
        return nums.length ? Math.max(max, nums[nums.length - 1]) : max;
      }, 0) + 1;
      addPhotosState.files.forEach(file => {
        file.boxes.forEach(() => {
          cond.cells.push({ id: genLocalId('cell'), name: `Cell ${nextNumber}`, counts: [] });
          nextNumber++;
        });
      });
    }
    navigate('cells');
    return;
  }

  try {
    for (const file of addPhotosState.files) {
      if (file.boxes.length === 0) continue;
      const formData = new FormData();
      formData.append('file', file.rawFile);
      formData.append('boxes', JSON.stringify(file.boxes.map(({ x, y, w, h }) => ({ x, y, width: w, height: h }))));
      await apiUpload(`/conditions/${state.condition.id}/cells/from-tif`, formData);
    }
    navigate('cells');
  } catch (err) {
    console.error('cells/from-tif failed:', err);
    errEl.textContent = 'Could not create cells. Check the API connection.';
    createBtn.disabled = false;
    createBtn.textContent = `Create ${totalBoxes} cell${totalBoxes !== 1 ? 's' : ''}`;
  }
}

function wireAddPhotos() {
  const fileInput = document.getElementById('addphotos-file-input');
  const triggerPicker = () => fileInput.click();

  const chooseBtn = document.getElementById('addphotos-choose');
  if (chooseBtn) chooseBtn.addEventListener('click', triggerPicker);
  const addFilesBtn = document.getElementById('addphotos-add-files');
  if (addFilesBtn) addFilesBtn.addEventListener('click', triggerPicker);

  fileInput.addEventListener('change', () => {
    queuePhotoFiles(Array.from(fileInput.files || []));
    fileInput.value = '';
  });

  document.getElementById('addphotos-cancel').addEventListener('click', () => {
    navigate('cells');
  });

  const body = document.querySelector('.addphotos-body');
  let dragDepth = 0;
  body.addEventListener('dragenter', e => {
    e.preventDefault();
    dragDepth++;
    body.classList.add('dragover');
  });
  body.addEventListener('dragover', e => {
    e.preventDefault();
  });
  body.addEventListener('dragleave', e => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) body.classList.remove('dragover');
  });
  body.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    body.classList.remove('dragover');
    const dropped = Array.from(e.dataTransfer?.files || []).filter(f => /\.tiff?$/i.test(f.name));
    if (dropped.length) queuePhotoFiles(dropped);
  });

  const createBtn = document.getElementById('addphotos-create');
  if (createBtn) createBtn.addEventListener('click', confirmAddPhotos);

  document.querySelectorAll('.addphotos-file').forEach(el => {
    const select = () => {
      addPhotosState.activeFileId = el.dataset.fileId;
      refreshAddPhotos();
    };
    el.addEventListener('click', select);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') select(); });
  });

  const frame = document.getElementById('canvas-frame');
  if (!frame) return;

  frame.addEventListener('click', e => {
    if (e.target.closest('.photo-box')) return;
    const rect = frame.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    addBoxAt(xPct, yPct);
  });

  frame.querySelectorAll('.photo-box-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeBox(btn.dataset.boxId);
    });
  });

  frame.querySelectorAll('.photo-box').forEach(boxEl => {
    boxEl.addEventListener('mousedown', e => {
      if (e.target.closest('.photo-box-handle') || e.target.closest('.photo-box-remove')) return;
      startBoxDrag(e, boxEl, frame);
    });
  });

  frame.querySelectorAll('.photo-box-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      startBoxResize(e, handle.closest('.photo-box'), frame);
    });
  });
}

// ---- Count screen ----
// Full-screen, dark-mode counting interface; bypasses the standard shell
// like Login and Add Photos do (see navigate()). Screen-local state, reset
// every time the screen mounts.

let countState = null; // { cell, markers: [{ id, x, y }], zoom, editingCountId, readOnly, compareGroups }

const COUNT_ZOOM_MIN = 1;
const COUNT_ZOOM_MAX = 3;
const COUNT_ZOOM_STEP = 0.5;

// Fixed hue order for overlaying every hand count on one image (up to the
// 3-count-per-cell limit — see CLAUDE.md). Kept off blue/violet, reserved
// for the auto-count groups (AUTO_GROUP_COLOR_CLASSES) in the same overlay.
const COUNT_GROUP_COLOR_CLASSES = ['count-marker-group-1', 'count-marker-group-2', 'count-marker-group-3'];

// One color per possible auto-count counts.type row (see AUTO_ALGORITHMS),
// so both a Standard and an FM_edge_overlay (ALDQ) auto-count grid can be
// told apart when "Compare all counts" overlays them together.
const AUTO_GROUP_COLOR_CLASSES = ['count-marker-group-auto', 'count-marker-group-auto-2'];

function renderCount() {
  const editing = state.editingCount;
  const viewingAuto = state.viewingAutoPoints;
  const viewingAll = state.viewingAllCounts;
  countState = {
    cell: state.cell,
    // Reopening a saved count preloads its stored points as markers so
    // Done can PUT an update instead of POSTing a brand-new count. Viewing
    // a cell's auto count preloads its machine-generated points read-only.
    markers: viewingAuto
      ? viewingAuto.map(p => ({ id: genLocalId('marker'), x: p.x, y: p.y }))
      : (editing && editing.points)
        ? editing.points.map(p => ({ id: genLocalId('marker'), x: p.x, y: p.y }))
        : [],
    // "Compare all counts" overlays every saved hand count's grid plus the
    // auto count's grid (if any) at once, each in its own color, so raters
    // can compare placement — including against the machine suggestion —
    // at a glance.
    compareGroups: viewingAll
      ? [
          ...viewingAll.counts.map((c, i) => ({
            label: `Count ${i + 1}`,
            colorClass: COUNT_GROUP_COLOR_CLASSES[i % COUNT_GROUP_COLOR_CLASSES.length],
            value: (c.points && c.points.length) || c.value || 0,
            markers: (c.points || []).map(p => ({ id: genLocalId('marker'), x: p.x, y: p.y })),
          })),
          ...(viewingAll.autoResults || []).map((r, i) => ({
            label: `Auto count — ${autoAlgorithmLabel(r.algorithm)}`,
            colorClass: AUTO_GROUP_COLOR_CLASSES[i % AUTO_GROUP_COLOR_CLASSES.length],
            value: r.points.length,
            markers: r.points.map(p => ({ id: genLocalId('marker'), x: p.x, y: p.y })),
          })),
        ]
      : null,
    zoom: COUNT_ZOOM_MIN,
    editingCountId: editing ? editing.id : null,
    readOnly: !!viewingAuto || !!viewingAll,
  };
  refreshCount();
}

function refreshCount() {
  app.innerHTML = renderCountHTML();
  wireCount();
}

function renderMarkerHTML(m, readOnly, groupColorClass = '') {
  if (readOnly) {
    const cls = groupColorClass ? `count-marker count-marker-readonly ${groupColorClass}` : 'count-marker count-marker-readonly';
    return `<span class="${cls}" style="left:${m.x}%; top:${m.y}%;"></span>`;
  }
  return `<button class="count-marker" data-marker-id="${escHtml(m.id)}" style="left:${m.x}%; top:${m.y}%;" aria-label="Remove marker"></button>`;
}

function renderCountHTML() {
  const { cell, markers, zoom, readOnly, compareGroups } = countState;

  // Not cell.image_url directly — that's the plain stored crop
  // (detect_droplets's calibrated input, see CLAUDE.md). This endpoint
  // renders the background-subtracted + CLAHE-enhanced view fresh on every
  // load instead, so the human counter still gets the higher-contrast image
  // without a second one being stored (api/main.py's GET
  // /cells/{id}/display-image).
  const image = cell.image_url
    ? `<img class="photo-preview-img" src="${escHtml(RENDER_API_URL)}/cells/${escHtml(cell.id)}/display-image" alt="Processed fluorescence image of ${escHtml(cell.name)}">`
    : renderPhotoPreviewSVG(cell.id);

  const markerEls = compareGroups
    ? compareGroups.map(g => g.markers.map(m => renderMarkerHTML(m, true, g.colorClass)).join('')).join('')
    : markers.map(m => renderMarkerHTML(m, readOnly)).join('');

  const modeLabel = compareGroups
    ? ` · comparing ${compareGroups.length} count${compareGroups.length === 1 ? '' : 's'}`
    : readOnly ? ' · auto count (view only)' : countState.editingCountId ? ' · editing saved count' : '';

  // A legend is mandatory whenever ≥2 series share a canvas so color is
  // never the only way to tell counts apart.
  const legend = compareGroups ? `
    <div class="count-legend">
      ${compareGroups.map(g => `
        <span class="count-legend-item">
          <span class="count-legend-swatch ${g.colorClass}"></span>
          ${escHtml(g.label)}: ${g.value}
        </span>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="count-screen">
      <header class="count-topbar">
        <div class="count-topbar-left">
          <div class="count-cell-name">${escHtml(cell.name)}${modeLabel}</div>
          ${compareGroups ? '' : `<div class="count-total">Total: ${markers.length}</div>`}
        </div>
        <div class="count-topbar-actions">
          ${compareGroups ? '<button class="count-cancel-btn" id="count-download">Download</button>' : ''}
          <button class="count-cancel-btn" id="count-cancel">${readOnly ? 'Close' : 'Cancel'}</button>
          ${readOnly ? '' : '<button class="primary-action" id="count-done">Done</button>'}
        </div>
      </header>
      <div class="count-zoom-controls">
        <button class="count-zoom-btn" id="count-zoom-out" aria-label="Zoom out">−</button>
        <span class="count-zoom-level" id="count-zoom-level">${Math.round(zoom * 100)}%</span>
        <button class="count-zoom-btn" id="count-zoom-in" aria-label="Zoom in">+</button>
      </div>
      ${legend}
      <div class="count-error" id="count-error"></div>
      <div class="count-canvas">
        <div class="canvas-frame" id="count-frame" style="width:${zoom * 100}%; max-width:${zoom * 55}rem;">
          ${image}
          ${markerEls}
        </div>
      </div>
    </div>
  `;
}

function addMarkerAt(xPct, yPct) {
  const marker = { id: genLocalId('marker'), x: clamp(xPct, 0, 100), y: clamp(yPct, 0, 100) };
  countState.markers.push(marker);
  const frame = document.getElementById('count-frame');
  frame.insertAdjacentHTML('beforeend', renderMarkerHTML(marker));
  wireMarkerButton(frame.lastElementChild);
  updateCountTotal();
}

function removeMarker(id) {
  countState.markers = countState.markers.filter(m => m.id !== id);
  document.querySelector(`.count-marker[data-marker-id="${id}"]`)?.remove();
  updateCountTotal();
}

function updateCountTotal() {
  const totalEl = document.querySelector('.count-total');
  if (totalEl) totalEl.textContent = `Total: ${countState.markers.length}`;
}

function wireMarkerButton(btn) {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    removeMarker(btn.dataset.markerId);
  });
}

// Zoom is applied by resizing #count-frame's real width/max-width (not a
// CSS transform), so getBoundingClientRect()-based click math in wireCount
// keeps working unchanged, and .count-canvas's existing overflow: auto
// gives free panning around the enlarged image via scroll/trackpad.
function setCountZoom(zoom) {
  countState.zoom = clamp(zoom, COUNT_ZOOM_MIN, COUNT_ZOOM_MAX);
  const frame = document.getElementById('count-frame');
  frame.style.width = `${countState.zoom * 100}%`;
  frame.style.maxWidth = `${countState.zoom * 55}rem`;
  document.getElementById('count-zoom-level').textContent = `${Math.round(countState.zoom * 100)}%`;
  document.getElementById('count-zoom-out').disabled = countState.zoom <= COUNT_ZOOM_MIN;
  document.getElementById('count-zoom-in').disabled = countState.zoom >= COUNT_ZOOM_MAX;
}

async function finishCount() {
  const value = countState.markers.length;
  const points = countState.markers.map(m => ({ x: m.x, y: m.y }));
  const editingId = countState.editingCountId;
  const doneBtn = document.getElementById('count-done');
  const errEl = document.getElementById('count-error');
  doneBtn.disabled = true;
  doneBtn.textContent = 'Saving…';
  errEl.textContent = '';

  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const cond = conditions.find(c => String(c.id) === String(state.condition?.id));
    const cell = cond?.cells.find(c => String(c.id) === String(countState.cell.id));
    if (cell) {
      if (editingId) {
        cell.counts = (cell.counts || []).map(c =>
          String(c.id) === String(editingId) ? { ...c, value, points } : c);
      } else {
        cell.counts = [...(cell.counts || []), { id: genLocalId('cnt'), value, points, type: 'hand', counted_by_email: currentUser() }];
      }
    }
    navigate('cells');
    return;
  }

  try {
    if (editingId) {
      await api(`/counts/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ value, points }),
      });
    } else {
      await api(`/cells/${countState.cell.id}/counts`, {
        method: 'POST',
        body: JSON.stringify({ value, points }),
      });
    }
    navigate('cells');
  } catch {
    errEl.textContent = 'Could not save count. Check the API connection.';
    doneBtn.disabled = false;
    doneBtn.textContent = 'Done';
  }
}

// "Compare all counts" only: flattens the on-screen overlay (base image +
// every group's colored markers, matched to the legend's actual rendered
// colors rather than a duplicated color list) onto a canvas at the image's
// native resolution and saves it as a PNG, so a rater can keep/share the
// comparison outside the app.
async function downloadCountOverlay() {
  const { cell, compareGroups } = countState;
  const img = document.querySelector('#count-frame .photo-preview-img');
  if (!compareGroups || !img) return;

  const btn = document.getElementById('count-download');
  btn.disabled = true;

  try {
    const source = new Image();
    source.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      source.onload = resolve;
      source.onerror = reject;
      source.src = img.src;
    });

    const width = source.naturalWidth;
    const height = source.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, width, height);

    const swatches = document.querySelectorAll('.count-legend-swatch');
    const radius = Math.max(2, width * 0.003);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(0.5, radius * 0.25);
    compareGroups.forEach((g, i) => {
      ctx.fillStyle = swatches[i] ? getComputedStyle(swatches[i]).backgroundColor : '#fff';
      g.markers.forEach(m => {
        ctx.beginPath();
        ctx.arc((m.x / 100) * width, (m.y / 100) * height, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cell.name.replace(/[^\w.-]+/g, '_')}-compare-counts.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    document.getElementById('count-error').textContent = 'Could not download the overlay image.';
  } finally {
    btn.disabled = false;
  }
}

function wireCount() {
  document.getElementById('count-cancel').addEventListener('click', () => {
    navigate('cells');
  });

  const doneBtn = document.getElementById('count-done');
  if (doneBtn) doneBtn.addEventListener('click', finishCount);

  const downloadBtn = document.getElementById('count-download');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadCountOverlay);

  const frame = document.getElementById('count-frame');

  // cell.image_url is a crop from Add Photos, so its aspect ratio is
  // whatever the drawn box was — not necessarily the frame's CSS default.
  // Match the frame to the real image so object-fit: cover doesn't crop it
  // again here (same fix as the Add Photos canvas-frame; see uploadPhotoPreview).
  const img = frame.querySelector('.photo-preview-img');
  if (img) {
    const applyAspectRatio = () => {
      if (img.naturalWidth && img.naturalHeight) {
        frame.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
    };
    if (img.complete) applyAspectRatio();
    else img.addEventListener('load', applyAspectRatio, { once: true });
  }

  // Auto count is a read-only view of machine-generated points: no adding,
  // no removing (there's nothing to correct — see the CTA on the Cells
  // screen for hand counting instead).
  if (!countState.readOnly) {
    frame.addEventListener('click', e => {
      if (e.target.closest('.count-marker')) return;
      const rect = frame.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      addMarkerAt(xPct, yPct);
    });

    frame.querySelectorAll('.count-marker').forEach(wireMarkerButton);
  }

  document.getElementById('count-zoom-out').addEventListener('click', () => {
    setCountZoom(countState.zoom - COUNT_ZOOM_STEP);
  });
  document.getElementById('count-zoom-in').addEventListener('click', () => {
    setCountZoom(countState.zoom + COUNT_ZOOM_STEP);
  });
  document.getElementById('count-zoom-out').disabled = countState.zoom <= COUNT_ZOOM_MIN;
  document.getElementById('count-zoom-in').disabled = countState.zoom >= COUNT_ZOOM_MAX;
}

// ---- Graph screen ----
// Lives inside the authenticated shell (unlike Add Photos/Count). Lets the
// user assemble conditions from any experiment onto one scatter plot. Dots
// are colored per-experiment ("series"): a single experiment stays in
// --accent with no legend; a second experiment switches every column to the
// dataviz-skill categorical palette (--series-1..8, see style.css) with a
// legend, colors assigned in fixed first-seen order and never recycled for
// the rest of the screen's session (graphState.colorAssignments persists
// across add/remove within one visit; a full reset only happens on remount).

let graphState = null; // { conditionsCache, selectedExperimentId, selected, colorAssignments, metric, title, editingTitle }

const GRAPH_DEFAULT_TITLE = 'Lipid droplet counts by condition';

const GRAPH_PENCIL_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

// Metric shown on the y-axis: 'auto' (machine-suggested auto count, default
// — averaged across whichever algorithm(s) have a counts row for that cell,
// see cellAutoCount), 'hand' (average of hand counts), or 'combined'
// (average of the two).
const GRAPH_METRICS = {
  auto: { label: 'Auto count', axisLabel: 'Lipid droplets / cell (auto count)' },
  hand: { label: 'Average hand count', axisLabel: 'Lipid droplets / cell (hand count avg)' },
  combined: { label: 'Average of both', axisLabel: 'Lipid droplets / cell (combined avg)' },
};

// Chart type shown in the main panel: 'scatter' (per-cell dots + mean tick,
// the original/default view), 'bar' (condition mean bar with a sample-SD
// error whisker), or 'box' (min/Q1/median/Q3/max box-and-whisker).
const GRAPH_CHART_TYPES = {
  scatter: { label: 'Scatter' },
  bar: { label: 'Bar chart (mean ± SD)' },
  box: { label: 'Box plot' },
};

function cellValueForMetric(cell, metric) {
  const auto = cellAutoCount(cell);
  const hand = cellAverage(cell);
  if (metric === 'hand') return hand;
  if (metric === 'combined') {
    if (auto == null) return hand;
    if (hand == null) return auto;
    return (auto + hand) / 2;
  }
  return auto;
}

function conditionValuesForMetric(cond, metric) {
  return (cond.cells || []).map(cell => cellValueForMetric(cell, metric)).filter(v => v != null);
}

function conditionMeanForMetric(cond, metric) {
  const values = conditionValuesForMetric(cond, metric);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Sample standard deviation (ddof=1); null below n=2 since a spread isn't
// meaningful for a single point.
function conditionStdDevForMetric(cond, metric) {
  const values = conditionValuesForMetric(cond, metric);
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function medianOfSorted(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Quartiles via median-of-halves (Tukey's hinges: median excluded from both
// halves on odd n) -- simple and standard for the small per-condition sample
// sizes here, unlike interpolated-percentile methods meant for large n.
function conditionQuartilesForMetric(cond, metric) {
  const values = conditionValuesForMetric(cond, metric).slice().sort((a, b) => a - b);
  if (!values.length) return null;
  const n = values.length;
  const median = medianOfSorted(values);
  const lowerHalf = values.slice(0, Math.floor(n / 2));
  const upperHalf = values.slice(Math.ceil(n / 2));
  const q1 = lowerHalf.length ? medianOfSorted(lowerHalf) : median;
  const q3 = upperHalf.length ? medianOfSorted(upperHalf) : median;
  return { min: values[0], q1, median, q3, max: values[n - 1], n };
}

async function initGraph() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading experiments…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = currentProjectExperiments();
  }

  if (!experiments) {
    try {
      experiments = await api(`/projects/${state.project.id}/experiments`);
    } catch {
      content.innerHTML = '<div class="error-state">Could not load experiments. The API may not be reachable yet.</div>';
      return;
    }
  }

  graphState = {
    conditionsCache: {}, selectedExperimentId: null, selected: [], colorAssignments: {},
    metric: 'combined', chartType: 'scatter',
    title: GRAPH_DEFAULT_TITLE, editingTitle: false,
  };
  content.innerHTML = renderGraphHTML(experiments);
  wireGraph(experiments);
}

function renderGraphHTML(experiments) {
  const expOptions = experiments.map(exp =>
    `<option value="${escHtml(String(exp.id))}">${escHtml(exp.name)}</option>`
  ).join('');

  return `
    <div class="graph-layout">
      <aside class="graph-sidebar">
        <div class="graph-field">
          <label for="graph-experiment-select">Experiment</label>
          <div class="graph-select-wrap">
            <select class="graph-select" id="graph-experiment-select">
              <option value="" selected disabled>Select an experiment…</option>
              ${expOptions}
            </select>
          </div>
        </div>
        <div class="graph-field">
          <label for="graph-condition-select">Condition</label>
          <div class="graph-select-wrap">
            <select class="graph-select" id="graph-condition-select" disabled>
              <option value="">Select an experiment first…</option>
            </select>
          </div>
        </div>
        <button class="graph-add-btn" id="graph-add-btn" disabled>Add to graph</button>
        <div class="graph-selected-list" id="graph-selected-list">${renderGraphSelectedListHTML()}</div>
        <div class="graph-field">
          <label>Chart type</label>
          <div class="graph-metric-checkboxes">
            ${Object.entries(GRAPH_CHART_TYPES).map(([value, { label }]) => `
              <label class="graph-metric-checkbox">
                <input type="checkbox" class="graph-charttype-input" value="${value}"${value === graphState.chartType ? ' checked' : ''} />
                ${escHtml(label)}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="graph-field">
          <label>Metric</label>
          <div class="graph-metric-checkboxes">
            ${Object.entries(GRAPH_METRICS).map(([value, { label }]) => `
              <label class="graph-metric-checkbox">
                <input type="checkbox" class="graph-metric-input" value="${value}"${value === graphState.metric ? ' checked' : ''} />
                ${escHtml(label)}
              </label>
            `).join('')}
          </div>
        </div>
      </aside>
      <div class="graph-main">
        <div class="graph-header">
          <div class="graph-title-row" id="graph-title-row">${renderGraphTitleRowHTML()}</div>
          <button type="button" class="graph-export-btn" id="graph-export-btn">Download graph</button>
        </div>
        <div id="graph-chart-area">${renderGraphChartArea()}</div>
        <div class="graph-tooltip" id="graph-tooltip" hidden></div>
      </div>
    </div>
  `;
}

function renderGraphTitleRowHTML() {
  if (graphState.editingTitle) {
    return `<input type="text" class="graph-title-input" id="graph-title-input" value="${escHtml(graphState.title)}" maxlength="120" />`;
  }
  return `
    <h2 class="graph-chart-title">${escHtml(graphState.title)}</h2>
    <button type="button" class="graph-edit-btn" id="graph-title-edit-btn" aria-label="Edit graph title" title="Edit graph title">${GRAPH_PENCIL_ICON}</button>
  `;
}

function refreshGraphTitleRow() {
  document.getElementById('graph-title-row').innerHTML = renderGraphTitleRowHTML();
  wireGraphTitleRow();
}

function wireGraphTitleRow() {
  if (graphState.editingTitle) {
    const input = document.getElementById('graph-title-input');
    input.focus();
    input.select();
    let cancelled = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { cancelled = true; input.blur(); }
    });
    input.addEventListener('blur', () => {
      if (!cancelled) {
        const value = input.value.trim();
        if (value) graphState.title = value;
      }
      graphState.editingTitle = false;
      refreshGraphTitleRow();
    });
    return;
  }
  document.getElementById('graph-title-edit-btn').addEventListener('click', () => {
    graphState.editingTitle = true;
    refreshGraphTitleRow();
  });
}

// Each selected item's experiment/condition display labels (experimentLabel/
// conditionLabel) start out equal to the real names but can be edited
// independently per item via the pencil icons on the chart's x-axis (see
// graphAxisEditIconSVG/openGraphAxisLabelEditor below) — a display-only
// rename that feeds these list rows, the column labels, and the legend
// without touching the underlying experiment/condition records.
function renderGraphSelectedListHTML() {
  if (graphState.selected.length === 0) return '';
  return `
    <ul class="graph-selected-list-items">
      ${graphState.selected.map(s => `
        <li class="graph-selected-item">
          <span>${escHtml(s.experimentLabel)} &rsaquo; ${escHtml(s.conditionLabel)}</span>
          <button class="graph-selected-remove" data-condition-id="${escHtml(String(s.conditionId))}" aria-label="Remove ${escHtml(s.conditionLabel)} from graph">&times;</button>
        </li>
      `).join('')}
    </ul>
  `;
}

function refreshGraphSelectedList() {
  document.getElementById('graph-selected-list').innerHTML = renderGraphSelectedListHTML();
  wireGraphSelectedList();
}

function wireGraphSelectedList() {
  document.querySelectorAll('.graph-selected-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      graphState.selected = graphState.selected.filter(s => String(s.conditionId) !== btn.dataset.conditionId);
      refreshGraphSelectedList();
      refreshGraphChartArea();
    });
  });
}

// A small pencil <svg> nested inside the chart's own <svg> (valid SVG,
// scaled/positioned via its own x/y/width/height like an <image>), reusing
// GRAPH_PENCIL_ICON's path data. Stripped out of the clone in
// downloadGraphImage before rasterizing, so it never appears in the export.
function graphAxisEditIconSVG(x, y, conditionId, field) {
  return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="11" height="11" viewBox="0 0 24 24" class="graph-axis-edit-btn" data-condition-id="${escHtml(String(conditionId))}" data-field="${field}" role="button" tabindex="0" aria-label="Edit label"><rect width="24" height="24" fill="transparent"/><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Positions a floating <input> under whichever axis pencil was clicked
// (same "anchor to the clicked element's own rect" approach the graph
// tooltip uses for its own positioning, just anchored instead of following
// the mouse) and commits the edited label back onto the matching selected
// item on blur/Enter.
function openGraphAxisLabelEditor(btn) {
  const { conditionId, field } = btn.dataset;
  const item = graphState.selected.find(s => String(s.conditionId) === String(conditionId));
  if (!item) return;

  document.querySelector('.graph-axis-label-editor')?.remove();

  const rect = btn.getBoundingClientRect();
  const editor = document.createElement('input');
  editor.type = 'text';
  editor.className = 'graph-axis-label-editor';
  editor.maxLength = 60;
  editor.value = item[field];
  editor.style.left = `${rect.left}px`;
  editor.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(editor);
  editor.focus();
  editor.select();

  let cancelled = false;
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') editor.blur();
    else if (e.key === 'Escape') { cancelled = true; editor.blur(); }
  });
  editor.addEventListener('blur', () => {
    if (!cancelled) {
      const value = editor.value.trim();
      if (value) item[field] = value;
    }
    editor.remove();
    refreshGraphSelectedList();
    refreshGraphChartArea();
  });
}

function wireGraphAxisEdit() {
  document.querySelectorAll('.graph-axis-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openGraphAxisLabelEditor(btn));
  });
}

function refreshGraphChartArea() {
  document.getElementById('graph-chart-area').innerHTML = renderGraphChartArea();
  wireGraphTooltip();
  wireGraphAxisEdit();
}

// Series = experiment. A single represented experiment stays in the plain
// --accent color with no legend; a second one flips every column over to
// the categorical palette, assigning slots in first-seen order and keeping
// them fixed even if that experiment is later removed and re-added.
function seriesColorForExperiment(experimentId) {
  const distinctIds = [...new Set(graphState.selected.map(s => s.experimentId))];
  if (distinctIds.length <= 1) return 'var(--accent)';

  if (!(experimentId in graphState.colorAssignments)) {
    const nextIdx = Object.keys(graphState.colorAssignments).length % 8;
    graphState.colorAssignments[experimentId] = nextIdx;
  }
  return `var(--series-${graphState.colorAssignments[experimentId] + 1})`;
}

function renderGraphChartArea() {
  const { selected } = graphState;
  if (selected.length === 0) {
    return '<div class="empty-state">No data — add a condition from the sidebar to begin.</div>';
  }

  // Render the chart first: whichever renderer runs is what assigns fresh
  // color slots (in column order == first-seen order), so the legend below
  // can just look the assignments up rather than risk a different order.
  const chartSvg = graphState.chartType === 'bar' ? renderGraphBarSVG(selected, graphState.metric)
    : graphState.chartType === 'box' ? renderGraphBoxSVG(selected, graphState.metric)
    : renderGraphScatterSVG(selected, graphState.metric);

  const distinctIds = [...new Set(selected.map(s => s.experimentId))];
  const legend = distinctIds.length > 1
    ? `
      <div class="graph-legend">
        ${distinctIds.map(expId => {
          const item = selected.find(s => s.experimentId === expId);
          const color = seriesColorForExperiment(expId);
          return `
            <span class="graph-legend-item">
              <span class="graph-legend-swatch" style="background:${color}"></span>
              ${escHtml(item.experimentLabel)}
            </span>
          `;
        }).join('')}
      </div>
    `
    : '';

  return legend + chartSvg;
}

// Shared layout constants for all three chart-type renderers below, so a
// selected condition lands in the same column position regardless of which
// chart type is active.
const GRAPH_CHART_WIDTH = 900;
const GRAPH_CHART_HEIGHT = 420;
const GRAPH_PAD_LEFT = 40;
const GRAPH_PAD_RIGHT = 20;
const GRAPH_PAD_TOP = 20;
const GRAPH_PAD_BOTTOM = 56;
const GRAPH_TICK_STEP = 50;

function computeNiceMax(values, tickStep) {
  const rawMax = Math.max(1, ...values);
  const niceMax = Math.ceil(rawMax / tickStep) * tickStep || tickStep;
  return { niceMax, tickCount: niceMax / tickStep };
}

function renderGraphGridlinesSVG(niceMax, tickStep, yFor, padLeft, plotWidth) {
  const tickCount = niceMax / tickStep;
  return Array.from({ length: tickCount + 1 }).map((_, i) => {
    const val = tickStep * i;
    const y = yFor(val);
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${(padLeft + plotWidth).toFixed(1)}" y2="${y.toFixed(1)}" class="graph-gridline" />
      <text x="${(padLeft - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="graph-axis-tick" text-anchor="end">${val.toFixed(0)}</text>
    `;
  }).join('');
}

function renderGraphColumnLabelSVG(cx, height, conditionLabel, experimentLabel, conditionId) {
  const mainY = height - 34;
  const subY = height - 18;
  return `
    <text x="${cx.toFixed(1)}" y="${mainY}" class="graph-col-label" text-anchor="middle">${escHtml(truncateLabel(conditionLabel, 14))}</text>
    ${graphAxisEditIconSVG(cx + 46, mainY - 9, conditionId, 'conditionLabel')}
    <text x="${cx.toFixed(1)}" y="${subY}" class="graph-col-sublabel" text-anchor="middle">${escHtml(truncateLabel(experimentLabel, 16))}</text>
    ${graphAxisEditIconSVG(cx + 48, subY - 8, conditionId, 'experimentLabel')}
  `;
}

function renderGraphScatterSVG(selected, metric) {
  const width = GRAPH_CHART_WIDTH;
  const height = GRAPH_CHART_HEIGHT;
  const padLeft = GRAPH_PAD_LEFT;
  const padTop = GRAPH_PAD_TOP;
  const plotWidth = width - padLeft - GRAPH_PAD_RIGHT;
  const plotHeight = height - padTop - GRAPH_PAD_BOTTOM;

  const allAverages = selected.flatMap(s => (s.cells || []).map(cell => cellValueForMetric(cell, metric))).filter(a => a != null);
  const { niceMax } = computeNiceMax(allAverages, GRAPH_TICK_STEP);
  const yFor = val => padTop + plotHeight - (val / niceMax) * plotHeight;

  const n = selected.length;
  const colWidth = plotWidth / n;

  const gridlines = renderGraphGridlinesSVG(niceMax, GRAPH_TICK_STEP, yFor, padLeft, plotWidth);

  const columns = selected.map((s, i) => {
    const cx = padLeft + colWidth * (i + 0.5);
    const color = seriesColorForExperiment(s.experimentId);
    const cellsWithAvg = (s.cells || [])
      .map(cell => ({ cell, avg: cellValueForMetric(cell, metric) }))
      .filter(x => x.avg != null);

    const dots = cellsWithAvg.map(({ cell, avg }, j) => {
      const jitter = (j % 2 === 0 ? 1 : -1) * (Math.floor(j / 2) + 1) * 5;
      const x = cx + jitter;
      const y = yFor(avg);
      const countsStr = handCounts(cell).map(c => c.value).join(', ') || '—';
      const autoStr = cellAutoCounts(cell).map(r => `${autoAlgorithmLabel(r.type)}: ${r.value}`).join(', ') || '—';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="graph-dot" style="fill:${color}"
        data-experiment="${escHtml(s.experimentLabel)}" data-condition="${escHtml(s.conditionLabel)}"
        data-cell="${escHtml(cell.name)}" data-counts="${escHtml(countsStr)}" data-average="${autoStr}"
        data-plotted="${avg.toFixed(1)}" data-metric-key="${metric}" data-metric="${escHtml(GRAPH_METRICS[metric].label)}" />`;
    }).join('');

    const mean = conditionMeanForMetric(s, metric);
    const barHalf = colWidth * 0.3;
    // The hit rect sits *below* the dots in document order so a dot sitting
    // on top of the mean line still wins hover — only the tick's own class
    // (rendered last, pointer-events: none) needs to stay visually on top.
    const meanHit = mean != null
      ? `<rect x="${(cx - barHalf).toFixed(1)}" y="${(yFor(mean) - 6).toFixed(1)}" width="${(barHalf * 2).toFixed(1)}" height="12" class="graph-mean-hit"
          data-experiment="${escHtml(s.experimentLabel)}" data-condition="${escHtml(s.conditionLabel)}"
          data-mean="${mean.toFixed(1)}" data-metric="${escHtml(GRAPH_METRICS[metric].label)}" />`
      : '';
    const meanTick = mean != null
      ? `<line x1="${(cx - barHalf).toFixed(1)}" y1="${yFor(mean).toFixed(1)}" x2="${(cx + barHalf).toFixed(1)}" y2="${yFor(mean).toFixed(1)}" class="graph-mean-tick" style="stroke:${color}" />`
      : '';

    const label = renderGraphColumnLabelSVG(cx, height, s.conditionLabel, s.experimentLabel, s.conditionId);

    return meanHit + dots + meanTick + label;
  }).join('');

  return `
    <svg class="graph-scatter-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lipid droplet counts by condition">
      <text x="${padLeft}" y="14" class="graph-axis-label">${escHtml(GRAPH_METRICS[metric].axisLabel)}</text>
      ${gridlines}
      ${columns}
    </svg>
  `;
}

function renderGraphBarSVG(selected, metric) {
  const width = GRAPH_CHART_WIDTH;
  const height = GRAPH_CHART_HEIGHT;
  const padLeft = GRAPH_PAD_LEFT;
  const padTop = GRAPH_PAD_TOP;
  const plotWidth = width - padLeft - GRAPH_PAD_RIGHT;
  const plotHeight = height - padTop - GRAPH_PAD_BOTTOM;

  const bars = selected.map(s => ({
    s,
    mean: conditionMeanForMetric(s, metric),
    sd: conditionStdDevForMetric(s, metric),
    n: conditionValuesForMetric(s, metric).length,
  }));

  const allTops = bars.map(b => (b.mean ?? 0) + (b.sd ?? 0));
  const { niceMax } = computeNiceMax(allTops, GRAPH_TICK_STEP);
  const yFor = val => padTop + plotHeight - (val / niceMax) * plotHeight;

  const n = selected.length;
  const colWidth = plotWidth / n;

  const gridlines = renderGraphGridlinesSVG(niceMax, GRAPH_TICK_STEP, yFor, padLeft, plotWidth);

  const columns = bars.map(({ s, mean, sd, n: cellCount }, i) => {
    const cx = padLeft + colWidth * (i + 0.5);
    const label = renderGraphColumnLabelSVG(cx, height, s.conditionLabel, s.experimentLabel, s.conditionId);
    if (mean == null) return label;

    const color = seriesColorForExperiment(s.experimentId);
    const barHalf = colWidth * 0.3;
    const baselineY = yFor(0);
    const meanY = yFor(mean);
    const barTop = Math.min(baselineY, meanY);
    const barHeight = Math.abs(baselineY - meanY);

    // Full-column invisible hit target, same approach as the scatter chart's
    // mean-hit rect: the visible bar/whisker stay pointer-events:none so a
    // single hover target covers the whole column instead of just the bar.
    const barHit = `<rect x="${(cx - barHalf).toFixed(1)}" y="${padTop}" width="${(barHalf * 2).toFixed(1)}" height="${plotHeight.toFixed(1)}" class="graph-bar-hit"
      data-experiment="${escHtml(s.experimentLabel)}" data-condition="${escHtml(s.conditionLabel)}"
      data-mean="${mean.toFixed(1)}" data-sd="${sd != null ? sd.toFixed(1) : '—'}" data-n="${cellCount}" data-metric="${escHtml(GRAPH_METRICS[metric].label)}" />`;

    const bar = `<rect x="${(cx - barHalf).toFixed(1)}" y="${barTop.toFixed(1)}" width="${(barHalf * 2).toFixed(1)}" height="${barHeight.toFixed(1)}" class="graph-bar" style="fill:${color}" />`;

    let whisker = '';
    if (sd != null) {
      const capHalf = barHalf * 0.5;
      const yTop = yFor(mean + sd);
      const yBottom = yFor(mean - sd);
      whisker = `
        <line x1="${cx.toFixed(1)}" y1="${yTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yBottom.toFixed(1)}" class="graph-error-whisker" />
        <line x1="${(cx - capHalf).toFixed(1)}" y1="${yTop.toFixed(1)}" x2="${(cx + capHalf).toFixed(1)}" y2="${yTop.toFixed(1)}" class="graph-error-whisker" />
        <line x1="${(cx - capHalf).toFixed(1)}" y1="${yBottom.toFixed(1)}" x2="${(cx + capHalf).toFixed(1)}" y2="${yBottom.toFixed(1)}" class="graph-error-whisker" />
      `;
    }

    return barHit + bar + whisker + label;
  }).join('');

  return `
    <svg class="graph-scatter-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lipid droplet condition means with standard deviation">
      <text x="${padLeft}" y="14" class="graph-axis-label">${escHtml(GRAPH_METRICS[metric].axisLabel)}</text>
      ${gridlines}
      ${columns}
    </svg>
  `;
}

function renderGraphBoxSVG(selected, metric) {
  const width = GRAPH_CHART_WIDTH;
  const height = GRAPH_CHART_HEIGHT;
  const padLeft = GRAPH_PAD_LEFT;
  const padTop = GRAPH_PAD_TOP;
  const plotWidth = width - padLeft - GRAPH_PAD_RIGHT;
  const plotHeight = height - padTop - GRAPH_PAD_BOTTOM;

  const boxes = selected.map(s => ({ s, stats: conditionQuartilesForMetric(s, metric) }));

  const allMaxes = boxes.map(b => b.stats?.max ?? 0);
  const { niceMax } = computeNiceMax(allMaxes, GRAPH_TICK_STEP);
  const yFor = val => padTop + plotHeight - (val / niceMax) * plotHeight;

  const n = selected.length;
  const colWidth = plotWidth / n;

  const gridlines = renderGraphGridlinesSVG(niceMax, GRAPH_TICK_STEP, yFor, padLeft, plotWidth);

  const columns = boxes.map(({ s, stats }, i) => {
    const cx = padLeft + colWidth * (i + 0.5);
    const label = renderGraphColumnLabelSVG(cx, height, s.conditionLabel, s.experimentLabel, s.conditionId);
    if (!stats) return label;

    const { min, q1, median, q3, max, n: cellCount } = stats;
    const color = seriesColorForExperiment(s.experimentId);
    const boxHalf = colWidth * 0.3;

    const boxHit = `<rect x="${(cx - boxHalf).toFixed(1)}" y="${padTop}" width="${(boxHalf * 2).toFixed(1)}" height="${plotHeight.toFixed(1)}" class="graph-box-hit"
      data-experiment="${escHtml(s.experimentLabel)}" data-condition="${escHtml(s.conditionLabel)}"
      data-min="${min.toFixed(1)}" data-q1="${q1.toFixed(1)}" data-median="${median.toFixed(1)}" data-q3="${q3.toFixed(1)}" data-max="${max.toFixed(1)}"
      data-n="${cellCount}" data-metric="${escHtml(GRAPH_METRICS[metric].label)}" />`;

    const whisker = `<line x1="${cx.toFixed(1)}" y1="${yFor(max).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yFor(min).toFixed(1)}" class="graph-box-whisker" style="stroke:${color}" />`;

    const boxTop = yFor(q3);
    const boxBottom = yFor(q1);
    const box = `<rect x="${(cx - boxHalf).toFixed(1)}" y="${boxTop.toFixed(1)}" width="${(boxHalf * 2).toFixed(1)}" height="${(boxBottom - boxTop).toFixed(1)}" class="graph-box" style="fill:${color};stroke:${color}" />`;

    const medianTick = `<line x1="${(cx - boxHalf).toFixed(1)}" y1="${yFor(median).toFixed(1)}" x2="${(cx + boxHalf).toFixed(1)}" y2="${yFor(median).toFixed(1)}" class="graph-box-median" style="stroke:${color}" />`;

    return boxHit + whisker + box + medianTick + label;
  }).join('');

  return `
    <svg class="graph-scatter-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lipid droplet count distribution by condition">
      <text x="${padLeft}" y="14" class="graph-axis-label">${escHtml(GRAPH_METRICS[metric].axisLabel)}</text>
      ${gridlines}
      ${columns}
    </svg>
  `;
}

function wireGraphTooltip() {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip) return;

  document.querySelectorAll('.graph-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      tooltip.innerHTML = `
        <div class="graph-tooltip-row"><strong>${escHtml(dot.dataset.experiment)}</strong></div>
        <div class="graph-tooltip-row">${escHtml(dot.dataset.condition)}</div>
        <div class="graph-tooltip-row">${escHtml(dot.dataset.cell)}</div>
        <div class="graph-tooltip-row">Hand counts: ${escHtml(dot.dataset.counts)}</div>
        <div class="graph-tooltip-row">Auto counts: ${escHtml(dot.dataset.average)}</div>
        ${dot.dataset.metricKey === 'auto' ? '' : `<div class="graph-tooltip-row">${escHtml(dot.dataset.metric)}: ${escHtml(dot.dataset.plotted)}</div>`}
      `;
      tooltip.hidden = false;
    });
    dot.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY + 12}px`;
    });
    dot.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });

  document.querySelectorAll('.graph-mean-hit').forEach(hit => {
    hit.addEventListener('mouseenter', () => {
      tooltip.innerHTML = `
        <div class="graph-tooltip-row"><strong>${escHtml(hit.dataset.experiment)}</strong></div>
        <div class="graph-tooltip-row">${escHtml(hit.dataset.condition)}</div>
        <div class="graph-tooltip-row">Condition mean (${escHtml(hit.dataset.metric)}): ${escHtml(hit.dataset.mean)}</div>
      `;
      tooltip.hidden = false;
    });
    hit.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY + 12}px`;
    });
    hit.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });

  document.querySelectorAll('.graph-bar-hit').forEach(hit => {
    hit.addEventListener('mouseenter', () => {
      tooltip.innerHTML = `
        <div class="graph-tooltip-row"><strong>${escHtml(hit.dataset.experiment)}</strong></div>
        <div class="graph-tooltip-row">${escHtml(hit.dataset.condition)}</div>
        <div class="graph-tooltip-row">${escHtml(hit.dataset.metric)}: ${escHtml(hit.dataset.mean)} ± ${escHtml(hit.dataset.sd)}</div>
        <div class="graph-tooltip-row">n = ${escHtml(hit.dataset.n)}</div>
      `;
      tooltip.hidden = false;
    });
    hit.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY + 12}px`;
    });
    hit.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });

  document.querySelectorAll('.graph-box-hit').forEach(hit => {
    hit.addEventListener('mouseenter', () => {
      tooltip.innerHTML = `
        <div class="graph-tooltip-row"><strong>${escHtml(hit.dataset.experiment)}</strong></div>
        <div class="graph-tooltip-row">${escHtml(hit.dataset.condition)}</div>
        <div class="graph-tooltip-row">Max: ${escHtml(hit.dataset.max)}</div>
        <div class="graph-tooltip-row">Q3: ${escHtml(hit.dataset.q3)}</div>
        <div class="graph-tooltip-row">Median: ${escHtml(hit.dataset.median)}</div>
        <div class="graph-tooltip-row">Q1: ${escHtml(hit.dataset.q1)}</div>
        <div class="graph-tooltip-row">Min: ${escHtml(hit.dataset.min)}</div>
        <div class="graph-tooltip-row">n = ${escHtml(hit.dataset.n)}</div>
      `;
      tooltip.hidden = false;
    });
    hit.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY + 12}px`;
    });
    hit.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  });
}

function wireGraph(experiments) {
  const expSelect = document.getElementById('graph-experiment-select');
  const condSelect = document.getElementById('graph-condition-select');
  const addBtn = document.getElementById('graph-add-btn');
  const metricInputs = document.querySelectorAll('.graph-metric-input');
  const chartTypeInputs = document.querySelectorAll('.graph-charttype-input');

  // Behave like a single-choice group despite being checkboxes: checking one
  // unchecks the rest, and unchecking the active one snaps it back on so
  // exactly one metric is always selected.
  metricInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) {
        graphState.metric = input.value;
        metricInputs.forEach(other => { if (other !== input) other.checked = false; });
        refreshGraphChartArea();
      } else {
        input.checked = true;
      }
    });
  });

  // Same single-choice-of-N behavior as the metric checkboxes above.
  chartTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) {
        graphState.chartType = input.value;
        chartTypeInputs.forEach(other => { if (other !== input) other.checked = false; });
        refreshGraphChartArea();
      } else {
        input.checked = true;
      }
    });
  });

  async function loadConditionsFor(experimentId) {
    if (graphState.conditionsCache[experimentId]) return graphState.conditionsCache[experimentId];

    let conditions;
    if (localStorage.getItem('token')?.startsWith('local:')) {
      conditions = TEST_CONDITIONS[experimentId] || [];
    } else {
      try {
        conditions = await api(`/experiments/${experimentId}/conditions`);
      } catch {
        conditions = [];
      }
    }
    graphState.conditionsCache[experimentId] = conditions;
    return conditions;
  }

  expSelect.addEventListener('change', async () => {
    const expId = expSelect.value;
    graphState.selectedExperimentId = expId;
    condSelect.innerHTML = '<option value="">Loading…</option>';
    condSelect.disabled = true;
    addBtn.disabled = true;

    const conditions = await loadConditionsFor(expId);
    if (graphState.selectedExperimentId !== expId) return; // user switched experiments mid-fetch

    if (conditions.length === 0) {
      condSelect.innerHTML = '<option value="">No conditions</option>';
      return;
    }

    condSelect.innerHTML = `
      <option value="__all__">All conditions</option>
      ${conditions.map(c => `<option value="${escHtml(String(c.id))}">${escHtml(c.name)}</option>`).join('')}
    `;
    condSelect.disabled = false;
    addBtn.disabled = false;
  });

  addBtn.addEventListener('click', () => {
    const expId = graphState.selectedExperimentId;
    const exp = experiments.find(e => String(e.id) === String(expId));
    const conditions = graphState.conditionsCache[expId] || [];
    if (!exp || conditions.length === 0) return;

    const condValue = condSelect.value;
    const toAdd = condValue === '__all__' ? conditions : conditions.filter(c => String(c.id) === condValue);

    toAdd.forEach(cond => {
      const already = graphState.selected.some(s => String(s.conditionId) === String(cond.id));
      if (already) return;
      graphState.selected.push({
        conditionId: cond.id,
        conditionName: cond.name,
        conditionLabel: cond.name,
        experimentId: exp.id,
        experimentName: exp.name,
        experimentLabel: exp.name,
        cells: cond.cells || [],
      });
    });

    refreshGraphSelectedList();
    refreshGraphChartArea();
  });

  wireGraphSelectedList();
  wireGraphTitleRow();
  wireGraphTooltip();

  document.getElementById('graph-export-btn').addEventListener('click', downloadGraphImage);
}

// ---- Graph screen: image export ----
// The live chart's colors are all `var(--accent)` / `var(--series-N)` / etc.
// — inline on shapes and via .graph-* classes in style.css — which only
// resolve through the app shell's :root cascade. A cloned <svg> rasterized
// on its own (new Image()) is a separate document with no access to that
// cascade, so it needs its own literal copy of every custom property and
// .graph-* rule the chart depends on. Values below are hardcoded from the
// Paper (light) theme in style.css so an exported figure always renders on
// a plain white background regardless of which theme is active on screen.
const GRAPH_EXPORT_COLORS = {
  '--accent': 'oklch(0.56 0.10 45)',
  '--series-1': '#2a78d6', '--series-2': '#1baf7a', '--series-3': '#eda100', '--series-4': '#008300',
  '--series-5': '#4a3aa7', '--series-6': '#e34948', '--series-7': '#e87ba4', '--series-8': '#eb6834',
};

const GRAPH_EXPORT_SVG_STYLE = `
  :root {
    ${Object.entries(GRAPH_EXPORT_COLORS).map(([k, v]) => `${k}: ${v};`).join('\n    ')}
    --text-primary: oklch(0.2 0.02 75);
    --text-heading-fill: oklch(0.25 0.02 75);
    --text-secondary: oklch(0.5 0.03 75);
    --border-default: oklch(0.88 0.01 75);
  }
  text { font-family: 'IBM Plex Sans', 'IBM Plex Mono', sans-serif; }
  .graph-gridline { stroke: var(--border-default); stroke-width: 1; }
  .graph-axis-tick { font-family: 'IBM Plex Mono', monospace; font-size: 10px; fill: var(--text-secondary); }
  .graph-axis-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; fill: var(--text-secondary); }
  .graph-col-label { font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; font-weight: 600; fill: var(--text-heading-fill); }
  .graph-col-sublabel { font-family: 'IBM Plex Mono', monospace; font-size: 10px; fill: var(--text-secondary); }
  .graph-dot { opacity: 0.8; }
  .graph-mean-tick { stroke-width: 3; }
  .graph-mean-hit, .graph-bar-hit, .graph-box-hit { fill: transparent; }
  .graph-error-whisker { stroke: var(--text-primary); stroke-width: 2; }
  .graph-box { fill-opacity: 0.25; stroke-width: 2; }
  .graph-box-whisker { stroke-width: 2; }
  .graph-box-median { stroke-width: 3; }
`;

// Rebuilds the title + legend + chart as a fresh canvas drawing (not a DOM
// screenshot), so the pencil/edit-label icons — which only ever exist in the
// sidebar and title-row HTML, never in this drawing code — can't end up in
// the exported file.
async function downloadGraphImage() {
  const liveSvg = document.querySelector('#graph-chart-area .graph-scatter-svg');
  if (!liveSvg) return;

  const btn = document.getElementById('graph-export-btn');
  btn.disabled = true;
  try {
    const svgClone = liveSvg.cloneNode(true);
    svgClone.setAttribute('width', String(GRAPH_CHART_WIDTH));
    svgClone.setAttribute('height', String(GRAPH_CHART_HEIGHT));
    // The axis-label pencils are real elements inside the live chart SVG
    // (unlike the title pencil, which lives in separate title-row HTML) —
    // strip them from the clone so they never reach the rasterized export.
    svgClone.querySelectorAll('.graph-axis-edit-btn').forEach(el => el.remove());
    svgClone.insertAdjacentHTML('afterbegin',
      `<rect x="0" y="0" width="${GRAPH_CHART_WIDTH}" height="${GRAPH_CHART_HEIGHT}" fill="#ffffff"/><style>${GRAPH_EXPORT_SVG_STYLE}</style>`);
    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    await document.fonts.ready;
    const chartImg = new Image();
    await new Promise((resolve, reject) => {
      chartImg.onload = resolve;
      chartImg.onerror = reject;
      chartImg.src = svgDataUrl;
    });

    const distinctIds = [...new Set(graphState.selected.map(s => s.experimentId))];
    const legendItems = distinctIds.length > 1
      ? distinctIds.map(expId => ({
          label: graphState.selected.find(s => s.experimentId === expId).experimentLabel,
          color: seriesColorForExperiment(expId),
        }))
      : [];

    const pad = 24;
    const titleHeight = 36;
    const legendHeight = legendItems.length ? 28 : 0;
    const canvas = document.createElement('canvas');
    canvas.width = GRAPH_CHART_WIDTH + pad * 2;
    canvas.height = titleHeight + legendHeight + GRAPH_CHART_HEIGHT + pad * 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#3f3529';
    ctx.font = '600 20px "Newsreader", serif';
    ctx.fillText(graphState.title, pad, pad);

    let y = pad + titleHeight;
    if (legendItems.length) {
      ctx.font = '11px "IBM Plex Mono", monospace';
      let x = pad;
      legendItems.forEach(({ label, color }) => {
        const resolved = /^var\(/.test(color) ? GRAPH_EXPORT_COLORS[color.slice(4, -1)] : color;
        ctx.fillStyle = resolved;
        ctx.fillRect(x, y + 3, 10, 10);
        ctx.fillStyle = '#3f3529';
        const textWidth = ctx.measureText(label).width;
        ctx.fillText(label, x + 16, y);
        x += 16 + textWidth + 24;
      });
      y += legendHeight;
    }

    ctx.drawImage(chartImg, pad, y, GRAPH_CHART_WIDTH, GRAPH_CHART_HEIGHT);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graphState.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graph'}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
  }
}

// ---- Raw Data screen ----
// Long-format table: one row per count (not one row per cell), tagged with
// its type — "Count 1"/"Count 2"/"Count 3" for hand counts, or that
// algorithm's label for each auto count row the cell has (up to one per
// entry in AUTO_ALGORITHMS). Cells only ever have as many hand counts as
// have actually been taken (0-3), so pivoting wide into fixed Count-1/2/3
// columns left most rows partly blank; a row per recorded count means a
// row only exists when there's real data.
// Read-only — reuses the same endpoints Graph (Phase 9) already assumes
// (GET /experiments, GET /experiments/{id}/conditions), just fans out
// across *all* experiments instead of user-selected ones.

let rawDataState = null; // { rows, sortKey, sortDir, filterText }

const RAWDATA_COLUMNS = [
  { key: 'experimentName', label: 'Experiment' },
  { key: 'conditionName', label: 'Condition' },
  { key: 'cellName', label: 'Cell' },
  { key: 'countType', label: 'Count type' },
  { key: 'value', label: 'Value' },
  { key: 'average', label: 'Average' },
  { key: 'sourceFilename', label: 'Source file' },
];

// One row per condition — the same three metrics the Graph screen plots
// (see cellValueForMetric/conditionMeanForMetric), summarized here as a
// quick per-condition overview above the long-format table below.
const RAWDATA_SUMMARY_COLUMNS = [
  { key: 'experimentName', label: 'Experiment' },
  { key: 'conditionName', label: 'Condition' },
  { key: 'averageCount', label: 'Average count' },
  { key: 'averageAutoCount', label: 'Average auto count' },
  { key: 'averageHandCount', label: 'Average hand count' },
];

async function initRawData() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading raw data…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = currentProjectExperiments();
  }

  if (!experiments) {
    try {
      experiments = await api(`/projects/${state.project.id}/experiments`);
    } catch {
      content.innerHTML = '<div class="error-state">Could not load raw data. The API may not be reachable yet.</div>';
      return;
    }
  }

  let conditionsByExperiment;
  try {
    if (localStorage.getItem('token')?.startsWith('local:')) {
      conditionsByExperiment = experiments.map(exp => TEST_CONDITIONS[exp.id] || []);
    } else {
      // Sequential, not Promise.all — firing one request per experiment at
      // once burst-loads Render's free-tier instance (and re-validates the
      // auth token on each), which was intermittently 500ing under that
      // concurrent load on projects with several experiments.
      conditionsByExperiment = [];
      for (const exp of experiments) {
        conditionsByExperiment.push(await api(`/experiments/${exp.id}/conditions`));
      }
    }
  } catch {
    content.innerHTML = '<div class="error-state">Could not load raw data. The API may not be reachable yet.</div>';
    return;
  }

  const rows = [];
  experiments.forEach((exp, i) => {
    (conditionsByExperiment[i] || []).forEach(cond => {
      (cond.cells || []).forEach(cell => {
        const base = {
          experimentName: exp.name,
          conditionName: cond.name,
          cellName: cell.name,
          average: cellAverage(cell),
          sourceFilename: cell.source_filename || null,
        };
        const counts = handCounts(cell);
        if (counts.length === 0) {
          rows.push({ ...base, countType: 'No counts yet', value: null });
        } else {
          counts.forEach((count, idx) => {
            rows.push({ ...base, countType: `Count ${idx + 1}`, value: count.value });
          });
        }
        cellAutoCounts(cell).forEach(row => {
          rows.push({ ...base, countType: autoAlgorithmLabel(row.type), value: row.value });
        });
      });
    });
  });

  const summaryRows = [];
  experiments.forEach((exp, i) => {
    (conditionsByExperiment[i] || []).forEach(cond => {
      summaryRows.push({
        experimentName: exp.name,
        conditionName: cond.name,
        averageCount: conditionMeanForMetric(cond, 'combined'),
        averageAutoCount: conditionMeanForMetric(cond, 'auto'),
        averageHandCount: conditionMeanForMetric(cond, 'hand'),
      });
    });
  });

  rawDataState = { rows, summaryRows, sortKey: null, sortDir: 'asc', filterText: '' };
  content.innerHTML = renderRawDataHTML();
  wireRawData();
}

function rawDataSortValue(row, key) {
  switch (key) {
    case 'experimentName': return row.experimentName;
    case 'conditionName': return row.conditionName;
    case 'cellName': return row.cellName;
    case 'countType': return row.countType;
    case 'value': return row.value;
    case 'average': return row.average;
    case 'sourceFilename': return row.sourceFilename;
    default: return null;
  }
}

function visibleRawDataRows() {
  const { rows, sortKey, sortDir, filterText } = rawDataState;
  const needle = filterText.trim().toLowerCase();

  let filtered = rows;
  if (needle) {
    filtered = rows.filter(r =>
      r.experimentName.toLowerCase().includes(needle) ||
      r.conditionName.toLowerCase().includes(needle) ||
      r.cellName.toLowerCase().includes(needle)
    );
  }

  if (!sortKey) return filtered;

  return filtered.slice().sort((a, b) => {
    const av = rawDataSortValue(a, sortKey);
    const bv = rawDataSortValue(b, sortKey);
    // Missing values always sort to the bottom, regardless of direction.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function renderRawDataSummaryRowsHTML() {
  const { summaryRows } = rawDataState;
  if (summaryRows.length === 0) {
    return `<tr><td class="rawdata-empty" colspan="${RAWDATA_SUMMARY_COLUMNS.length}">No conditions recorded yet.</td></tr>`;
  }

  return summaryRows.map(row => `
    <tr>
      <td>${escHtml(row.experimentName)}</td>
      <td>${escHtml(row.conditionName)}</td>
      <td>${row.averageCount != null ? row.averageCount.toFixed(1) : '—'}</td>
      <td>${row.averageAutoCount != null ? row.averageAutoCount.toFixed(1) : '—'}</td>
      <td>${row.averageHandCount != null ? row.averageHandCount.toFixed(1) : '—'}</td>
    </tr>
  `).join('');
}

function renderRawDataSummaryHTML() {
  return `
    <div class="rawdata-summary">
      <div class="rawdata-summary-header">
        <h3 class="rawdata-section-title">Summary</h3>
        <button type="button" class="rawdata-export-btn" id="rawdata-summary-export">Export CSV</button>
      </div>
      <div class="rawdata-table-wrap rawdata-summary-wrap">
        <table class="rawdata-table">
          <thead>
            <tr>${RAWDATA_SUMMARY_COLUMNS.map(col => `<th>${escHtml(col.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>${renderRawDataSummaryRowsHTML()}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRawDataHTML() {
  return `
    <div class="rawdata-screen">
      ${renderRawDataSummaryHTML()}
      <div class="rawdata-detail">
        <h3 class="rawdata-section-title">Raw data</h3>
        <div class="rawdata-toolbar">
          <input type="text" class="rawdata-filter" id="rawdata-filter"
                 placeholder="Filter by experiment, condition, or cell…"
                 value="${escHtml(rawDataState.filterText)}">
          <button type="button" class="rawdata-export-btn" id="rawdata-export">Export CSV</button>
        </div>
        <div class="rawdata-table-wrap">
          <table class="rawdata-table">
            <thead>
              <tr>${RAWDATA_COLUMNS.map(renderRawDataHeaderCellHTML).join('')}</tr>
            </thead>
            <tbody id="rawdata-tbody">${renderRawDataRowsHTML()}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// Both arrows show (muted) until this column is the active sort, at which
// point only the arrow matching the current direction remains (accented).
function rawDataSortArrowsHTML(col) {
  const active = rawDataState.sortKey === col.key;
  const showUp = !active || rawDataState.sortDir === 'asc';
  const showDown = !active || rawDataState.sortDir === 'desc';
  const arrowClass = active ? 'rawdata-sort-arrow active' : 'rawdata-sort-arrow';
  return `<span class="rawdata-sort-arrows">${showUp ? `<span class="${arrowClass}">▲</span>` : ''}${showDown ? `<span class="${arrowClass}">▼</span>` : ''}</span>`;
}

function renderRawDataHeaderCellHTML(col) {
  return `<th class="rawdata-th-sortable" data-sort-key="${col.key}" role="button" tabindex="0">${escHtml(col.label)}${rawDataSortArrowsHTML(col)}</th>`;
}

function renderRawDataRowsHTML() {
  if (rawDataState.rows.length === 0) {
    return `<tr><td class="rawdata-empty" colspan="${RAWDATA_COLUMNS.length}">No cells recorded yet.</td></tr>`;
  }

  const visible = visibleRawDataRows();
  if (visible.length === 0) {
    return `<tr><td class="rawdata-empty" colspan="${RAWDATA_COLUMNS.length}">No rows match your filter.</td></tr>`;
  }

  return visible.map(row => `
    <tr>
      <td>${escHtml(row.experimentName)}</td>
      <td>${escHtml(row.conditionName)}</td>
      <td>${escHtml(row.cellName)}</td>
      <td>${escHtml(row.countType)}</td>
      <td>${row.value != null ? row.value : '—'}</td>
      <td>${row.average != null ? `<span class="rawdata-average">${row.average.toFixed(1)}</span>` : '—'}</td>
      <td>${row.sourceFilename ? escHtml(row.sourceFilename) : '—'}</td>
    </tr>
  `).join('');
}

function refreshRawDataTable() {
  document.getElementById('rawdata-tbody').innerHTML = renderRawDataRowsHTML();
  document.querySelectorAll('.rawdata-th-sortable').forEach(th => {
    const col = RAWDATA_COLUMNS.find(c => c.key === th.dataset.sortKey);
    th.innerHTML = escHtml(col.label) + rawDataSortArrowsHTML(col);
  });
}

// Quotes any field containing a comma, quote, or newline; doubles embedded quotes.
function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rawDataToCSV(rows) {
  const lines = [RAWDATA_COLUMNS.map(col => csvField(col.label)).join(',')];
  rows.forEach(row => {
    lines.push(RAWDATA_COLUMNS.map(col => csvField(rawDataSortValue(row, col.key))).join(','));
  });
  return lines.join('\r\n');
}

function downloadRawDataCSV() {
  const csv = rawDataToCSV(visibleRawDataRows());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raw-data-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function rawDataSummaryToCSV(rows) {
  const lines = [RAWDATA_SUMMARY_COLUMNS.map(col => csvField(col.label)).join(',')];
  rows.forEach(row => {
    lines.push(RAWDATA_SUMMARY_COLUMNS.map(col => {
      const v = row[col.key];
      return csvField(typeof v === 'number' ? v.toFixed(1) : v);
    }).join(','));
  });
  return lines.join('\r\n');
}

function downloadRawDataSummaryCSV() {
  const csv = rawDataSummaryToCSV(rawDataState.summaryRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raw-data-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireRawData() {
  document.getElementById('rawdata-filter').addEventListener('input', (e) => {
    rawDataState.filterText = e.target.value;
    refreshRawDataTable();
  });

  document.getElementById('rawdata-export').addEventListener('click', downloadRawDataCSV);
  document.getElementById('rawdata-summary-export').addEventListener('click', downloadRawDataSummaryCSV);

  function toggleSort(key) {
    if (rawDataState.sortKey === key) {
      rawDataState.sortDir = rawDataState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      rawDataState.sortKey = key;
      rawDataState.sortDir = 'asc';
    }
    refreshRawDataTable();
  }

  document.querySelectorAll('.rawdata-th-sortable').forEach(th => {
    th.addEventListener('click', () => toggleSort(th.dataset.sortKey));
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSort(th.dataset.sortKey);
      }
    });
  });
}

// Boot
// Supabase auth-link redirects (password recovery, signup confirmation) land
// here with the session in the URL hash rather than a route — check for that
// before falling back to the normal logged-in/logged-out boot.
(function boot() {
  document.title = CONFIG.appTitle;
  applyTheme(localStorage.getItem('theme') || CONFIG.theme);
  initPreviewGuard();

  const hashParams = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)).entries());
  if (hashParams.access_token) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (hashParams.type === 'recovery') {
      renderResetPassword(hashParams.access_token);
    } else {
      localStorage.setItem('token', hashParams.access_token);
      navigate('home');
    }
    return;
  }
  navigate(localStorage.getItem('token') ? 'home' : 'login');
})();
