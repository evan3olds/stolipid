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
  if (screen === 'experiments') initExperiments();
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
];

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
    <div class="experiments-layout">
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
      navigate('conditions', { experiment: { id: exp.id, name: exp.name } });
    });
  }

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => selectExperiment(card.dataset.id));
    card.addEventListener('dblclick', () => {
      const exp = experiments.find(e => String(e.id) === card.dataset.id);
      if (exp) navigate('conditions', { experiment: { id: exp.id, name: exp.name } });
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectExperiment(card.dataset.id);
    });
  });

  wireExperimentsAction();
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

// Boot
navigate(localStorage.getItem('token') ? 'experiments' : 'login');
