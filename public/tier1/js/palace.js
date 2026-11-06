// Palace Builder: named palaces with ordered loci, drag & drop reordering,
// four quiz modes with fuzzy typed answers, and per-palace stats.

import { fuzzyEqual } from './levenshtein.js';
import { esc, fmtAgo, fmtDur } from './util.js';
import { uid } from './store.js';

let seedPalacesCache = null;

async function loadSeedPalaces() {
  if (!seedPalacesCache) {
    seedPalacesCache = await (await fetch('data/seed-palaces.json')).json();
  }
  return seedPalacesCache;
}

// shared importer (button + first-run auto-import): adds every seed palace
// whose name isn't taken yet, returns how many were added.
export async function importSeedPalaces(ctx) {
  const seeds = await loadSeedPalaces();
  const p = ctx.profile;
  let added = 0;
  for (const s of seeds) {
    if (p.palaces.some(pl => pl.name === s.name)) continue;
    p.palaces.push({ id: uid(), name: s.name, loci: s.loci.map(l => ({ id: uid(), name: l.name, item: l.item || '' })), createdAt: Date.now(), lastUsed: null, stats: { attempts: 0, correct: 0, latencySum: 0 } });
    added++;
  }
  if (added) ctx.save();
  return added;
}

// #region list view

let editor = null;   // {id, name, loci: [{id, name, item}]}
let quiz = null;     // {palaceId, mode, questions, i, results, startTs}
let dragIdx = -1;

export function destroy() {}

export function render(el, ctx) {
  const repaint = () => render(el, ctx);
  if (quiz) paintQuiz(el, ctx, quiz, repaint);
  else if (editor) paintEditor(el, ctx, editor, repaint);
  else paintList(el, ctx, repaint);
}

function paintList(el, ctx, repaint) {
  const p = ctx.profile;
  const cards = p.palaces.map(pl => {
    const acc = pl.stats.attempts ? Math.round((pl.stats.correct / pl.stats.attempts) * 100) : null;
    const mean = pl.stats.attempts ? pl.stats.latencySum / pl.stats.attempts : null;
    return `
      <div class="card palace-card">
        <div class="row-between">
          <h3>${esc(pl.name)}</h3>
          <span class="muted small">${pl.loci.length} loci · ${pl.lastUsed ? 'used ' + fmtAgo(pl.lastUsed) : 'never used'}</span>
        </div>
        <p class="muted">accuracy ${acc === null ? '—' : acc + '%'} · mean recall ${mean === null ? '—' : fmtDur(mean)}</p>
        <div class="row-end">
          <button class="btn btn-ghost btn-sm" data-edit="${pl.id}">edit</button>
          <button class="btn btn-primary btn-sm" data-quiz="${pl.id}">quiz</button>
        </div>
      </div>`;
  }).join('') || '<p class="muted">No palaces yet — create one or import the seed palaces below.</p>';

  el.innerHTML = `
    <div class="row-between">
      <h2>Palace Builder</h2>
      <div>
        <button id="import-seeds" class="btn btn-ghost btn-sm">import seed palaces</button>
        <button id="new-palace" class="btn btn-primary btn-sm">new palace</button>
      </div>
    </div>
    <div class="grid2">${cards}</div>`;

  el.querySelector('#new-palace').onclick = () => {
    editor = { id: null, name: '', loci: [{ id: uid(), name: '', item: '' }] };
    repaint();
  };
  el.querySelector('#import-seeds').onclick = async () => {
    await importSeedPalaces(ctx);
    repaint();
  };
  el.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => {
      const pl = p.palaces.find(x => x.id === b.dataset.edit);
      editor = { id: pl.id, name: pl.name, loci: pl.loci.map(l => ({ ...l })) };
      repaint();
    };
  });
  el.querySelectorAll('[data-quiz]').forEach(b => {
    b.onclick = () => startQuizSetup(el, ctx, b.dataset.quiz, repaint);
  });
}

// #region editor

