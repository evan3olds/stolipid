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

// Runtime-configurable props (see CLAUDE.md / PRD §10). appTitle and
// prototypeBadge are developer-set constants; theme has a user-facing
// toggle (top bar) and persists to localStorage, overriding this default.
const CONFIG = {
  appTitle: 'Lipid Counter',
  prototypeBadge: true,
  theme: 'paper',
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

// Static Help screen content — one card per workflow step (PRD 5.9)
const HELP_CONTENT = [
  {
    title: 'Experiments',
    body: 'An experiment is the top-level folder for one experimental run (e.g. a serum starvation timecourse). Click "Add experiment" to record its name, date, dye, and notes. Open an experiment to see its conditions.',
  },
  {
    title: 'Conditions',
    body: 'A condition is a treatment group within an experiment (e.g. "6 Hr Starved"). Dye is set once at the experiment level and shown here for reference; each condition tracks its own starvation length, and shows an ICC score once its cells have hand counts — ICC measures how well the hand counts agree with each other.',
  },
  {
    title: 'Cells & Add Photos',
    body: 'Use "Add photos" to upload .tif microscopy images and draw a box around each cell you want to track. One cell record is created per box. From a cell’s detail panel, run "Standard" or "FM_edge_overlay (ALDQ)" under Auto count to get an automatic droplet count suggestion — this is not a hand count and does not factor into the average or ICC.',
  },
  {
    title: 'Counting',
    body: 'Open a cell and click "Add Hand Count" to record a blind hand count. Click anywhere on the image to place a marker on a droplet, or click a marker to remove it. Use the zoom controls to separate small, closely-clustered droplets. Each cell supports up to three hand counts.',
  },
  {
    title: 'Graph',
    body: 'Pick an experiment and condition (or "All conditions") in the sidebar and add it to the chart to compare auto counts visually. Each dot is one cell; the bar marks the condition mean. Hover a dot for the full breakdown, including hand counts.',
  },
  {
    title: 'Raw data',
    body: 'A flat table of every cell across every experiment and condition, including all three hand counts, the average, the auto count, and the source .tif filename. Click a column header to sort, or use the filter box to search by name.',
  },
  {
    title: 'Reliability (ICC)',
    body: 'ICC (Intraclass Correlation Coefficient) quantifies agreement across a condition\'s hand counts — higher is better. It is computed automatically whenever hand counts are added or removed, so counting a cell a second or third time will update it.',
  },
];

// Static About screen content (PRD 5.10). `links` starts empty — populate
// with citation/protocol/lab documentation entries as they become available.
const ABOUT_CONTENT = {
  purpose: 'Lipid Counter turns manual lipid droplet hand counts from fluorescence microscopy into reproducible, comparable figures. It replaces scattered spreadsheets and folders of unlabeled images with a structured hierarchy: Experiments → Conditions → Cells → Counts.',
  origin: 'Built for biology researchers and students at St. Olaf College quantifying cellular lipid accumulation (BODIPY, Nile Red staining) under different experimental treatments, where the previous process had no link between counts and source images and no way to check inter-rater reliability.',
  status: 'Working prototype. Core workflow (experiments, conditions, cells, hand counting, auto-count suggestions, graphing, and raw data export) is functional; see the Prototype badge in the top bar.',
  links: [],
};

// Navigation state — persists across the authenticated shell
const state = {
  screen: 'login',
  experiment: null,        // { id, name }
  condition: null,         // { id, name }
  cell: null,              // { id, name }
  editingCount: null,      // { id, points } when reopening a saved hand count for edit, else null
  viewingAutoPoints: null, // points[] when read-only viewing a cell's auto-count grid, else null
  viewingAllCounts: null,  // counts[] when read-only viewing every hand count's grid overlaid, else null
};

// Per-screen chrome metadata: subheader title, primary action label, back button
const SCREENS = {
  experiments: { title: 'Experiments', action: 'Add experiment' },
  conditions:  { title: 'Conditions',  action: 'New slide',    back: true },
  cells:       { title: 'Cells',       action: 'Add photos',   back: true },
  graph:       { title: 'Graph' },
  rawdata:     { title: 'Raw data' },
  about:       { title: 'About' },
  help:        { title: 'Help' },
  count:       { title: 'Count' },
  addphotos:   { title: 'Add Photos' },
};

// Sidebar drawer destinations
const NAV_LINKS = [
  { screen: 'experiments', label: 'Experiments' },
  { screen: 'graph',       label: 'Graph' },
  { screen: 'rawdata',     label: 'Raw data' },
  { screen: 'about',       label: 'About' },
  { screen: 'help',        label: 'Help' },
];

// Screen router
function navigate(screen, params = {}) {
  state.screen = screen;
  if ('experiment' in params) state.experiment = params.experiment;
  if ('condition' in params) state.condition = params.condition;
  if ('cell' in params) state.cell = params.cell;
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
  renderShell(screen);
  if (screen === 'experiments') initExperiments();
  if (screen === 'conditions') initConditions();
  if (screen === 'cells') initCells();
  if (screen === 'graph') initGraph();
  if (screen === 'rawdata') initRawData();
  if (screen === 'about') initAbout();
  if (screen === 'help') initHelp();
}

function initHelp() {
  document.querySelector('.content').innerHTML = renderHelpHTML();
}

function renderHelpHTML() {
  return `
    <div class="help-grid">
      ${HELP_CONTENT.map(card => `
        <div class="help-card">
          <h3 class="help-card-title">${card.title}</h3>
          <p class="help-card-body">${card.body}</p>
        </div>
      `).join('')}
    </div>
  `;
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
    </div>
  `;
}

// mode: 'login' | 'signup' | 'forgot'
function renderLogin(mode = 'login') {
  const copy = {
    login:  { submit: 'Log in',        error: 'Login failed. Check your email and password.' },
    signup: { submit: 'Create account', error: 'Could not create account.' },
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
          <input id="login-password" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required>
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
      </form>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const messageEl = document.getElementById('login-message');

  if (mode === 'login') {
    document.getElementById('login-forgot-link').addEventListener('click', () => renderLogin('forgot'));
    document.getElementById('login-signup-link').addEventListener('click', () => renderLogin('signup'));
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
          navigate('experiments');
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
        navigate('experiments');
      } catch (err) {
        errorEl.textContent = copy.error;
        messageEl.textContent = '';
      } finally {
        clearTimeout(bootTimer);
      }
      return;
    }

    if (mode === 'signup') {
      try {
        const result = await api('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if (result.token) {
          localStorage.setItem('token', result.token);
          navigate('experiments');
        } else {
          messageEl.textContent = 'Check your email to confirm your account, then log in.';
        }
      } catch (err) {
        errorEl.textContent = copy.error;
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
      navigate('experiments');
    } catch (err) {
      errorEl.textContent = 'Could not set new password. The reset link may have expired — request a new one.';
    }
  });
}

// ---- Authenticated shell (top bar + sidebar + subheader + content) ----

let escHandler = null; // tracked so we can detach it before each re-render
let profileMenuDocHandler = null; // ditto, for the profile dropdown's outside-click close

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

function renderShell(screen) {
  const meta = SCREENS[screen] || {};
  app.innerHTML = `
    <div class="shell">
      ${topbarHTML()}
      ${subheaderHTML(screen, meta)}
      <main class="content">${screenStub(screen, meta)}</main>
      ${sidebarHTML()}
    </div>
  `;
  wireShell(screen);
}

function topbarHTML() {
  const theme = document.documentElement.dataset.theme === 'sage' ? 'sage' : 'paper';
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="hamburger" id="hamburger" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
        <span class="topbar-title">${CONFIG.appTitle}</span>
        ${CONFIG.prototypeBadge ? '<span class="badge">Prototype</span>' : ''}
      </div>
      <div class="topbar-right">
        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme" title="Switch theme">
          <span class="theme-toggle-dot"></span>${theme === 'sage' ? 'Sage' : 'Paper'}
        </button>
        <div class="profile-menu">
          <button type="button" class="profile-btn" id="profile-btn" aria-label="Account menu" aria-haspopup="true" aria-expanded="false" title="${escHtml(currentUser())}">
            <img class="profile-avatar" src="assets/DefaultProfile.png" alt="">
          </button>
          <div class="profile-dropdown" id="profile-dropdown">
            <div class="profile-dropdown-user">${escHtml(currentUserName())}</div>
            <button type="button" class="profile-dropdown-item" id="profile-logout">Log out</button>
          </div>
        </div>
      </div>
    </header>
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

// Breadcrumb reflects the experiment → condition hierarchy for folder screens,
// and is a single label for the flat screens (Graph, Raw data, About, Help).
function breadcrumbHTML(screen) {
  const crumbs = [];
  if (['experiments', 'conditions', 'cells'].includes(screen)) {
    crumbs.push({ label: 'Experiments', target: 'experiments' });
    if (screen === 'conditions' || screen === 'cells') {
      crumbs.push({ label: state.experiment?.name || 'Experiment', target: 'conditions' });
    }
    if (screen === 'cells') {
      crumbs.push({ label: state.condition?.name || 'Condition', target: 'cells' });
    }
  } else {
    crumbs.push({ label: SCREENS[screen]?.title || screen, target: screen });
  }
  return crumbs
    .map((c, i) => {
      const last = i === crumbs.length - 1;
      return last
        ? `<span class="crumb crumb-current">${c.label}</span>`
        : `<button class="crumb" data-target="${c.target}">${c.label}</button>`;
    })
    .join('<span class="crumb-sep">/</span>');
}

function sidebarHTML() {
  return `
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">Menu</div>
      <nav class="sidebar-nav">
        ${NAV_LINKS.map(l =>
          `<button class="sidebar-link${l.screen === state.screen ? ' active' : ''}" data-screen="${l.screen}">${l.label}</button>`
        ).join('')}
      </nav>
    </aside>
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

function wireShell(screen) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const openSidebar = () => { sidebar.classList.add('open'); backdrop.classList.add('open'); };
  const closeSidebar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };

  document.getElementById('hamburger').addEventListener('click', openSidebar);
  backdrop.addEventListener('click', closeSidebar);

  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'sage' ? 'paper' : 'sage';
    applyTheme(next);
    themeToggle.innerHTML = `<span class="theme-toggle-dot"></span>${next === 'sage' ? 'Sage' : 'Paper'}`;
  });

  // Esc closes the drawer. The listener lives on document, so detach the
  // previous render's handler before attaching this one.
  if (escHandler) document.removeEventListener('keydown', escHandler);
  escHandler = (e) => { if (e.key === 'Escape') closeSidebar(); };
  document.addEventListener('keydown', escHandler);

  sidebar.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.addEventListener('click', () => {
      closeSidebar();
      navigate(btn.dataset.screen);
    });
  });

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

  document.getElementById('profile-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    navigate('login');
  });

  document.querySelectorAll('.breadcrumb .crumb[data-target]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.target));
  });

  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigate(screen === 'cells' ? 'conditions' : 'experiments');
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

