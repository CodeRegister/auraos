// App shell: boots the store, wires tabs, profile switching and settings.

import * as store from './store.js';
import { esc } from './util.js';
import * as drill from './drill.js';
import * as palace from './palace.js';
import * as chain from './chain.js';
import * as exam from './exam.js';

const VIEWS = {
  drill: { render: drill.render, destroy: drill.destroy },
  palace: { render: palace.render, destroy: palace.destroy },
  chain: { render: chain.render, destroy: chain.destroy },
  exam: { render: exam.render, destroy: exam.destroy },
};

let current = 'drill';

function ctx() {
  const profile = store.getActive();
  return {
    store,
    profile,
    save: store.save,
    certified: profile.exam.attempts.some(a => a.passed),
  };
}

// #region shell

function showView(name) {
  const prev = VIEWS[current];
  if (prev && prev.destroy) prev.destroy();
  current = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + name));
  if (name === 'settings') renderSettings(document.getElementById('view-settings'));
  else renderCurrent();
}

function renderCurrent() {
  const el = document.getElementById('view-' + current);
  if (el) VIEWS[current].render(el, ctx());
}

function renderProfileBar() {
  const s = store.load();
  const sel = document.getElementById('profile-select');
  if (sel) {
    sel.innerHTML = s.profiles.map(p =>
      `<option value="${p.id}" ${p.id === s.activeProfileId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }
  const profile = store.getActive();
  const cert = document.getElementById('certified-chip');
  if (cert) cert.textContent = profile.exam.attempts.some(a => a.passed) ? '◆ Tier 1 certified' : '';
  const chip = document.getElementById('seed-chip');
  if (chip) chip.textContent = 'seed ' + profile.seed.current;
}

function wireHeader() {
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => showView(t.dataset.view);
  });
  const sel = document.getElementById('profile-select');
  if (sel) {
    sel.onchange = (e) => {
      store.switchProfileId(e.target.value);
      renderProfileBar();
      showView(current);
    };
  }
  const newBtn = document.getElementById('new-profile-btn');
  if (newBtn) {
    newBtn.onclick = () => {
      const name = prompt('Name for the new profile (peer answers come from other profiles):');
      if (name === null) return;
      store.createProfile(name.trim() || undefined);
      renderProfileBar();
      showView(current);
    };
  }
}

function boot() {
  store.load();
  store.save();
  wireHeader();
  renderProfileBar();
  showView('drill');
}

document.addEventListener('DOMContentLoaded', boot);

// #region settings view

function renderSettings(el) {
  const p = store.getActive();
  el.innerHTML = `
    <div class="split">
      <div class="card">
        <h2>Session seed</h2>
        <p class="muted">Prompts are generated from this seed. Export it and import it on another profile or
        browser to replay the same session sequence from that point.</p>
        <div class="row-gap">
          <input id="seed-value" readonly value="${esc(store.exportSeedString())}">
          <button id="seed-copy" class="btn btn-ghost btn-sm">copy</button>
        </div>
        <label class="field">Import a seed
          <input id="seed-import" placeholder="T1:xxxxxxxx-yyyyyyyy~n">
        </label>
        <div class="row-end">
          <button id="seed-apply" class="btn btn-primary btn-sm">apply seed</button>
        </div>
        <p id="seed-status" class="muted small"></p>
      </div>
      <div class="card">
        <h2>Data</h2>
        <p class="muted small">Everything lives in your browser's localStorage. Back it up or move it between browsers by hand.</p>
        <div class="row-end">
          <button id="data-export" class="btn btn-ghost btn-sm">export all data</button>
          <button id="data-import" class="btn btn-ghost btn-sm">import all data</button>
          <button id="profile-reset" class="btn btn-ghost btn-sm">reset this profile</button>
        </div>
        <textarea id="data-json" rows="10" placeholder="export fills this box — paste a snapshot here to import it"></textarea>
        <p id="data-status" class="muted small"></p>
      </div>
    </div>`;
  el.querySelector('#seed-copy').onclick = async () => {
    const inp = el.querySelector('#seed-value');
    inp.select();
    try {
      await navigator.clipboard.writeText(inp.value);
    } catch (err) {
      document.execCommand('copy');
    }
    el.querySelector('#seed-status').textContent = 'copied.';
  };
  el.querySelector('#seed-apply').onclick = () => {
    const ok = store.importSeedString(el.querySelector('#seed-import').value);
    el.querySelector('#seed-status').textContent = ok
      ? 'seed applied — the next session replays from it.'
      : 'could not parse that seed string.';
    if (ok) renderProfileBar();
  };
  el.querySelector('#data-export').onclick = () => {
    el.querySelector('#data-json').value = store.exportAll();
    el.querySelector('#data-status').textContent = 'exported — copy it somewhere safe.';
  };
  el.querySelector('#data-import').onclick = () => {
    const ok = store.importAll(el.querySelector('#data-json').value);
    el.querySelector('#data-status').textContent = ok ? 'imported.' : 'import failed — is that complete JSON?';
    if (ok) {
      renderProfileBar();
      showView(current);
    }
  };
  el.querySelector('#profile-reset').onclick = () => {
    if (confirm('Reset this profile? Palaces, history and exam attempts will be wiped.')) {
      store.resetProfile();
      renderProfileBar();
      showView(current);
    }
  };
}
