# Local edits (AuraOS applet patch)

This is a vendored copy of https://github.com/CodeRegister/tier-1 (MIT — see
LICENSE), lightly patched for life inside AuraOS. Upstream concepts and all
credit belong to the original author.

Patches on top of upstream 1.0.0:

1. **First-run seed palaces** (`js/palace.js`, `js/main.js`)
   New profiles get the three seed palaces (home / commute / grocery store)
   automatically on first boot. Flagged per profile (`seedPalacesAutoImported`),
   so deleting them afterwards does not re-import. The manual
   "import seed palaces" button still exists and shares the same code path.

2. **File-based backups** (`js/main.js`, Settings → Data)
   - `download .json` — saves a `tier1-backup-YYYY-MM-DD.json` via a Blob
     download instead of copy-paste.
   - `import from file` — restores from a downloaded backup via file picker.
   The original text export/import (textarea) is unchanged.

3. **Certification event** (`js/exam.js`)
   On a passed retest the app posts `parent.postMessage({ type:
   'tier1-certified', ... })` so the embedding shell can celebrate — in
   AuraOS this triggers a desktop toast. No-op when standalone.

Nothing else was touched: data format is unchanged (old backups import fine,
new exports import into upstream), seeds/RNG untouched, all 20 upstream
sanity tests still pass.
