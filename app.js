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

// Screen router — expanded in later phases
function navigate(screen, params = {}) {
  if (screen === 'login') return renderLogin();
  if (screen === 'experiments') return renderExperimentsStub();
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

function renderExperimentsStub() {
  app.innerHTML = `
    <div class="app-shell">
      <p>Experiments — coming in Phase 4</p>
      <button class="logout-link" id="logout-link">Log out</button>
    </div>
  `;

  document.getElementById('logout-link').addEventListener('click', () => {
    localStorage.removeItem('token');
    navigate('login');
  });
}

// Boot
navigate(localStorage.getItem('token') ? 'experiments' : 'login');
