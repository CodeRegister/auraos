// Seeded PRNG utilities. Session randomness is fully reproducible:
// the same seed always replays the same prompt sequence, which is what
// the seed export/import feature round-trips.

// #region hashing

export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// #region rng helpers

export function makeRng(seedStr) {
  const rand = mulberry32(hashString(seedStr));
  return {
    next: rand,
    int(min, max) {
      return min + Math.floor(rand() * (max - min + 1));
    },
    pick(arr) {
      if (!arr.length) return undefined;
      return arr[Math.floor(rand() * arr.length)];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    },
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff).toString(36) + '-' + Date.now().toString(36);
}
