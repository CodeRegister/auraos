// Link Chain: pull N items from a bundled theme (or the capture queue),
// flash each for five seconds, then score ordered recall.

import { makeRng } from './rng.js';
import { fuzzyEqual } from './levenshtein.js';
import { esc } from './util.js';

let themesCache = null;

async function loadThemes() {
  if (!themesCache) {
    themesCache = await (await fetch('data/themes.json')).json();
  }
  return themesCache;
}

// #region setup

let run = null; // {label, n, order, phase, shown, timer, onVis, recall}

export function destroy() {
  if (run) {
    if (run.timer) clearInterval(run.timer);
    if (run.onVis) document.removeEventListener('visibilitychange', run.onVis);
  }
  run = null;
}

export async function render(el, ctx) {
  const themes = await loadThemes();
  const repaint = () => render(el, ctx);
  if (run) paintRun(el, ctx, run, repaint);
  else paintSetup(el, ctx, themes, repaint);
}

function paintSetup(el, ctx, themes, repaint) {
  const p = ctx.profile;
  const queue = p.chain.captureQueue.filter(q => !q.used);
  const themeOptions = themes.map(t =>
    `<option value="theme:${esc(t.id)}">${esc(t.name)} (${t.items.length} items)</option>`).join('');
  const queueOption = queue.length
    ? `<option value="queue">capture queue (${queue.length} items)</option>` : '';
  el.innerHTML = `
    <div class="split">
      <div class="card">
        <h2>Link Chain</h2>
        <p class="muted">Items flash for 5 seconds each. When the chain ends, type them back in order.
        Score = number of items recalled in their correct position.</p>
        <label class="field">Source
          <select id="chain-source">${themeOptions}${queueOption}</select>
        </label>
        <label class="field">Chain length
          <select id="chain-length">
            <option value="5">5 items</option>
            <option value="10" selected>10 items</option>
            <option value="15">15 items</option>
          </select>
        </label>
        <button id="chain-start" class="btn btn-primary">Start chain</button>
        <div id="chain-history" class="muted small">${chainHistoryHtml(p)}</div>
      </div>
      <div class="card">
        <h3>Capture queue</h3>
        <p class="muted small">Items you parked for chaining. The queue doubles as a source when it has enough unused items.</p>
        <form id="capture-form" class="row-gap">
          <input id="capture-input" placeholder="add an item to capture (e.g. corkscrew)">
          <button class="btn btn-ghost btn-sm" type="submit">add</button>
        </form>
        <div id="capture-list">
          ${p.chain.captureQueue.map((q, i) => `
            <div class="row-item ${q.used ? 'used' : ''}">
              <span class="row-main">${esc(q.text)}</span>
              <button class="btn btn-ghost btn-sm" data-cap-del="${i}">✕</button>
            </div>`).join('') || '<p class="muted small">empty</p>'}
        </div>
        <button id="capture-clear" class="btn btn-ghost btn-sm">clear used</button>
      </div>
    </div>`;

  el.querySelector('#chain-start').onclick = () => {
    const source = el.querySelector('#chain-source').value;
    const n = Number(el.querySelector('#chain-length').value);
    startChain(ctx, themes, source, n, repaint);
  };
  el.querySelector('#capture-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = el.querySelector('#capture-input');
    const text = inp.value.trim();
    if (!text) return;
    p.chain.captureQueue.push({ id: Date.now().toString(36), text, used: false, addedTs: Date.now() });
    ctx.save();
    // repaint rebuilds the whole view; hand focus back once it lands
    repaint().then(() => {
      const again = el.querySelector('#capture-input');
      if (again) again.focus();
    });
  };
  el.querySelectorAll('[data-cap-del]').forEach(b => {
    b.onclick = () => {
      p.chain.captureQueue.splice(Number(b.dataset.capDel), 1);
      ctx.save();
      repaint();
    };
  });
  el.querySelector('#capture-clear').onclick = () => {
    p.chain.captureQueue = p.chain.captureQueue.filter(q => !q.used);
    ctx.save();
    repaint();
  };
}

function startChain(ctx, themes, source, n, repaint) {
  const p = ctx.profile;
  let pool;
  let label;
  if (source === 'queue') {
    pool = p.chain.captureQueue.filter(q => !q.used).map(q => q.text);
    label = 'capture queue';
  } else {
    const theme = themes.find(t => 'theme:' + t.id === source);
    pool = theme.items.slice();
    label = theme.name;
  }
  const length = Math.min(n, pool.length);
  const rng = makeRng(p.seed.current + ':chain:' + Date.now());
  const order = rng.shuffle(pool).slice(0, length);
  run = { label, n: length, order, phase: 'show', shown: 0, timer: null, recall: [] };
  if (source === 'queue') {
    const usedTexts = new Set(order);
    p.chain.captureQueue.forEach(q => { if (usedTexts.has(q.text)) q.used = true; });
    ctx.save();
  }
  repaint();
}

