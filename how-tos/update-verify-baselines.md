---
description: Compare the API, access-matrix and built-CSS baselines against a fresh build and seeded server, and re-record them after an intended change
scope: root
covers: [baseline, api-snapshot, access-matrix, css, tailwind, web-css, scratch-server, fixed-clock, compare, record, regression, permissions, verify, verify-done]
---

# Compare or re-record the verify baselines

The baselines are in `docs/verify/baseline/`: `api/` (every GET response as Priya and Marcus), `access.json` (the status every route returns to every kind of account) and `web-css.sha256` (the hash of the built CSS). `docs/verify/verify-done.sh` compares all three. The two scripts start and stop their own scratch server under a fixed clock, so you don't need to start one.

1. Compare:
   - `node docs/verify/api-snapshot.mjs --compare`
   - `node docs/verify/access-matrix.mjs --compare`

   Each exits 0 when nothing changed, and prints the differences otherwise.
2. Decide on each difference. If the change was not meant to happen, it is a regression: fix the code and compare again. Re-record only differences the change was meant to make.
3. Re-record what you meant to change: `node docs/verify/api-snapshot.mjs` and/or `node docs/verify/access-matrix.mjs`.
4. Review `git diff docs/verify/baseline/`: only the routes and accounts you meant to change should differ. Make sure no session token or real-clock value appears (`<real-now>` placeholders are fine).
5. Commit the baseline in the same commit as the change that caused it.

To run against a server you started yourself, set `BASE` (and `MATRIX_DATA_DIR` for the access matrix). The server must be freshly seeded under `FIXED_NOW=2026-10-01T13:00:00Z` and `TZ=UTC`, with nothing else using it. Each script's header comment has the details. Never point these scripts at the real `DATA_DIR`.

## The built-CSS baseline

`web-css.sha256` is the hash of the whole built stylesheet. Tailwind writes a rule only for the classes it finds in the files it scans, so the hash changes whenever a class starts or stops being used anywhere in the app (issue #27 removed the lock screens, dropped `.py-20` and re-recorded it), and when Tailwind or `web/src/styles.css` changes. The check is there to catch the case where it changes because Tailwind stopped scanning a folder (a missing `@source` line).

1. Compare: run `bun run build`, then `docs/verify/verify-done.sh`, and read its `built CSS matches the Phase 0 baseline` line.
2. If the hash changed, find out which rules did: build `main` in a worktree and diff its `dist/web/static/*.css` against yours.
3. Rules missing for classes your branch still uses mean a missed `@source` line: fix `web/src/styles.css`, never the baseline.
4. If only the classes your branch added or removed differ, re-record: run `bun run build`, then `cat dist/web/static/*.css | sha256sum | cut -d' ' -f1 > docs/verify/baseline/web-css.sha256`. Name the classes in the commit body, as #27 did. No script records this yet, so it is a candidate for one.
