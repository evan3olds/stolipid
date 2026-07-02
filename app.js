const RENDER_API_URL = 'YOUR_RENDER_API_URL';

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

// Runtime-configurable props (Phase 13 will make these user-settable)
const CONFIG = {
  appTitle: 'Cell Archive',
  prototypeBadge: true,
};

// Navigation state — persists across the authenticated shell
const state = {
  screen: 'login',
  experiment: null, // { id, name }
  condition: null,  // { id, name }
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
  if (screen === 'login') return renderLogin();
  renderShell(screen);
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="login-form">
        <div class="login-eyebrow">Biology Dept &middot; Cell Archive</div>
        <h1 class="login-title">Cell Archive</h1>
        <div class="login-field">
          <label for="login-username">Username</label>
          <input id="login-username" name="username" type="text" autocomplete="username" required>
        </div>
        <div class="login-field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="login-submit" type="submit">Log in</button>
        <div class="login-error" id="login-error"></div>
      </form>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    // Check test-accounts.json before hitting the real API
    try {
      const testAccounts = await fetch('test-accounts.json').then(r => r.json());
      const match = testAccounts.find(a => a.username === username && a.password === password);
      if (match) {
        localStorage.setItem('token', `local:${username}`);
        navigate('experiments');
        return;
      }
    } catch (_) {
      // test-accounts.json unavailable; fall through to real API
    }

    try {
      const { token } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('token', token);
      navigate('experiments');
    } catch (err) {
      errorEl.textContent = 'Login failed. Check your username and password.';
    }
  });
}

// ---- Authenticated shell (top bar + sidebar + subheader + content) ----

let escHandler = null; // tracked so we can detach it before each re-render

function currentUser() {
  const t = localStorage.getItem('token') || '';
  return t.startsWith('local:') ? t.slice(6) : 'user';
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
  const initial = (currentUser()[0] || 'U').toUpperCase();
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="hamburger" id="hamburger" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
        <span class="topbar-title">${CONFIG.appTitle}</span>
        ${CONFIG.prototypeBadge ? '<span class="badge">Prototype</span>' : ''}
      </div>
      <div class="avatar" title="${currentUser()}">${initial}</div>
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
      <button class="sidebar-logout" id="sidebar-logout">Log out</button>
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

  document.getElementById('sidebar-logout').addEventListener('click', () => {
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

  // Primary action is context-sensitive; real handlers arrive with each screen's phase.
  const action = document.getElementById('primary-action');
  if (action) action.addEventListener('click', () => { /* wired in a later phase */ });
}

// Boot
navigate(localStorage.getItem('token') ? 'experiments' : 'login');
