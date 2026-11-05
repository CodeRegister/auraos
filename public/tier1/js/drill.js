// Encoding Drill: combined prompts (concept + constraint), timed imagery,
// four-tap rubric scoring, a personal backlog, and peer answers pulled
// from other profiles on this device for self-calibration.

import { makeRng } from './rng.js';
import { bumpSession } from './store.js';
import { esc, fmtClock, fmtDur } from './util.js';

let conceptsCache = null;
let constraintsCache = null;

async function loadConcepts() {
  if (!conceptsCache) {
    conceptsCache = await (await fetch('data/concepts.json')).json();
  }
  return conceptsCache;
}

async function loadConstraints() {
  if (!constraintsCache) {
    constraintsCache = await (await fetch('data/constraints.json')).json();
  }
  return constraintsCache;
}

function tierWeights(sessionCount) {
  if (sessionCount < 3) return { easy: 0.7, medium: 0.3, hard: 0.0 };
  if (sessionCount < 6) return { easy: 0.4, medium: 0.4, hard: 0.2 };
  if (sessionCount < 10) return { easy: 0.2, medium: 0.4, hard: 0.4 };
  return { easy: 0.1, medium: 0.35, hard: 0.55 };
}

// #region session planning

function pickTier(rng, weights) {
  const r = rng.next();
  let acc = 0;
  for (const tier of ['easy', 'medium', 'hard']) {
    acc += weights[tier];
    if (r <= acc) return tier;
  }
  return 'hard';
}

export function planSession(seedStr, sessionCount, concepts, constraints, recentConcepts) {
  const rng = makeRng(seedStr + ':s' + sessionCount);
  const weights = tierWeights(sessionCount);
  const banned = new Set(recentConcepts.flat());
  const poolFor = (tier) => {
    const all = [...concepts.concrete[tier], ...concepts.abstract[tier]];
    const fresh = all.filter(c => !banned.has(c));
    return fresh.length ? fresh : all;
  };
  const used = new Set();
  const plan = [];
  for (let i = 0; i < 5; i++) {
    const tier = pickTier(rng, weights);
    let avail = poolFor(tier).filter(c => !used.has(c));
    if (!avail.length) avail = poolFor(tier);
    const concept = rng.pick(avail);
    used.add(concept);
    plan.push({
      kind: concepts.concrete[tier].includes(concept) ? 'concrete' : 'abstract',
      tier,
      concept,
      constraint: rng.pick(constraints),
    });
  }
  return plan;
}

// #region view scaffold

let timerInt = null;

export function destroy() {
  if (timerInt) clearInterval(timerInt);
  timerInt = null;
}

export async function render(el, ctx) {
  const session = { plan: null, phase: null, index: 0, taps: null, startTs: 0, used: [], entryText: '', seconds: 0, pullBacklog: null };
  const repaint = () => {
    destroy();
    if (!session.plan || session.phase === null) paintIdle(el, ctx, session, repaint);
    else if (session.phase === 'encode') paintEncode(el, ctx, session, repaint);
    else if (session.phase === 'rubric') paintRubric(el, ctx, session, repaint);
    else if (session.phase === 'result') paintResult(el, ctx, session, repaint);
    else if (session.phase === 'summary') paintSummary(el, ctx, session, repaint);
  };
  repaint();
}

// #region idle view

function paintIdle(el, ctx, session, repaint) {
  const p = ctx.profile;
  const backlogHtml = p.drill.backlog.map((b, i) => `
    <div class="row-item ${isOverdue(b) ? 'overdue' : ''}">
      <span class="row-main"><b>${esc(b.concept)}</b> — ${esc(b.constraint)}</span>
      <button class="btn btn-ghost btn-sm" data-take="${i}">take</button>
      <button class="btn btn-ghost btn-sm" data-drop="${i}">✕</button>
    </div>`).join('') || '<p class="muted small">Backlog is empty. Tap "rewrite later" during scoring to park a prompt here.</p>';

  el.innerHTML = `
    <div class="split">
      <div class="card">
        <h2>Encoding Drill</h2>
        <p class="muted">Session ${p.seed.sessionCount + 1}: five combined prompts — a concept plus a constraint.
        Write a vivid image for each; the clock runs from the moment the prompt appears.</p>
        <button id="start-session" class="btn btn-primary">Start session</button>
        <p class="muted small">Prompts are seeded, so any session can be replayed from its seed (Settings → session seed).</p>
      </div>
      <div class="card">
        <h3>Backlog <span class="badge">${p.drill.backlog.length}</span></h3>
        <div id="backlog-list">${backlogHtml}</div>
      </div>
    </div>`;

  el.querySelector('#start-session').onclick = () => startSession(ctx, session, repaint);
  el.querySelectorAll('[data-take]').forEach(btn => {
    btn.onclick = () => { session.pullBacklog = Number(btn.dataset.take); startSession(ctx, session, repaint); };
  });
  el.querySelectorAll('[data-drop]').forEach(btn => {
    btn.onclick = () => { p.drill.backlog.splice(Number(btn.dataset.drop), 1); ctx.save(); repaint(); };
  });
}

