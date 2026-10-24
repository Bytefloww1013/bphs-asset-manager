---
description: Compare the API and access-matrix baselines against a fresh seeded server, and re-record them after an intended change
scope: root
covers: [baseline, api-snapshot, access-matrix, scratch-server, fixed-clock, compare, record, regression, permissions, verify]
---

# Compare or re-record the verify baselines

The baselines are in `docs/verify/baseline/`: `api/` (every GET response as Priya and Marcus) and `access.json` (the status every route returns to every kind of account). Both scripts start and stop their own scratch server under a fixed clock, so you don't need to start one.

1. Compare:
   - `node docs/verify/api-snapshot.mjs --compare`
   - `node docs/verify/access-matrix.mjs --compare`

   Each exits 0 when nothing changed, and prints the differences otherwise.
2. Decide on each difference. If the change was not meant to happen, it is a regression: fix the code and compare again. Re-record only differences the change was meant to make.
3. Re-record what you meant to change: `node docs/verify/api-snapshot.mjs` and/or `node docs/verify/access-matrix.mjs`.
4. Review `git diff docs/verify/baseline/`: only the routes and accounts you meant to change should differ. Make sure no session token or real-clock value appears (`<real-now>` placeholders are fine).
5. Commit the baseline in the same commit as the change that caused it.

To run against a server you started yourself, set `BASE` (and `MATRIX_DATA_DIR` for the access matrix). The server must be freshly seeded under `FIXED_NOW=2026-10-01T13:00:00Z` and `TZ=UTC`, with nothing else using it. Each script's header comment has the details. Never point these scripts at the real `DATA_DIR`.
