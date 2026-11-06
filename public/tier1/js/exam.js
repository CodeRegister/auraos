// Tier 1 Exam: 20 fresh abstract concepts, 3 minutes to encode, a sealed
// 24-hour wait, then a recall retest that requires 100% to certify.

import { makeRng, randomSeed } from './rng.js';
import { fuzzyEqual } from './levenshtein.js';
import { esc, fmtDur } from './util.js';

let conceptsCache = null;

async function loadConcepts() {
  if (!conceptsCache) {
    conceptsCache = await (await fetch('data/concepts.json')).json();
  }
  return conceptsCache;
}

const ENCODE_MS = 3 * 60 * 1000;
const WAIT_MS = 24 * 60 * 60 * 1000;

// #region gate

let timerInt = null;

export function destroy() {
  if (timerInt) clearInterval(timerInt);
  timerInt = null;
}

export async function render(el, ctx) {
  const repaint = () => render(el, ctx);
  const p = ctx.profile;
  const active = p.exam.attempts.find(a => a.phase && a.phase !== 'done');
  if (active) {
    if (active.phase === 'encode') { paintEncode(el, ctx, active, repaint); return; }
    if (Date.now() < active.retestAfterTs) { paintWaiting(el, ctx, active, repaint); return; }
    paintRetest(el, ctx, active, repaint);
    return;
  }
  paintGate(el, ctx, repaint);
}