const TEST_CONDITIONS = {
  'test-exp-001': [
    {
      id: 'test-cond-001',
      name: '0 Hr Starved',
      starvation: 0,
      notes: 'Baseline, fed condition.',
      icc: 0.88,
      cells: [
        { id: 'test-cell-001', name: 'Cell 1', counts: [], auto_counts: {
          otsu_watershed: { count: 3, points: [{ x: 22, y: 30 }, { x: 58, y: 45 }, { x: 71, y: 68 }] },
          fm_edge_overlay: { count: 4, points: [{ x: 20, y: 28 }, { x: 40, y: 44 }, { x: 60, y: 46 }, { x: 72, y: 66 }] },
        }, source_filename: 'Image_43391.tif' },
        { id: 'test-cell-002', name: 'Cell 2', counts: [{ id: 'test-cnt-002-1', value: 4 }] },
        { id: 'test-cell-003', name: 'Cell 3', counts: [
          { id: 'test-cnt-003-1', value: 3, points: [{ x: 16, y: 22 }, { x: 34, y: 51 }, { x: 69, y: 61 }] },
          { id: 'test-cnt-003-2', value: 2, points: [{ x: 20, y: 25 }, { x: 53, y: 29 }] },
        ], auto_counts: {
          fm_edge_overlay: { count: 5, points: [{ x: 15, y: 20 }, { x: 33, y: 50 }, { x: 52, y: 28 }, { x: 68, y: 60 }, { x: 82, y: 40 }] },
        }, source_filename: 'Image_43391.tif' },
        { id: 'test-cell-011', name: 'Cell 4', counts: [
          { id: 'test-cnt-011-1', value: 3, points: [{ x: 25, y: 30 }, { x: 50, y: 45 }, { x: 70, y: 65 }] },
          { id: 'test-cnt-011-2', value: 4, points: [{ x: 27, y: 33 }, { x: 48, y: 42 }, { x: 65, y: 60 }, { x: 80, y: 35 }] },
          { id: 'test-cnt-011-3', value: 3, points: [{ x: 30, y: 28 }, { x: 52, y: 48 }, { x: 72, y: 62 }] },
        ] },
      ],
    },
    {
      id: 'test-cond-002',
      name: '6 Hr Starved',
      starvation: 6,
      notes: '',
      icc: 0.93,
      cells: [
        { id: 'test-cell-004', name: 'Cell 1', counts: [{ id: 'test-cnt-004-1', value: 6 }, { id: 'test-cnt-004-2', value: 6 }, { id: 'test-cnt-004-3', value: 7 }] },
        { id: 'test-cell-005', name: 'Cell 2', counts: [{ id: 'test-cnt-005-1', value: 7 }, { id: 'test-cnt-005-2', value: 8 }, { id: 'test-cnt-005-3', value: 7 }] },
        { id: 'test-cell-006', name: 'Cell 3', counts: [{ id: 'test-cnt-006-1', value: 6 }, { id: 'test-cnt-006-2', value: 6 }, { id: 'test-cnt-006-3', value: 6 }] },
        { id: 'test-cell-007', name: 'Cell 4', counts: [{ id: 'test-cnt-007-1', value: 7 }, { id: 'test-cnt-007-2', value: 7 }, { id: 'test-cnt-007-3', value: 7 }] },
      ],
    },
    {
      id: 'test-cond-003',
      name: '24 Hr Starved',
      starvation: 24,
      notes: 'High variance between raters on Cell 2.',
      icc: 0.61,
      cells: [
        { id: 'test-cell-008', name: 'Cell 1', counts: [{ id: 'test-cnt-008-1', value: 9 }, { id: 'test-cnt-008-2', value: 9 }, { id: 'test-cnt-008-3', value: 10 }] },
        { id: 'test-cell-009', name: 'Cell 2', counts: [{ id: 'test-cnt-009-1', value: 8 }, { id: 'test-cnt-009-2', value: 14 }, { id: 'test-cnt-009-3', value: 15 }] },
        { id: 'test-cell-010', name: 'Cell 3', counts: [{ id: 'test-cnt-010-1', value: 7 }, { id: 'test-cnt-010-2', value: 8 }] },
      ],
    },
  ],
  'test-exp-002': [
    {
      id: 'test-cond-004',
      name: 'Untreated',
      starvation: null,
      notes: '',
      icc: 0.79,
      cells: [
        { id: 'test-cell-012', name: 'Cell 1', counts: [{ id: 'test-cnt-012-1', value: 5 }, { id: 'test-cnt-012-2', value: 4 }] },
        { id: 'test-cell-013', name: 'Cell 2', counts: [{ id: 'test-cnt-013-1', value: 6 }, { id: 'test-cnt-013-2', value: 5 }, { id: 'test-cnt-013-3', value: 6 }] },
      ],
    },
    {
      id: 'test-cond-005',
      name: 'Oleic Acid 24hr',
      starvation: null,
      notes: 'Robust droplet accumulation observed across all cells.',
      icc: 0.95,
      cells: [
        { id: 'test-cell-014', name: 'Cell 1', counts: [{ id: 'test-cnt-014-1', value: 18 }, { id: 'test-cnt-014-2', value: 17 }, { id: 'test-cnt-014-3', value: 19 }] },
        { id: 'test-cell-015', name: 'Cell 2', counts: [{ id: 'test-cnt-015-1', value: 21 }, { id: 'test-cnt-015-2', value: 20 }] },
      ],
    },
  ],
};