function paintEditor(el, ctx, ed, repaint) {
  const rows = ed.loci.map((l, i) => `
    <div class="locus-row" draggable="true" data-idx="${i}">
      <span class="drag-handle" title="drag to reorder">⋮⋮</span>
      <span class="locus-num">${i + 1}</span>
      <input class="locus-name" data-i="${i}" data-field="name" value="${esc(l.name)}" placeholder="locus (e.g. front door)">
      <input class="locus-item" data-i="${i}" data-field="item" value="${esc(l.item)}" placeholder="item to store (optional)">
      <button class="btn btn-ghost btn-sm" data-up="${i}" title="move up">▲</button>
      <button class="btn btn-ghost btn-sm" data-down="${i}" title="move down">▼</button>
      <button class="btn btn-ghost btn-sm" data-del="${i}" title="remove locus">✕</button>
    </div>`).join('');

  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>${ed.id ? 'Edit palace' : 'New palace'}</h2>
        <button id="editor-back" class="btn btn-ghost btn-sm">← back</button>
      </div>
      <input id="palace-name" value="${esc(ed.name)}" placeholder="palace name (e.g. childhood home)">
      <p class="muted small">Order matters for forward/reverse recall. Drag rows or use the arrows. Loci without an item are skipped in item → locus mode.</p>
      <div id="loci">${rows}</div>
      <div class="row-end">
        <button id="add-locus" class="btn btn-ghost">+ add locus</button>
        <button id="save-palace" class="btn btn-primary">Save palace</button>
      </div>
    </div>`;

  el.querySelector('#editor-back').onclick = () => { editor = null; repaint(); };
  el.querySelector('#add-locus').onclick = () => {
    collectInputs(el, ed);
    ed.loci.push({ id: uid(), name: '', item: '' });
    repaint();
  };
  el.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('change', () => collectInputs(el, ed));
  });
  el.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      collectInputs(el, ed);
      ed.loci.splice(Number(b.dataset.del), 1);
      repaint();
    };
  });
  el.querySelectorAll('[data-up]').forEach(b => {
    b.onclick = () => {
      collectInputs(el, ed);
      moveLocus(ed, Number(b.dataset.up), -1);
      repaint();
    };
  });
  el.querySelectorAll('[data-down]').forEach(b => {
    b.onclick = () => {
      collectInputs(el, ed);
      moveLocus(ed, Number(b.dataset.down), +1);
      repaint();
    };
  });
  el.querySelector('#save-palace').onclick = () => {
    collectInputs(el, ed);
    const p = ctx.profile;
    const name = ed.name.trim();
    const loci = ed.loci.filter(l => l.name.trim());
    if (!name || !loci.length) return;
    if (ed.id) {
      const pl = p.palaces.find(x => x.id === ed.id);
      pl.name = name;
      pl.loci = loci;
    } else {
      p.palaces.push({ id: uid(), name, loci, createdAt: Date.now(), lastUsed: null, stats: { attempts: 0, correct: 0, latencySum: 0 } });
    }
    ctx.save();
    editor = null;
    repaint();
  };

  wireDragAndDrop(el, ed, repaint);
}

function collectInputs(el, ed) {
  el.querySelectorAll('input[data-field]').forEach(inp => {
    ed.loci[Number(inp.dataset.i)][inp.dataset.field] = inp.value;
  });
  const nameEl = el.querySelector('#palace-name');
  if (nameEl) ed.name = nameEl.value;
}

function moveLocus(ed, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= ed.loci.length) return;
  const tmp = ed.loci[i];
  ed.loci[i] = ed.loci[j];
  ed.loci[j] = tmp;
}

// #region drag & drop

function wireDragAndDrop(el, ed, repaint) {
  const rows = [...el.querySelectorAll('.locus-row')];
  rows.forEach(row => {
    row.addEventListener('dragstart', (e) => {
      dragIdx = Number(row.dataset.idx);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = Number(row.dataset.idx);
      collectInputs(el, ed);
      if (dragIdx < 0 || dragIdx === target) return;
      const [moved] = ed.loci.splice(dragIdx, 1);
      ed.loci.splice(target, 0, moved);
      dragIdx = -1;
      repaint();
    });
  });
}

// #region quiz

const QUIZ_MODES = [
  { id: 'locus-item-fwd', label: 'locus → item (forward)' },
  { id: 'locus-item-rev', label: 'locus → item (reversed)' },
  { id: 'item-locus-fwd', label: 'item → locus (forward)' },
  { id: 'item-locus-rev', label: 'item → locus (reversed)' },
];

function startQuizSetup(el, ctx, palaceId, repaint) {
  const pl = ctx.profile.palaces.find(x => x.id === palaceId);
  el.innerHTML = `
    <div class="card">
      <h2>Quiz: ${esc(pl.name)}</h2>
      <label class="field">Mode
        <select id="quiz-mode">${QUIZ_MODES.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}</select>
      </label>
      <p id="quiz-warn" class="muted small"></p>
      <div class="row-end">
        <button id="quiz-cancel" class="btn btn-ghost">cancel</button>
        <button id="quiz-start" class="btn btn-primary">Start quiz</button>
      </div>
    </div>`;
  el.querySelector('#quiz-cancel').onclick = () => repaint();
  el.querySelector('#quiz-start').onclick = () => {
    const mode = el.querySelector('#quiz-mode').value;
    const qs = buildQuestions(pl, mode);
    if (qs.length < 2) {
      el.querySelector('#quiz-warn').textContent = 'Not enough answerable loci for this mode (need at least 2).';
      return;
    }
    quiz = { palaceId, mode, questions: qs, i: 0, results: [], startTs: 0 };
    repaint();
  };
}

function buildQuestions(pl, mode) {
  const reverse = mode.endsWith('-rev');
  const cueIsItem = mode.startsWith('item');
  let loci = pl.loci.filter(l => (cueIsItem ? l.name : l.item).trim());
  if (reverse) loci = loci.slice().reverse();
  return loci.map(l => ({
    cue: cueIsItem ? l.item : l.name,
    answer: cueIsItem ? l.name : l.item,
    locusName: l.name,
  }));
}

function paintQuiz(el, ctx, q, repaint) {
  if (q.i >= q.questions.length) {
    paintQuizResults(el, ctx, q, repaint);
    return;
  }
  const question = q.questions[q.i];
  const cueIsItem = q.mode.startsWith('item');
  q.startTs = Date.now();
  el.innerHTML = `
    <div class="card quiz-card">
      <p class="muted small">question ${q.i + 1} / ${q.questions.length} · ${modeLabel(q.mode)}</p>
      <h2 class="quiz-cue">${esc(question.cue)}</h2>
      <form id="quiz-form">
        <input id="quiz-answer" autocomplete="off" placeholder="${cueIsItem ? 'type the locus' : 'type the item'}">
        <button class="btn btn-primary" type="submit">check</button>
      </form>
      <p id="quiz-feedback" class="quiz-feedback"></p>
    </div>`;
  const input = el.querySelector('#quiz-answer');
  input.focus();
  el.querySelector('#quiz-form').onsubmit = (e) => {
    e.preventDefault();
    const guess = input.value;
    const ok = checkAnswer(guess, question.answer);
    const latency = Date.now() - q.startTs;
    q.results.push({ ...question, guess, ok, latency });
    const fb = el.querySelector('#quiz-feedback');
    fb.innerHTML = ok
      ? '<span class="good">✓ correct</span>'
      : `<span class="bad">✗ — expected: ${esc(question.answer)}</span>`;
    input.disabled = true;
    setTimeout(() => { q.i += 1; repaint(); }, ok ? 500 : 1300);
  };
  el.insertAdjacentHTML('beforeend', '<p class="center"><button id="quiz-quit" class="btn btn-ghost btn-sm">abandon quiz</button></p>');
  el.querySelector('#quiz-quit').onclick = () => { quiz = null; repaint(); };
}

function checkAnswer(guess, answer) {
  if (!guess.trim() || !answer.trim()) return false;
  return fuzzyEqual(guess, answer, 2);
}

function modeLabel(mode) {
  return QUIZ_MODES.find(m => m.id === mode).label;
}

// #region results & stats

function paintQuizResults(el, ctx, q, repaint) {
  const pl = ctx.profile.palaces.find(x => x.id === q.palaceId);
  const correct = q.results.filter(r => r.ok).length;
  const total = q.results.length;
  const latencySum = q.results.reduce((a, r) => a + r.latency, 0);
  pl.stats.attempts += total;
  pl.stats.correct += correct;
  pl.stats.latencySum += latencySum;
  pl.lastUsed = Date.now();
  ctx.save();
  const acc = Math.round((correct / total) * 100);
  el.innerHTML = `
    <div class="card">
      <h2>Quiz done — ${esc(pl.name)}</h2>
      <p>Run accuracy <b>${acc}%</b> (${correct}/${total}) · mean latency <b>${fmtDur(latencySum / total)}</b></p>
      <p class="muted">Palace totals: ${Math.round((pl.stats.correct / pl.stats.attempts) * 100)}% over ${pl.stats.attempts} answers</p>
      <table class="table">
        <thead><tr><th>#</th><th>cue</th><th>expected</th><th>you typed</th><th>latency</th></tr></thead>
        <tbody>
          ${q.results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(r.cue)}</td>
              <td>${esc(r.answer)}</td>
              <td class="${r.ok ? 'good' : 'bad'}">${esc(r.guess) || '—'}</td>
              <td>${fmtDur(r.latency)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="row-end">
        <button id="quiz-again" class="btn btn-ghost">quiz again</button>
        <button id="quiz-done" class="btn btn-primary">back to palaces</button>
      </div>
    </div>`;
  el.querySelector('#quiz-done').onclick = () => { quiz = null; repaint(); };
  el.querySelector('#quiz-again').onclick = () => {
    const palaceId = q.palaceId;
    quiz = null;
    startQuizSetup(el, ctx, palaceId, repaint);
  };
}