// #region presentation

const SHOW_MS = 5000;

function paintRun(el, ctx, run, repaint) {
  if (run.phase === 'show') paintShow(el, ctx, run, repaint);
  else if (run.phase === 'recall') paintRecall(el, ctx, run, repaint);
  else paintScored(el, ctx, run, repaint);
}

function paintShow(el, ctx, run, repaint) {
  if (run.shown >= run.order.length) {
    run.phase = 'recall';
    repaint();
    return;
  }
  const item = run.order[run.shown];
  el.innerHTML = `
    <div class="card chain-stage">
      <p class="muted small">${esc(run.label)} · item ${run.shown + 1} of ${run.n}</p>
      <div class="chain-item">${esc(item)}</div>
      <div class="countdown"><div class="countdown-fill" id="cd-fill"></div></div>
      <p class="muted center">memorize — link it to the previous item</p>
    </div>`;
  const fill = el.querySelector('#cd-fill');
  let started = Date.now();
  let pausedAt = null;
  // Hidden tabs throttle timers, which would burn through items the user
  // never saw. Freeze the countdown until the tab is visible again.
  const onVis = () => {
    if (document.hidden) pausedAt = Date.now();
    else if (pausedAt !== null) {
      started += Date.now() - pausedAt;
      pausedAt = null;
    }
  };
  document.addEventListener('visibilitychange', onVis);
  run.onVis = onVis;
  run.timer = setInterval(() => {
    if (pausedAt !== null) return;
    const left = SHOW_MS - (Date.now() - started);
    if (fill) fill.style.width = Math.max(0, (left / SHOW_MS) * 100) + '%';
    if (left <= 0) {
      document.removeEventListener('visibilitychange', onVis);
      run.onVis = null;
      clearInterval(run.timer);
      run.timer = null;
      run.shown += 1;
      repaint();
    }
  }, 100);
}

// #region recall

function paintRecall(el, ctx, run, repaint) {
  el.innerHTML = `
    <div class="card">
      <h2>Recall the chain — ${esc(run.label)}</h2>
      <p class="muted">Type the ${run.n} items in the order they appeared. Fuzzy matching (±2 edits) is allowed.</p>
      <form id="recall-form">
        ${run.order.map((_, i) => `
          <div class="recall-row">
            <span class="locus-num">${i + 1}</span>
            <input class="recall-input" data-i="${i}" autocomplete="off" placeholder="item ${i + 1}">
          </div>`).join('')}
        <button class="btn btn-primary" type="submit">Score my recall</button>
      </form>
    </div>`;
  const inputs = [...el.querySelectorAll('.recall-input')];
  inputs[0].focus();
  inputs.forEach((inp, i) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (i + 1 < inputs.length) inputs[i + 1].focus();
        else el.querySelector('#recall-form').requestSubmit();
      }
    });
  });
  el.querySelector('#recall-form').onsubmit = (e) => {
    e.preventDefault();
    run.recall = inputs.map(inp => inp.value);
    run.phase = 'scored';
    repaint();
  };
}

// #region scoring

function paintScored(el, ctx, run, repaint) {
  const p = ctx.profile;
  const results = run.order.map((item, i) => ({
    item,
    guess: run.recall[i] || '',
    ok: fuzzyEqual((run.recall[i] || '').trim(), item, 2),
  }));
  const score = results.filter(r => r.ok).length;
  p.chain.history.push({
    ts: Date.now(),
    source: run.label,
    n: run.n,
    score,
    order: run.order,
    recall: run.recall,
  });
  ctx.save();
  el.innerHTML = `
    <div class="card">
      <h2>Score: ${score} / ${run.n}</h2>
      <table class="table">
        <thead><tr><th>#</th><th>was shown</th><th>you recalled</th><th></th></tr></thead>
        <tbody>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(r.item)}</td>
              <td>${esc(r.guess) || '—'}</td>
              <td class="${r.ok ? 'good' : 'bad'}">${r.ok ? '✓' : '✗'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="row-end">
        <button id="chain-again" class="btn btn-primary">run another chain</button>
      </div>
    </div>`;
  el.querySelector('#chain-again').onclick = () => { run = null; repaint(); };
}

// #region history

function chainHistoryHtml(p) {
  const rows = p.chain.history.slice(-8).reverse().map(h => `
    <div class="row-item">
      <span class="row-main">${esc(h.source)} · ${h.score}/${h.n}</span>
      <span class="muted small">${new Date(h.ts).toLocaleDateString()}</span>
    </div>`).join('');
  return rows
    ? `<p class="small" style="margin-bottom:4px">recent chains</p>${rows}`
    : '<p class="muted small">no chains run yet</p>';
}