// ---- Card menu (three-dot edit/remove, shared by experiments/conditions/cells) ----

function cardMenuHTML(id) {
  const safeId = escHtml(String(id));
  return `
    <div class="card-menu">
      <button type="button" class="card-menu-btn" data-id="${safeId}" aria-label="More options" aria-haspopup="true" aria-expanded="false">&#8942;</button>
      <div class="card-menu-dropdown" data-id="${safeId}">
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
// a new one is attached, mirroring the escHandler pattern in wireShell.
let cardMenuDocHandler = null;

function wireCardMenus(grid, { onEdit, onRemove }) {
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

async function initExperiments() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading experiments…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = TEST_EXPERIMENTS;
  }

  if (!experiments) {
    try {
      experiments = await api('/experiments');
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
        const condCount = exp.condition_count ?? 0;
        const condLabel = `${condCount} condition${condCount !== 1 ? 's' : ''}`;
        return `
          <div class="folder-card" data-id="${escHtml(String(exp.id))}" role="button" tabindex="0">
            ${cardMenuHTML(exp.id)}
            <div class="folder-name">${escHtml(exp.name)}</div>
            <div class="folder-meta">
              ${exp.dye ? `<span class="folder-meta-item">${escHtml(exp.dye)}</span>` : ''}
              <span class="folder-meta-item">${condLabel}</span>
              ${exp.date ? `<span class="folder-meta-item">${formatDate(exp.date)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel" id="detail-panel" aria-label="Experiment details"></aside>
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

  wireCardMenus(grid, {
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
    const idx = TEST_EXPERIMENTS.findIndex(e => String(e.id) === String(id));
    if (idx !== -1) TEST_EXPERIMENTS.splice(idx, 1);
    delete TEST_CONDITIONS[id];
  } else {
    await api(`/experiments/${id}`, { method: 'DELETE' });
  }
  initExperiments();
}

function wireExperimentsAction() {
  const actionBtn = document.getElementById('primary-action');
  if (actionBtn) {
    actionBtn.addEventListener('click', () => openAddExperimentModal(() => initExperiments()));
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
          <input id="modal-name" type="text" required autocomplete="off">
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
      await api('/experiments', {
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

// cell.average is derived from hand counts, never stored (per data model)
function cellAverage(cell) {
  const counts = cell.counts || [];
  if (!counts.length) return null;
  return counts.reduce((sum, c) => sum + c.value, 0) / counts.length;
}

// A cell can carry up to one auto-count per algorithm (cell.auto_counts is
// keyed by algorithm id, e.g. { otsu_watershed: { count, points }, ... }).
// Graph screen defaults to plotting the machine-suggested auto count per
// cell (averaged across whichever algorithms have been run) but lets the
// user switch to hand-count or combined via the metric selector — see
// cellValueForMetric/conditionMeanForMetric below.
function cellAutoCount(cell) {
  const results = Object.values(cell.auto_counts || {});
  if (!results.length) return null;
  return results.reduce((sum, r) => sum + r.count, 0) / results.length;
}

// Display labels for cells.auto_counts keys, matching the Cells screen's
// auto-count run-button text so a cell's detail panel reads the same name
// the researcher picked when they ran auto-count.
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
    ? '<p class="empty-state">No conditions yet. Click "New slide" to create one.</p>'
    : conditions.map(cond => {
        const cellCount = (cond.cells || []).length;
        return `
          <div class="folder-card" data-id="${escHtml(String(cond.id))}" role="button" tabindex="0">
            ${cardMenuHTML(cond.id)}
            <div class="folder-name">${escHtml(cond.name)}</div>
            <div class="folder-meta">
              ${cond.starvation != null ? `<span class="folder-meta-item">${cond.starvation} hr</span>` : ''}
              <span class="folder-meta-item">${cellCount} cell${cellCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel" id="detail-panel" aria-label="Condition details"></aside>
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
        <span class="detail-label">Starvation</span>
        <span class="detail-value">${cond.starvation != null ? `${cond.starvation} hr` : '—'}</span>
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

  wireCardMenus(grid, {
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
    actionBtn.addEventListener('click', () => openAddConditionModal(() => initConditions()));
  }
}

function openAddConditionModal(onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">New slide</div>
      <form class="modal-form" id="modal-form">
        <div class="modal-field">
          <label for="modal-name">Name</label>
          <input id="modal-name" type="text" required autocomplete="off">
        </div>
        <div class="modal-field">
          <label for="modal-starvation">Starvation length (hours)</label>
          <input id="modal-starvation" type="number" min="0" step="1">
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

    const starvationVal = document.getElementById('modal-starvation').value;

    try {
      await api(`/experiments/${state.experiment.id}/conditions`, {
        method: 'POST',
        body: JSON.stringify({
          name:       document.getElementById('modal-name').value,
          starvation: starvationVal === '' ? null : Number(starvationVal),
          notes:      document.getElementById('modal-notes').value,
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
        </div>
        <div class="modal-field">
          <label for="modal-starvation">Starvation length (hours)</label>
          <input id="modal-starvation" type="number" min="0" step="1" value="${cond.starvation != null ? escHtml(String(cond.starvation)) : ''}">
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

    const starvationVal = document.getElementById('modal-starvation').value;
    const updated = {
      name:       document.getElementById('modal-name').value,
      starvation: starvationVal === '' ? null : Number(starvationVal),
      notes:      document.getElementById('modal-notes').value,
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
  const n = (cell.counts || []).length;
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
        const tier = (cell.counts || []).length === 0 ? 'needs' : 'counted';
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
      <aside class="detail-panel detail-panel--large" id="detail-panel" aria-label="Cell details"></aside>
    </div>
  `;
}

function wireCells(cells) {
  const grid = document.getElementById('folder-grid');
  const panel = document.getElementById('detail-panel');

  function renderDetail(cell) {
    const avg = cellAverage(cell);
    const counts = cell.counts || [];
    const needsMore = counts.length < 3;

    const preview = cell.image_url
      ? `<img class="detail-thumb-img" src="${escHtml(cell.image_url)}" alt="Low-res preview of ${escHtml(cell.name)}">`
      : renderCellThumbnailSVG(cell);

    panel.innerHTML = `
      <div class="detail-name">${escHtml(cell.name)}</div>
      <div class="detail-thumbnail">${preview}</div>
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
      <div class="detail-row">
        <span class="detail-label">Auto count</span>
        ${AUTO_ALGORITHMS.filter(algo => (cell.auto_counts || {})[algo]).map(algo => {
          const result = cell.auto_counts[algo];
          return `
            <ul class="count-list">
              <li class="count-list-item">
                <span class="count-value">${result.count}</span>
                <span class="count-actions">
                  <button class="count-edit-btn auto-count-view-btn" data-algorithm="${algo}" aria-label="View ${escHtml(autoAlgorithmLabel(algo))} auto count grid">View</button>
                </span>
              </li>
            </ul>
            <span class="detail-submeta">Model: ${escHtml(autoAlgorithmLabel(algo))}</span>
          `;
        }).join('')}
        ${(() => {
          const pending = AUTO_ALGORITHMS.filter(algo => !(cell.auto_counts || {})[algo]);
          return pending.length ? `
            <div class="auto-count-run">
              ${pending.map(algo => `<button class="auto-count-run-btn" data-algorithm="${algo}">${escHtml(autoAlgorithmLabel(algo))}</button>`).join('')}
            </div>
          ` : '';
        })()}
      </div>
      <div class="detail-row">
        <span class="detail-label">Hand counts</span>
        ${counts.length === 0
          ? '<span class="detail-value">No counts yet.</span>'
          : `<ul class="count-list">${counts.map(c => `
              <li class="count-list-item">
                <span class="count-value">${c.value}</span>
                <span class="count-actions">
                  <button class="count-edit-btn" data-count-id="${escHtml(String(c.id))}" aria-label="Edit count">Edit</button>
                  <button class="count-delete-btn" data-count-id="${escHtml(String(c.id))}" aria-label="Delete count">&times;</button>
                </span>
              </li>
            `).join('')}</ul>`}
      </div>
      ${needsMore ? '<button class="count-cta-btn" id="count-cta">Add Hand Count</button>' : ''}
      ${(counts.length > 0 || Object.keys(cell.auto_counts || {}).length > 0) ? '<button class="count-viewall-btn" id="counts-viewall-btn">View all counts</button>' : ''}
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

    panel.querySelectorAll('.count-edit-btn').forEach(btn => {
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
        navigate('count', {
          cell: { id: cell.id, name: cell.name, image_url: cell.image_url },
          viewingAutoPoints: (cell.auto_counts?.[algo]?.points) || [],
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
            autoResults: AUTO_ALGORITHMS
              .filter(algo => (cell.auto_counts || {})[algo])
              .map(algo => ({ algorithm: algo, points: cell.auto_counts[algo].points || [] })),
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
    const tier = (cell.counts || []).length === 0 ? 'needs' : 'counted';
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
      if (localStorage.getItem('token')?.startsWith('local:')) {
        // No local Python pipeline to call — fabricate a plausible result
        // the same way the placeholder thumbnail fabricates droplets.
        const rand = seededRandom(hashStringToInt(String(cell.id) + algorithm));
        const count = 3 + Math.floor(rand() * 6);
        const points = Array.from({ length: count }).map(() => ({
          x: Math.round(rand() * 90 + 5),
          y: Math.round(rand() * 90 + 5),
        }));
        // Merge into whichever algorithm results the cell already has —
        // running the other model must not clobber this one, so a cell can
        // carry up to one result per entry in AUTO_ALGORITHMS at once.
        cell.auto_counts = { ...(cell.auto_counts || {}), [algorithm]: { count, points } };
      } else {
        const updated = await api(`/cells/${cell.id}/auto-count`, {
          method: 'PUT',
          body: JSON.stringify({ algorithm }),
        });
        cell.auto_counts = updated.auto_counts;
      }
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
    actionBtn.addEventListener('click', () => navigate('addphotos'));
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
          <div class="addphotos-instructions">Click anywhere on the image to box a cell.</div>
        </div>
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
          ? '<div class="addphotos-empty"><p>No photos yet.</p><button class="detail-open-btn" id="addphotos-choose">Choose .tif files</button></div>'
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

// One color per possible cells.auto_counts entry (see AUTO_ALGORITHMS), so
// both a Standard and an FM_edge_overlay (ALDQ) auto-count grid can be told
// apart when "View all counts" overlays them together.
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
    // "View all counts" overlays every saved hand count's grid plus the
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

  const image = cell.image_url
    ? `<img class="photo-preview-img" src="${escHtml(cell.image_url)}" alt="Processed fluorescence image of ${escHtml(cell.name)}">`
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
        cell.counts = [...(cell.counts || []), { id: genLocalId('cnt'), value, points }];
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

function wireCount() {
  document.getElementById('count-cancel').addEventListener('click', () => {
    navigate('cells');
  });

  const doneBtn = document.getElementById('count-done');
  if (doneBtn) doneBtn.addEventListener('click', finishCount);

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

let graphState = null; // { conditionsCache, selectedExperimentId, selected, colorAssignments, metric }

// Metric shown on the y-axis: 'auto' (machine-suggested auto count, default
// — averaged across whichever of a cell's auto_counts algorithms have been
// run, see cellAutoCount), 'hand' (average of hand counts), or 'combined'
// (average of the two).
const GRAPH_METRICS = {
  auto: { label: 'Auto count', axisLabel: 'Lipid droplets / cell (auto count)' },
  hand: { label: 'Average hand count', axisLabel: 'Lipid droplets / cell (hand count avg)' },
  combined: { label: 'Average of both', axisLabel: 'Lipid droplets / cell (combined avg)' },
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

function conditionMeanForMetric(cond, metric) {
  const values = (cond.cells || []).map(cell => cellValueForMetric(cell, metric)).filter(v => v != null);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function initGraph() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading experiments…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = TEST_EXPERIMENTS;
  }

  if (!experiments) {
    try {
      experiments = await api('/experiments');
    } catch {
      content.innerHTML = '<div class="error-state">Could not load experiments. The API may not be reachable yet.</div>';
      return;
    }
  }

  graphState = { conditionsCache: {}, selectedExperimentId: null, selected: [], colorAssignments: {}, metric: 'combined' };
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
          <select class="graph-select" id="graph-experiment-select">
            <option value="" selected disabled>Select an experiment…</option>
            ${expOptions}
          </select>
        </div>
        <div class="graph-field">
          <label for="graph-condition-select">Condition</label>
          <select class="graph-select" id="graph-condition-select" disabled>
            <option value="">Select an experiment first…</option>
          </select>
        </div>
        <button class="graph-add-btn" id="graph-add-btn" disabled>Add to graph</button>
        <div class="graph-selected-list" id="graph-selected-list">${renderGraphSelectedListHTML()}</div>
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
        <h2 class="graph-chart-title">Lipid droplet counts by condition</h2>
        <div id="graph-chart-area">${renderGraphChartArea()}</div>
        <div class="graph-tooltip" id="graph-tooltip" hidden></div>
      </div>
    </div>
  `;
}

function renderGraphSelectedListHTML() {
  if (graphState.selected.length === 0) return '';
  return `
    <ul class="graph-selected-list-items">
      ${graphState.selected.map(s => `
        <li class="graph-selected-item">
          <span>${escHtml(s.experimentName)} &rsaquo; ${escHtml(s.conditionName)}</span>
          <button class="graph-selected-remove" data-condition-id="${escHtml(String(s.conditionId))}" aria-label="Remove ${escHtml(s.conditionName)} from graph">&times;</button>
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

function refreshGraphChartArea() {
  document.getElementById('graph-chart-area').innerHTML = renderGraphChartArea();
  wireGraphTooltip();
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

  // Render the scatter first: it's what assigns fresh color slots (in
  // column order == first-seen order), so the legend below can just look
  // the assignments up rather than risk a different assignment order.
  const scatterSvg = renderGraphScatterSVG(selected, graphState.metric);

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
              ${escHtml(item.experimentName)}
            </span>
          `;
        }).join('')}
      </div>
    `
    : '';

  return legend + scatterSvg;
}

function renderGraphScatterSVG(selected, metric) {
  const width = 900;
  const height = 420;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 56;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const allAverages = selected.flatMap(s => (s.cells || []).map(cell => cellValueForMetric(cell, metric))).filter(a => a != null);
  const rawMax = Math.max(1, ...allAverages);
  const niceMax = Math.ceil(rawMax / 5) * 5 || 5;
  const tickCount = 5;
  const yFor = val => padTop + plotHeight - (val / niceMax) * plotHeight;

  const n = selected.length;
  const colWidth = plotWidth / n;

  const gridlines = Array.from({ length: tickCount + 1 }).map((_, i) => {
    const val = (niceMax / tickCount) * i;
    const y = yFor(val);
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${(padLeft + plotWidth).toFixed(1)}" y2="${y.toFixed(1)}" class="graph-gridline" />
      <text x="${(padLeft - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="graph-axis-tick" text-anchor="end">${val.toFixed(0)}</text>
    `;
  }).join('');

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
      const countsStr = (cell.counts || []).map(c => c.value).join(', ') || '—';
      const autoStr = cellAutoCount(cell) != null ? cellAutoCount(cell).toFixed(1) : '—';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="graph-dot" style="fill:${color}"
        data-experiment="${escHtml(s.experimentName)}" data-condition="${escHtml(s.conditionName)}"
        data-cell="${escHtml(cell.name)}" data-counts="${escHtml(countsStr)}" data-average="${autoStr}"
        data-plotted="${avg.toFixed(1)}" data-metric-key="${metric}" data-metric="${escHtml(GRAPH_METRICS[metric].label)}" />`;
    }).join('');

    const mean = conditionMeanForMetric(s, metric);
    const barHalf = colWidth * 0.3;
    const meanTick = mean != null
      ? `<line x1="${(cx - barHalf).toFixed(1)}" y1="${yFor(mean).toFixed(1)}" x2="${(cx + barHalf).toFixed(1)}" y2="${yFor(mean).toFixed(1)}" class="graph-mean-tick" style="stroke:${color}" />`
      : '';

    const label = `
      <text x="${cx.toFixed(1)}" y="${height - 34}" class="graph-col-label" text-anchor="middle">${escHtml(truncateLabel(s.conditionName, 14))}</text>
      <text x="${cx.toFixed(1)}" y="${height - 18}" class="graph-col-sublabel" text-anchor="middle">${escHtml(truncateLabel(s.experimentName, 16))}</text>
    `;

    return dots + meanTick + label;
  }).join('');

  return `
    <svg class="graph-scatter-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lipid droplet counts by condition">
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
        <div class="graph-tooltip-row">Auto count: ${escHtml(dot.dataset.average)}</div>
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
}

function wireGraph(experiments) {
  const expSelect = document.getElementById('graph-experiment-select');
  const condSelect = document.getElementById('graph-condition-select');
  const addBtn = document.getElementById('graph-add-btn');
  const metricInputs = document.querySelectorAll('.graph-metric-input');

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
        experimentId: exp.id,
        experimentName: exp.name,
        cells: cond.cells || [],
      });
    });

    refreshGraphSelectedList();
    refreshGraphChartArea();
  });

  wireGraphSelectedList();
  wireGraphTooltip();
}

// ---- Raw Data screen ----
// Flat, sortable/filterable table of every cell across every experiment and
// condition. Read-only — reuses the same endpoints Graph (Phase 9) already
// assumes (GET /experiments, GET /experiments/{id}/conditions), just fans
// out across *all* experiments instead of user-selected ones.

let rawDataState = null; // { rows, sortKey, sortDir, filterText }

const RAWDATA_COLUMNS = [
  { key: 'experimentName', label: 'Experiment' },
  { key: 'conditionName', label: 'Condition' },
  { key: 'cellName', label: 'Cell' },
  { key: 'count1', label: 'Count 1' },
  { key: 'count2', label: 'Count 2' },
  { key: 'count3', label: 'Count 3' },
  { key: 'average', label: 'Average' },
  { key: 'autoStandard', label: 'Auto count (Standard)' },
  { key: 'autoAldq', label: 'Auto count (ALDQ)' },
  { key: 'sourceFilename', label: 'Source file' },
];

async function initRawData() {
  const content = document.querySelector('.content');
  content.innerHTML = '<div class="loading-state">Loading raw data…</div>';

  let experiments;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    experiments = TEST_EXPERIMENTS;
  }

  if (!experiments) {
    try {
      experiments = await api('/experiments');
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
      conditionsByExperiment = await Promise.all(
        experiments.map(exp => api(`/experiments/${exp.id}/conditions`))
      );
    }
  } catch {
    content.innerHTML = '<div class="error-state">Could not load raw data. The API may not be reachable yet.</div>';
    return;
  }

  const rows = [];
  experiments.forEach((exp, i) => {
    (conditionsByExperiment[i] || []).forEach(cond => {
      (cond.cells || []).forEach(cell => {
        rows.push({
          experimentName: exp.name,
          conditionName: cond.name,
          cellName: cell.name,
          counts: cell.counts || [],
          average: cellAverage(cell),
          autoStandard: cell.auto_counts?.otsu_watershed?.count ?? null,
          autoAldq: cell.auto_counts?.fm_edge_overlay?.count ?? null,
          sourceFilename: cell.source_filename || null,
        });
      });
    });
  });

  rawDataState = { rows, sortKey: null, sortDir: 'asc', filterText: '' };
  content.innerHTML = renderRawDataHTML();
  wireRawData();
}

function rawDataCountAt(row, idx) {
  return row.counts[idx] ? row.counts[idx].value : null;
}

function rawDataSortValue(row, key) {
  switch (key) {
    case 'experimentName': return row.experimentName;
    case 'conditionName': return row.conditionName;
    case 'cellName': return row.cellName;
    case 'count1': return rawDataCountAt(row, 0);
    case 'count2': return rawDataCountAt(row, 1);
    case 'count3': return rawDataCountAt(row, 2);
    case 'average': return row.average;
    case 'autoStandard': return row.autoStandard;
    case 'autoAldq': return row.autoAldq;
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

function renderRawDataHTML() {
  return `
    <div class="rawdata-screen">
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
      <td>${rawDataCountAt(row, 0) ?? '—'}</td>
      <td>${rawDataCountAt(row, 1) ?? '—'}</td>
      <td>${rawDataCountAt(row, 2) ?? '—'}</td>
      <td>${row.average != null ? `<span class="rawdata-average">${row.average.toFixed(1)}</span>` : '—'}</td>
      <td>${row.autoStandard != null ? row.autoStandard : '—'}</td>
      <td>${row.autoAldq != null ? row.autoAldq : '—'}</td>
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

function wireRawData() {
  document.getElementById('rawdata-filter').addEventListener('input', (e) => {
    rawDataState.filterText = e.target.value;
    refreshRawDataTable();
  });

  document.getElementById('rawdata-export').addEventListener('click', downloadRawDataCSV);

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

  const hashParams = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)).entries());
  if (hashParams.access_token) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (hashParams.type === 'recovery') {
      renderResetPassword(hashParams.access_token);
    } else {
      localStorage.setItem('token', hashParams.access_token);
      navigate('experiments');
    }
    return;
  }
  navigate(localStorage.getItem('token') ? 'experiments' : 'login');
})();