async function startSession(ctx, session, repaint) {
  const p = ctx.profile;
  const [concepts, constraints] = await Promise.all([loadConcepts(), loadConstraints()]);
  const plan = planSession(p.seed.current, p.seed.sessionCount, concepts, constraints, p.seed.recentConcepts);
  if (typeof session.pullBacklog === 'number') {
    const b = p.drill.backlog.splice(session.pullBacklog, 1)[0];
    if (b) plan[0] = { kind: b.kind, tier: b.tier, concept: b.concept, constraint: b.constraint, fromBacklog: true };
    session.pullBacklog = null;
  }
  session.plan = plan;
  session.index = 0;
  session.used = [];
  session.taps = null;
  session.phase = 'encode';
  ctx.save();
  repaint();
}

// #region encoding view

function paintEncode(el, ctx, session, repaint) {
  const prompt = session.plan[session.index];
  session.startTs = Date.now();
  el.innerHTML = `
    <div class="card prompt-card">
      <div class="prompt-meta">
        <span class="chip">${prompt.kind}</span>
        <span class="chip chip-tier">${prompt.tier}</span>
        ${prompt.fromBacklog ? '<span class="chip">from backlog</span>' : ''}
        <span class="timer" id="drill-timer">0:00</span>
      </div>
      <h2 class="prompt-concept">${esc(prompt.concept)}</h2>
      <p class="prompt-constraint">constraint: ${esc(prompt.constraint)}</p>
      <textarea id="drill-text" rows="9" placeholder="Close your eyes for a beat, then write the image: what do you see, hear, smell, feel?"></textarea>
      <div class="row-end">
        <button id="drill-submit" class="btn btn-primary">Lock it in</button>
      </div>
    </div>
    <p class="muted small center">prompt ${session.index + 1} of ${session.plan.length}</p>`;
  const textEl = el.querySelector('#drill-text');
  textEl.focus();
  timerInt = setInterval(() => {
    const t = el.querySelector('#drill-timer');
    if (t) t.textContent = fmtClock(Date.now() - session.startTs);
  }, 500);
  el.querySelector('#drill-submit').onclick = () => {
    clearInterval(timerInt);
    timerInt = null;
    session.entryText = textEl.value.trim();
    session.seconds = (Date.now() - session.startTs) / 1000;
    session.taps = { vivid: false, multi: false, moving: false, bizarre: false };
    session.phase = 'rubric';
    repaint();
  };
}

// #region rubric

const RUBRIC = [
  ['vivid', 'Vivid — I can genuinely see it'],
  ['multi', 'Multi-sensory — more than one sense fires'],
  ['moving', 'Moving — it has motion or change'],
  ['bizarre', 'Bizarre — strange enough to stick'],
];

function paintRubric(el, ctx, session, repaint) {
  const prompt = session.plan[session.index];
  el.innerHTML = `
    <div class="card">
      <h2>${esc(prompt.concept)}</h2>
      <p class="muted">Time to encode: ${fmtDur(session.seconds * 1000)} — tap everything that applies. Score = taps / 4.</p>
      <div class="rubric">
        ${RUBRIC.map(([key, label]) => `
          <button class="tap" data-tap="${key}" aria-pressed="false">
            <span class="tap-key">${key}</span>
            <span>${label}</span>
          </button>`).join('')}
      </div>
      <p class="muted small">Your image: <em>${esc(session.entryText) || '<i>(empty)</i>'}</em></p>
      <div class="row-end">
        <button id="rewrite-later" class="btn btn-ghost">Rewrite later</button>
        <button id="rubric-save" class="btn btn-primary">Save &amp; continue</button>
      </div>
    </div>`;
  el.querySelectorAll('[data-tap]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.tap;
      session.taps[key] = !session.taps[key];
      btn.classList.toggle('on', session.taps[key]);
      btn.setAttribute('aria-pressed', String(session.taps[key]));
    };
  });
  el.querySelector('#rewrite-later').onclick = () => {
    ctx.profile.drill.backlog.push({
      kind: prompt.kind,
      tier: prompt.tier,
      concept: prompt.concept,
      constraint: prompt.constraint,
      addedTs: Date.now(),
    });
    ctx.save();
    saveEntry(ctx, session, repaint, true);
  };
  el.querySelector('#rubric-save').onclick = () => saveEntry(ctx, session, repaint, false);
}

function saveEntry(ctx, session, repaint, rewriteLater) {
  const p = ctx.profile;
  const prompt = session.plan[session.index];
  const taps = session.taps;
  const score = Object.values(taps).filter(Boolean).length / 4;
  p.drill.history.push({
    ts: Date.now(),
    session: p.seed.sessionCount,
    kind: prompt.kind,
    tier: prompt.tier,
    concept: prompt.concept,
    constraint: prompt.constraint,
    text: session.entryText,
    taps: { ...taps },
    score,
    seconds: Math.round(session.seconds),
    rewriteLater,
  });
  session.used.push(prompt.concept);
  ctx.save();
  session.phase = 'result';
  repaint();
}

