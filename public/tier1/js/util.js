// Tiny DOM/format helpers shared across views.

// #region escaping

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// #region time formatting

export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}

export function fmtDur(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return total + 's';
  const m = Math.floor(total / 60);
  if (m < 60) return m + 'm ' + (total % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

export function fmtAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + ' min ago';
  if (d < 86400000) return Math.floor(d / 3600000) + ' h ago';
  return Math.floor(d / 86400000) + ' d ago';
}
