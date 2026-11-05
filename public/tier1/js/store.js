// Persistence layer. All state lives in localStorage under one key so the
// whole app works offline and every profile keeps its own progress.

import { randomSeed } from './rng.js';

const KEY = 'tier1:v1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blankProfile(name) {
  return {
    id: uid(),
    name: name || 'me',
    createdAt: Date.now(),
    seed: { current: randomSeed(), sessionCount: 0, recentConcepts: [] },
    drill: { history: [], backlog: [] },
    palaces: [],
    chain: { history: [], captureQueue: [] },
    exam: { attempts: [] },
  };
}

// #region core state

let state = null;

export function load() {
  if (state) return state;
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { state = JSON.parse(raw); } catch (err) { state = null; }
  }
  if (!state || !Array.isArray(state.profiles) || state.profiles.length === 0) {
    state = { version: 1, activeProfileId: null, profiles: [] };
    const p = blankProfile('me');
    state.profiles.push(p);
    state.activeProfileId = p.id;
  }
  return state;
}

// #region persistence

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getActive() {
  const s = load();
  return s.profiles.find(p => p.id === s.activeProfileId) || s.profiles[0];
}

export function activeId() {
  const s = load();
  return s.activeProfileId || s.profiles[0].id;
}

// #region profiles

export function createProfile(name) {
  const s = load();
  const p = blankProfile(name || 'profile ' + (s.profiles.length + 1));
  s.profiles.push(p);
  s.activeProfileId = p.id;
  save();
  return p;
}

export function switchProfileId(id) {
  const s = load();
  if (s.profiles.some(p => p.id === id)) {
    s.activeProfileId = id;
    save();
  }
}

export function deleteProfile(id) {
  const s = load();
  if (s.profiles.length <= 1) return false;
  s.profiles = s.profiles.filter(p => p.id !== id);
  if (!s.profiles.some(p => p.id === s.activeProfileId)) {
    s.activeProfileId = s.profiles[0].id;
  }
  save();
  return true;
}

// #region seeds & maintenance

export function exportSeedString() {
  const p = getActive();
  return 'T1:' + p.seed.current + '~' + p.seed.sessionCount.toString(36);
}

export function importSeedString(str) {
  const m = /^T1:([a-z0-9-]+)~([a-z0-9]+)$/i.exec(String(str || '').trim());
  if (!m) return false;
  const p = getActive();
  p.seed.current = m[1];
  p.seed.sessionCount = parseInt(m[2], 36) || 0;
  p.seed.recentConcepts = [];
  save();
  return true;
}

export function bumpSession(conceptsUsed) {
  const p = getActive();
  p.seed.sessionCount += 1;
  p.seed.recentConcepts.push(conceptsUsed);
  p.seed.recentConcepts = p.seed.recentConcepts.slice(-4);
  save();
}

export function resetProfile() {
  const p = getActive();
  const fresh = blankProfile(p.name);
  Object.assign(p, fresh, { id: p.id, createdAt: p.createdAt });
  save();
}

export function exportAll() {
  return JSON.stringify(load(), null, 2);
}

export function importAll(json) {
  try {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.profiles)) return false;
    state = data;
    save();
    return true;
  } catch (err) {
    return false;
  }
}