// #region results & peer answers

function paintResult(el, ctx, session, repaint) {
  const p = ctx.profile;
  const prompt = session.plan[session.index];
  const entry = p.drill.history[p.drill.history.length - 1];
  const peer = findPeerAnswer(ctx, prompt.concept);
  const mine = lastOwnAnswer(p, prompt.concept, entry.ts);
  el.innerHTML = `
    <div class="split">
      <div class="card">
        <h2>${esc(prompt.concept)}</h2>
        <p>Score: <b class="score">${Math.round(entry.score * 100)}%</b> · ${fmtDur(entry.seconds * 1000)} to encode
          ${entry.rewriteLater ? '· <span class="chip">parked in backlog</span>' : ''}</p>
        <div class="row-end">
          ${session.index + 1 < session.plan.length
            ? '<button id="drill-next" class="btn btn-primary">Next prompt</button>'
            : '<button id="drill-finish" class="btn btn-primary">Finish session</button>'}
        </div>
      </div>
      <div class="card">
        <h3>Self-calibration</h3>
        <div id="peer-body">${peerHtml(peer, mine)}${personalBestHtml(p, prompt.concept, entry.ts)}</div>
      </div>
    </div>`;
  const next = el.querySelector('#drill-next');
  if (next) {
    next.onclick = () => {
      session.index += 1;
      session.taps = null;
      session.phase = 'encode';
      repaint();
    };
  }
  const finish = el.querySelector('#drill-finish');
  if (finish) finish.onclick = () => finishSession(ctx, session, repaint);
}

function findPeerAnswer(ctx, concept) {
  const s = ctx.store.load();
  const others = s.profiles.filter(q => q.id !== ctx.profile.id);
  const pool = others.flatMap(q => q.drill.history
    .filter(h => h.concept === concept && !h.rewriteLater && h.text)
    .map(h => ({ who: q.name, text: h.text, score: h.score, seconds: h.seconds })));
  if (!pool.length) return null;
  const rng = makeRng(concept + ':' + Date.now());
  return rng.pick(pool);
}

function lastOwnAnswer(p, concept, beforeTs) {
  const mine = p.drill.history.filter(h => h.concept === concept && h.ts < beforeTs);
  return mine.length ? mine[mine.length - 1] : null;
}

function peerHtml(peer, mine) {
  if (!peer && !mine) {
    return '<p class="muted small">No peer data for this concept yet. Other profiles on this device act as "other users" — encode the same concept in one and their past answers will show up here.</p>';
  }
  let html = '';
  if (peer) {
    html += `
      <div class="peer-card">
        <p class="muted small">from profile <b>${esc(peer.who)}</b></p>
        <p>${esc(peer.text)}</p>
        <p class="muted small">their score ${Math.round(peer.score * 100)}% · ${fmtDur((peer.seconds || 0) * 1000)}</p>
      </div>`;
  }
  if (mine) {
    html += `<p class="muted small">Your last take: score ${Math.round(mine.score * 100)}%, "${esc((mine.text || '').slice(0, 120))}"</p>`;
  }
  return html;
}

// #region session summary

function finishSession(ctx, session, repaint) {
  bumpSession(session.used);
  session.phase = 'summary';
  repaint();
}

function paintSummary(el, ctx, session, repaint) {
  const p = ctx.profile;
  const sessionNo = p.seed.sessionCount;
  const entries = p.drill.history.filter(h => h.session === sessionNo - 1);
  const avgScore = entries.reduce((a, h) => a + h.score, 0) / Math.max(1, entries.length);
  const avgTime = entries.reduce((a, h) => a + h.seconds, 0) / Math.max(1, entries.length);
  el.innerHTML = `
    <div class="card">
      <h2>Session ${sessionNo} complete</h2>
      <p>Average score <b>${Math.round(avgScore * 100)}%</b> · mean encode <b>${fmtDur(avgTime * 1000)}</b></p>
      <table class="table">
        <thead><tr><th>concept</th><th>constraint</th><th>score</th><th>time</th></tr></thead>
        <tbody>
          ${entries.map(h => `
            <tr>
              <td>${esc(h.concept)}</td>
              <td class="muted">${esc(h.constraint)}</td>
              <td>${Math.round(h.score * 100)}%</td>
              <td>${fmtDur(h.seconds * 1000)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="row-end"><button id="drill-again" class="btn btn-primary">Back to start</button></div>
    </div>`;
  el.querySelector('#drill-again').onclick = () => {
    session.plan = null;
    session.phase = null;
    repaint();
  };
}

// #region backlog helpers

export function isOverdue(item, days = 7) {
  return Date.now() - item.addedTs > days * 86400000;
}

function personalBestHtml(p, concept, beforeTs) {
  const mine = p.drill.history.filter(h => h.concept === concept && h.ts < beforeTs && h.score > 0);
  if (!mine.length) return '';
  const best = mine.reduce((a, h) => (h.score > a.score ? h : a));
  return `<p class="muted small">personal best on this concept: ${Math.round(best.score * 100)}% in ${fmtDur(best.seconds * 1000)}</p>`;
}
