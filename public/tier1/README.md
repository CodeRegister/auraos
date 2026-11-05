# Tier 1 — Memory Training

A zero-dependency, pure-frontend memory training gym: encoding drills with
seeded prompt generation, a memory palace builder with fuzzy typed recall,
link chains for sequence memory, and the Tier 1 certification gate.

Current version: **1.0.0** · no build step, no framework, no server.

## Why

Most memory-training sites gate the good stuff behind accounts and servers.
Tier 1 is a single static page: everything — scores, palaces, exam attempts —
lives in your browser's localStorage. Profiles on the same device act as
"other users" so the drill's peer-calibration panel has something to show
without a backend.

## Features

### Encoding Drill

- Combined prompts: a concept (concrete or abstract) plus a random constraint
  from the bundled template bank ("must involve a smell", "scale it to
  building size", "must be physically impossible", …)
- Difficulty ramps up across sessions (easy → medium → hard weights)
- Prompts never repeat within a 5-session window
- The timer runs while you write the image; submitting locks it in
- Four-tap self rubric — vivid / multi-sensory / moving / bizarre —
  score = taps / 4
- "Rewrite later" parks the prompt in a personal backlog
- Peer calibration: after submitting, a random past answer for the same
  concept from another profile on the device is shown

### Palace Builder

- Palaces = name + ordered loci, drag & drop (plus arrow buttons) to reorder
- Four quiz modes: locus → item and item → locus, each forward and reversed
- Typed answers, fuzzy-matched with Levenshtein distance ≤ 2
- Per-palace accuracy, mean recall latency and last-used timestamp
- Three seed palaces bundled: home, commute, grocery store

### Link Chain

- Pull 5/10/15 items from a bundled theme or from your capture queue
- Each item flashes for exactly 5 seconds
- The countdown pauses while the tab is hidden, so nothing flashes unseen
- Type them back in order; score = items in the correct position
- The capture queue lets you chain your own material

### Tier 1 Exam (certification gate)

- 20 abstract concepts, freshly drawn each attempt
- 3 minutes to encode all of them
- A sealed 24-hour wait
- Recall retest: 100% (20/20) required to certify

## Quick start

Tier 1 is plain ES modules — serve the folder over HTTP (opening
`index.html` from `file://` will not receive the JSON data banks):

    python3 -m http.server 8080
    # → http://localhost:8080

or `npm start` (same thing), or drop the folder on any static host.
Sanity checks: `npm test` (or `node test/sanity.mjs`).

## Editing the content banks

All prompt material is plain JSON under `data/`:

| file | what it holds |
| --- | --- |
| `data/concepts.json` | concrete + abstract concepts in three difficulty tiers |
| `data/constraints.json` | the constraint templates for the drill |
| `data/themes.json` | themed item pools for link chains |
| `data/seed-palaces.json` | the three importable starter palaces |

Add, remove or reword entries freely — the lists do not need to stay balanced.

## Session seeds

Every profile has a seed. Session N's prompts are a pure function of
`seed + N`, which gives two properties:

- no repeats: concepts used in the last four sessions are excluded from the
  draw, so nothing repeats within any 5-session window
- portability: **Settings → Session seed** exports a short string like
  `T1:k3xw9f-m2q7yz0m~c`; import it on another profile (or browser) and the
  same session sequence replays from that point.

## Data & privacy

- No server, no accounts, no analytics.
- All state lives in localStorage under the key `tier1:v1`.
- Export/import everything as JSON from Settings → Data.

## Project layout

    index.html          app shell
    css/style.css       single stylesheet
    js/main.js          shell: tabs, profiles, settings
    js/store.js         localStorage persistence, seeds
    js/drill.js         encoding drill
    js/palace.js        palace builder + quizzes
    js/chain.js         link chains + capture queue
    js/exam.js          tier 1 certification gate
    js/rng.js           seeded PRNG
    js/levenshtein.js   fuzzy answer matching
    js/util.js          small DOM/format helpers
    data/*.json         editable content banks
    test/sanity.mjs     node sanity checks

## Acceptance checklist

- [x] 5 sessions without a repeated prompt (seeded exclusion window)
- [x] session seed exports as a short string and re-imports
- [x] rubric score = taps / 4, stored with time-to-encode
- [x] "rewrite later" feeds a personal backlog
- [x] peer answers shown from other local profiles
- [x] palace quizzes: both directions, forward and reversed, Levenshtein ≤ 2
- [x] per-palace accuracy, mean latency, last used
- [x] link chains: 5-second presentation, positional scoring
- [x] exam: 20 fresh abstract concepts, 3-minute encode, 24h retest, 100%

## License

MIT — see [LICENSE](LICENSE).

## Troubleshooting

- **Blank page / no prompts?** You probably opened `index.html` via `file://`.
  Serve the folder over HTTP (`python3 -m http.server`).
- **Lost everything?** localStorage is per-origin: always use the same host
  and port, or export your data from Settings first.
- **Peer panel empty?** It only has data once another profile on this device
  has encoded the same concept.

## Palace quiz modes

| mode | cue | you type |
| --- | --- | --- |
| locus → item (forward) | first locus → last, in order | the item stored there |
| locus → item (reversed) | last locus → first | the item stored there |
| item → locus (forward) | items in order | which locus holds it |
| item → locus (reversed) | items in reverse order | which locus holds it |

Loci without an answer on the required side are skipped, and a mode needs at
least two answerable loci before a quiz can start.

## Browser support

Any current Chrome, Edge, Firefox or Safari. The app uses ES2021 modules,
`replaceAll` and optional chaining — nothing older is targeted.

## Known limitations

- Everything is single-device: localStorage does not sync across browsers or
  machines (use Settings → Data to move a snapshot by hand).
- Peer calibration is only as good as the other profiles on the device.
- The 24-hour exam wait is enforced by the clock, not by cryptography —
  the point is training honesty, not anti-cheat.
