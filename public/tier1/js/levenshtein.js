// Levenshtein distance, used for fuzzy recall checks with a tolerance
// of two edits, as specified for typed palace answers.

// #region distance

export function levenshtein(a, b) {
  const s = String(a).normalize('NFC').toLowerCase().trim();
  const t = String(b).normalize('NFC').toLowerCase().trim();
  if (s === t) return 0;
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

// #region matching helpers

export function fuzzyEqual(a, b, tolerance = 2) {
  const s = String(a).normalize('NFC');
  const t = String(b).normalize('NFC');
  if (Math.abs(s.length - t.length) > tolerance) return false;
  return levenshtein(s, t) <= tolerance;
}