function paintGate(el, ctx, repaint) {
  const p = ctx.profile;
  const certified = p.exam.attempts.some(a => a.passed);
  const past = p.exam.attempts.map((a, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>${new Date(a.startedTs).toLocaleDateString()}</td>
      <td>${a.encodeSeconds ? a.encodeSeconds + 's' : '—'}</td>
      <td>${a.phase === 'done'
        ? (a.passed ? '<span class="good">certified</span>' : (a.retestScore ?? '—') + '/20')
        : 'in progress'}</td>
    </tr>`).join('');
  el.innerHTML = `
    <div class="split">
      <div class="card">
        <h2>Tier 1 Exam</h2>
        <p>The certification gate for Tier 1:</p>
        <ul class="checklist">
          <li>20 abstract concepts, freshly drawn</li>
          <li>3 minutes to encode all of them</li>
          <li>a sealed 24-hour wait</li>
          <li>then recall — <b>100% required</b> to certify</li>
        </ul>
        ${certified ? '<p class="good big-good">◆ TIER 1 CERTIFIED</p>' : ''}
        <button id="exam-start" class="btn btn-primary">Start a new exam attempt</button>
      </div>
      <div class="card">
        <h3>Attempts</h3>
        <table class="table">
          <thead><tr><th></th><th>date</th><th>encode</th><th>result</th></tr></thead>
          <tbody>${past || '<tr><td colspan="4" class="muted">no attempts yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  el.querySelector('#exam-start').onclick = async () => {
    await loadConcepts();
    const attempt = {
      id: Date.now().toString(36),
      startedTs: Date.now(),
      encodeStartTs: Date.now(),
      words: drawWords(),
      images: {},
      phase: 'encode',
      retestAfterTs: 0,
      encodeSeconds: 0,
      retestScore: null,
      passed: false,
    };
    p.exam.attempts.push(attempt);
    ctx.save();
    repaint();
  };
}

// #region encoding

function drawWords() {
  const rng = makeRng('exam:' + randomSeed());
  const pools = conceptsCache.abstract;
  const pick = (tier, n) => rng.shuffle(pools[tier]).slice(0, n);
  const words = [...pick('easy', 6), ...pick('medium', 8), ...pick('hard', 6)];
  return rng.shuffle(words);
}

function paintEncode(el, ctx, attempt, repaint) {
  const remaining = ENCODE_MS - (Date.now() - attempt.encodeStartTs);
  if (remaining <= 0) {
    submitEncode(ctx, attempt, repaint, true);
    return;
  }
  const rows = attempt.words.map((w, i) => `
    <div class="exam-row">
      <span class="locus-num">${i + 1}</span>
      <span class="exam-word">${esc(w)}</span>
      <textarea data-i="${i}" rows="2" placeholder="image for this word…">${esc(attempt.images[i] || '')}</textarea>
    </div>`).join('');
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Tier 1 Exam — encode 20 concepts</h2>
        <span class="timer big" id="exam-timer">--:--</span>
      </div>
      <p class="muted">Write a quick image for each abstract word. You have 3 minutes. The exam seals when time
      runs out (or when you submit) and unlocks for recall in 24 hours.</p>
      <div id="exam-rows">${rows}</div>
      <div class="row-end">
        <button id="exam-seal" class="btn btn-primary">Seal exam &amp; start the 24h wait</button>
      </div>
    </div>`;
  el.querySelectorAll('#exam-rows textarea').forEach(t => {
    t.addEventListener('change', () => {
      attempt.images[t.dataset.i] = t.value;
      ctx.save();
    });
  });
  timerInt = setInterval(() => {
    const left = ENCODE_MS - (Date.now() - attempt.encodeStartTs);
    const t = el.querySelector('#exam-timer');
    if (t) t.textContent = fmtDur(left);
    if (left <= 0) {
      clearInterval(timerInt);
      timerInt = null;
      submitEncode(ctx, attempt, repaint, true);
    }
  }, 250);
  el.querySelector('#exam-seal').onclick = () => {
    clearInterval(timerInt);
    timerInt = null;
    el.querySelectorAll('#exam-rows textarea').forEach(t => { attempt.images[t.dataset.i] = t.value; });
    submitEncode(ctx, attempt, repaint, false);
  };
}

// #region sealing

function submitEncode(ctx, attempt, repaint, timedOut) {
  const root = document.querySelector('#exam-rows');
  if (root) root.querySelectorAll('textarea').forEach(t => { attempt.images[t.dataset.i] = t.value; });
  attempt.phase = 'sealed';
  attempt.encodeSeconds = Math.round((Date.now() - attempt.encodeStartTs) / 1000);
  attempt.retestAfterTs = Date.now() + WAIT_MS;
  attempt.timedOut = timedOut;
  ctx.save();
  repaint();
}

// #region waiting

function paintWaiting(el, ctx, attempt, repaint) {
  const left = attempt.retestAfterTs - Date.now();
  el.innerHTML = `
    <div class="card center-card">
      <h2>Exam sealed</h2>
      <p>You encoded ${attempt.words.length} abstract concepts in ${attempt.encodeSeconds}s${attempt.timedOut ? ' (time ran out)' : ''}.</p>
      <p class="muted">Recall retest unlocks in <b id="wait-countdown">${fmtDur(left)}</b> — come back in about
      24 hours. Keep this browser (progress lives in localStorage).</p>
      <p><button id="exam-abandon" class="btn btn-ghost btn-sm">abandon this attempt</button></p>
    </div>`;
  timerInt = setInterval(() => {
    const t = el.querySelector('#wait-countdown');
    const remain = attempt.retestAfterTs - Date.now();
    if (t) t.textContent = fmtDur(remain);
    if (remain <= 0) {
      clearInterval(timerInt);
      timerInt = null;
      repaint();
    }
  }, 1000);
  el.querySelector('#exam-abandon').onclick = () => {
    attempt.phase = 'done';
    attempt.retestScore = null;
    ctx.save();
    repaint();
  };
}

// #region retest

function paintRetest(el, ctx, attempt, repaint) {
  el.innerHTML = `
    <div class="card">
      <h2>Tier 1 retest — recall all 20</h2>
      <p class="muted">Type the 20 abstract words back, in the order you encoded them. Passing requires 20/20.</p>
      <form id="retest-form">
        ${attempt.words.map((_, i) => `
          <div class="recall-row">
            <span class="locus-num">${i + 1}</span>
            <input class="recall-input" data-i="${i}" autocomplete="off" placeholder="word ${i + 1}">
          </div>`).join('')}
        <button class="btn btn-primary" type="submit">Submit recall</button>
      </form>
    </div>`;
  const inputs = [...el.querySelectorAll('.recall-input')];
  inputs[0].focus();
  inputs.forEach((inp, i) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (i + 1 < inputs.length) inputs[i + 1].focus();
        else el.querySelector('#retest-form').requestSubmit();
      }
    });
  });
  el.querySelector('#retest-form').onsubmit = (e) => {
    e.preventDefault();
    const guesses = inputs.map(inp => inp.value);
    const results = attempt.words.map((w, i) => ({
      word: w,
      guess: guesses[i] || '',
      ok: fuzzyEqual(guesses[i] || '', w, 2),
    }));
    attempt.retestScore = results.filter(r => r.ok).length;
    attempt.passed = attempt.retestScore === attempt.words.length;
    attempt.recall = guesses;
    attempt.phase = 'done';
    ctx.save();
    paintVerdict(el, ctx, attempt, results, repaint);
  };
}

// #region verdict

function paintVerdict(el, ctx, attempt, results, repaint) {
  const chip = document.getElementById('certified-chip');
  if (chip && attempt.passed) chip.textContent = '◆ Tier 1 certified';
  if (attempt.passed) {
    // let the embedding shell celebrate too (AuraOS applet → desktop toast);
    // harmless no-op when standalone.
    try {
      parent.postMessage({ type: 'tier1-certified', profile: ctx.profile.name, score: attempt.retestScore, total: attempt.words.length }, '*');
    } catch (err) { /* not embedded */ }
  }
  el.innerHTML = `
    <div class="card ${attempt.passed ? 'pass' : 'fail'}">
      <h2>${attempt.passed ? 'TIER 1 CERTIFIED' : 'Not this time'}</h2>
      <p>Recall: <b>${attempt.retestScore}/${attempt.words.length}</b>${attempt.passed
        ? ' — 100% required, 100% achieved.'
        : ' — certification requires 20/20.'}</p>
      <table class="table">
        <thead><tr><th>#</th><th>expected word</th><th>you typed</th><th></th></tr></thead>
        <tbody>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(r.word)}</td>
              <td>${esc(r.guess) || '—'}</td>
              <td class="${r.ok ? 'good' : 'bad'}">${r.ok ? '✓' : '✗'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="row-end"><button id="exam-home" class="btn btn-primary">back</button></div>
    </div>`;
  el.querySelector('#exam-home').onclick = () => repaint();
}
