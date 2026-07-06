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
  cell: null,       // { id, name }
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
  if (screen === 'count') return renderCount();
  renderShell(screen);
  if (screen === 'experiments') initExperiments();
  if (screen === 'conditions') initConditions();
  if (screen === 'cells') initCells();
  if (screen === 'graph') initGraph();
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
      const testAccounts = await fetch('docs/test-accounts.json').then(r => r.json());
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
      dye: 'BODIPY',
      starvation: 0,
      notes: 'Baseline, fed condition.',
      icc: 0.88,
      cells: [
        { id: 'test-cell-001', name: 'Cell 1', counts: [] },
        { id: 'test-cell-002', name: 'Cell 2', counts: [{ id: 'test-cnt-002-1', value: 4 }] },
        { id: 'test-cell-003', name: 'Cell 3', counts: [{ id: 'test-cnt-003-1', value: 3 }, { id: 'test-cnt-003-2', value: 2 }] },
        { id: 'test-cell-011', name: 'Cell 4', counts: [{ id: 'test-cnt-011-1', value: 3 }, { id: 'test-cnt-011-2', value: 4 }, { id: 'test-cnt-011-3', value: 3 }] },
      ],
    },
    {
      id: 'test-cond-002',
      name: '6 Hr Starved',
      dye: 'BODIPY',
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
      dye: 'BODIPY',
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
      dye: 'Nile Red',
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
      dye: 'Nile Red',
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

function conditionMean(cond) {
  const averages = (cond.cells || []).map(cellAverage).filter(a => a != null);
  if (!averages.length) return null;
  return averages.reduce((sum, a) => sum + a, 0) / averages.length;
}

function truncateLabel(str, max = 10) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Static preview chart: one column per condition in the current experiment,
// dots = per-cell averages, tick = condition mean. Interactive version is Phase 9.
function renderMiniScatterSVG(conditions) {
  const width = 240;
  const height = 120;
  const padTop = 10;
  const padBottom = 20;
  const plotHeight = height - padTop - padBottom;

  const allAverages = conditions.flatMap(c => (c.cells || []).map(cellAverage)).filter(a => a != null);
  const maxAvg = Math.max(1, ...allAverages);
  const yFor = val => padTop + plotHeight - (val / maxAvg) * plotHeight;

  const n = Math.max(conditions.length, 1);
  const colWidth = width / n;

  const columns = conditions.map((cond, i) => {
    const cx = colWidth * (i + 0.5);
    const cellAverages = (cond.cells || []).map(cellAverage).filter(a => a != null);

    const dots = cellAverages.map((avg, j) => {
      const jitter = (j % 2 === 0 ? 1 : -1) * (Math.floor(j / 2) + 1) * 6;
      const x = cx + jitter;
      const y = yFor(avg);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="mini-chart-dot" />`;
    }).join('');

    const mean = conditionMean(cond);
    const barHalf = colWidth * 0.32;
    const bar = mean != null
      ? `<line x1="${(cx - barHalf).toFixed(1)}" y1="${yFor(mean).toFixed(1)}" x2="${(cx + barHalf).toFixed(1)}" y2="${yFor(mean).toFixed(1)}" class="mini-chart-mean" />`
      : '';

    const label = `<text x="${cx.toFixed(1)}" y="${height - 4}" class="mini-chart-label" text-anchor="middle">${escHtml(truncateLabel(cond.name))}</text>`;

    return dots + bar + label;
  }).join('');

  return `
    <svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Per-condition lipid droplet averages">
      ${columns}
    </svg>
  `;
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
            <div class="folder-name">${escHtml(cond.name)}</div>
            <div class="folder-meta">
              ${cond.dye ? `<span class="folder-meta-item">${escHtml(cond.dye)}</span>` : ''}
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
        <span class="detail-value">${cond.dye ? escHtml(cond.dye) : '—'}</span>
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
      <div class="detail-row">
        <span class="detail-label">All conditions</span>
        <div class="mini-chart">${renderMiniScatterSVG(conditions)}</div>
      </div>
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

  wireConditionsAction();
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
          <label for="modal-dye">Dye</label>
          <input id="modal-dye" type="text" autocomplete="off" placeholder="e.g. BODIPY">
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
          dye:        document.getElementById('modal-dye').value,
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

// ---- Cells screen ----

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
    <svg class="cell-thumb-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Simulated fluorescence thumbnail">
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

  content.innerHTML = renderCellsHTML(cells);
  wireCells(cells);
}

function renderCellsHTML(cells) {
  const cards = cells.length === 0
    ? '<p class="empty-state">No cells yet. Click "Add photos" to box some cells.</p>'
    : cells.map(cell => {
        const tier = (cell.counts || []).length === 0 ? 'needs' : 'counted';
        return `
          <div class="folder-card" data-id="${escHtml(String(cell.id))}" role="button" tabindex="0">
            <div class="cell-thumbnail">${renderCellThumbnailSVG(cell)}</div>
            <div class="folder-name">${escHtml(cell.name)}</div>
            <div class="folder-meta">
              <span class="status-tag status-tag-${tier}">${cellCountStatus(cell)}</span>
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="folder-layout">
      <div class="folder-grid" id="folder-grid">${cards}</div>
      <aside class="detail-panel" id="detail-panel" aria-label="Cell details"></aside>
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

    panel.innerHTML = `
      <div class="detail-name">${escHtml(cell.name)}</div>
      <div class="detail-row">
        <span class="detail-label">Average hand count</span>
        <span class="detail-average">${avg != null ? avg.toFixed(1) : '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Hand counts</span>
        ${counts.length === 0
          ? '<span class="detail-value">No counts yet.</span>'
          : `<ul class="count-list">${counts.map(c => `
              <li class="count-list-item">
                <span class="count-value">${c.value}</span>
                <button class="count-delete-btn" data-count-id="${escHtml(String(c.id))}" aria-label="Delete count">&times;</button>
              </li>
            `).join('')}</ul>`}
      </div>
      ${needsMore ? '<button class="count-cta-btn" id="count-cta">Count</button>' : ''}
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

  wireCellsAction();
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
        <div class="addphotos-topbar-actions">
          <button class="modal-cancel" id="addphotos-cancel">Cancel</button>
          <button class="primary-action" id="addphotos-create" ${totalBoxes === 0 ? 'disabled' : ''}>Create ${totalBoxes} cell${totalBoxes !== 1 ? 's' : ''}</button>
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
      <div class="canvas-frame" id="canvas-frame">
        ${file.previewSvg}
        ${boxes}
      </div>
    </div>
  `;
}

function addPhotoFile(file) {
  const entry = { id: genLocalId('file'), name: file.name, rawFile: file, status: 'loading', previewSvg: '', boxes: [] };
  addPhotosState.files.push(entry);
  if (!addPhotosState.activeFileId) addPhotosState.activeFileId = entry.id;

  if (localStorage.getItem('token')?.startsWith('local:')) {
    entry.previewSvg = renderPhotoPreviewSVG(entry.name);
    entry.status = 'ready';
    refreshAddPhotos();
    return;
  }

  refreshAddPhotos();

  const formData = new FormData();
  formData.append('file', file);

  apiUpload(`/conditions/${state.condition.id}/tif-preview`, formData)
    .then(({ preview_url }) => {
      entry.previewSvg = `<img class="photo-preview-img" src="${escHtml(preview_url)}" alt="Rendered preview of ${escHtml(entry.name)}">`;
      entry.status = 'ready';
    })
    .catch(() => {
      entry.status = 'error';
    })
    .finally(() => {
      refreshAddPhotos();
    });
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
      let nextNumber = cond.cells.length + 1;
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
  } catch {
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
    Array.from(fileInput.files || []).forEach(addPhotoFile);
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

let countState = null; // { cell, markers: [{ id, x, y }] }

function renderCount() {
  countState = { cell: state.cell, markers: [] };
  refreshCount();
}

function refreshCount() {
  app.innerHTML = renderCountHTML();
  wireCount();
}

function renderCountHTML() {
  const { cell, markers } = countState;

  const image = cell.image_url
    ? `<img class="photo-preview-img" src="${escHtml(cell.image_url)}" alt="Processed fluorescence image of ${escHtml(cell.name)}">`
    : renderPhotoPreviewSVG(cell.id);

  const markerEls = markers.map((m, i) => `
    <button class="count-marker" data-marker-id="${escHtml(m.id)}" style="left:${m.x}%; top:${m.y}%;" aria-label="Remove marker ${i + 1}">${i + 1}</button>
  `).join('');

  return `
    <div class="count-screen">
      <header class="count-topbar">
        <div class="count-topbar-left">
          <div class="count-cell-name">${escHtml(cell.name)}</div>
          <div class="count-total">Total: ${markers.length}</div>
        </div>
        <div class="count-topbar-actions">
          <button class="count-cancel-btn" id="count-cancel">Cancel</button>
          <button class="primary-action" id="count-done">Done</button>
        </div>
      </header>
      <div class="count-error" id="count-error"></div>
      <div class="count-canvas">
        <div class="canvas-frame" id="count-frame">
          ${image}
          ${markerEls}
        </div>
      </div>
    </div>
  `;
}

function addMarkerAt(xPct, yPct) {
  countState.markers.push({ id: genLocalId('marker'), x: clamp(xPct, 0, 100), y: clamp(yPct, 0, 100) });
  refreshCount();
}

function removeMarker(id) {
  countState.markers = countState.markers.filter(m => m.id !== id);
  refreshCount();
}

async function finishCount() {
  const value = countState.markers.length;
  const doneBtn = document.getElementById('count-done');
  const errEl = document.getElementById('count-error');
  doneBtn.disabled = true;
  doneBtn.textContent = 'Saving…';
  errEl.textContent = '';

  if (localStorage.getItem('token')?.startsWith('local:')) {
    const conditions = TEST_CONDITIONS[state.experiment?.id] || [];
    const cond = conditions.find(c => String(c.id) === String(state.condition?.id));
    const cell = cond?.cells.find(c => String(c.id) === String(countState.cell.id));
    if (cell) cell.counts = [...(cell.counts || []), { id: genLocalId('cnt'), value }];
    navigate('cells');
    return;
  }

  try {
    await api(`/cells/${countState.cell.id}/counts`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
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

  document.getElementById('count-done').addEventListener('click', finishCount);

  const frame = document.getElementById('count-frame');

  frame.addEventListener('click', e => {
    if (e.target.closest('.count-marker')) return;
    const rect = frame.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    addMarkerAt(xPct, yPct);
  });

  frame.querySelectorAll('.count-marker').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeMarker(btn.dataset.markerId);
    });
  });
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

let graphState = null; // { conditionsCache, selectedExperimentId, selected, colorAssignments }

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

  graphState = { conditionsCache: {}, selectedExperimentId: null, selected: [], colorAssignments: {} };
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
  const scatterSvg = renderGraphScatterSVG(selected);

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

function renderGraphScatterSVG(selected) {
  const width = 900;
  const height = 420;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 56;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const allAverages = selected.flatMap(s => (s.cells || []).map(cellAverage)).filter(a => a != null);
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
      .map(cell => ({ cell, avg: cellAverage(cell) }))
      .filter(x => x.avg != null);

    const dots = cellsWithAvg.map(({ cell, avg }, j) => {
      const jitter = (j % 2 === 0 ? 1 : -1) * (Math.floor(j / 2) + 1) * 5;
      const x = cx + jitter;
      const y = yFor(avg);
      const countsStr = (cell.counts || []).map(c => c.value).join(', ') || '—';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="graph-dot" style="fill:${color}"
        data-experiment="${escHtml(s.experimentName)}" data-condition="${escHtml(s.conditionName)}"
        data-cell="${escHtml(cell.name)}" data-counts="${escHtml(countsStr)}" data-average="${avg.toFixed(1)}" />`;
    }).join('');

    const mean = conditionMean(s);
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
      <text x="${padLeft}" y="14" class="graph-axis-label">Lipid droplets / cell</text>
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
        <div class="graph-tooltip-row">Counts: ${escHtml(dot.dataset.counts)}</div>
        <div class="graph-tooltip-row">Average: ${escHtml(dot.dataset.average)}</div>
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

// Boot
navigate(localStorage.getItem('token') ? 'experiments' : 'login');
