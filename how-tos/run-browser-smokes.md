---
description: Run the headless-browser smokes (routes, hidden controls, sidebar, asset fields, tasks) against a seeded scratch server, locally or in a cloud container
scope: root
covers: [smoke, browser, chrome, firefox, puppeteer, playwright, headless, routes-smoke, hidden-smoke, sidebar-smoke, asset-fields-smoke, tasks-smoke, scratch-server, CHROME, BPHS_TMP, cloud-container, ci]
---

# Run the browser smokes

1. Point the smokes at a browser: `export CHROME=<path to chrome>`.
   - In a cloud container: `export CHROME=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome | head -1)`. Don't run `playwright install`.
   - Without `CHROME`, the smokes look under `$BPHS_TMP/bphs-spike-chrome/`.
2. Optionally set `BPHS_TMP` to a folder for scratch files and logs. The default is `$TMPDIR`, else `/tmp`. For `tasks-smoke`, use a folder under `$HOME`, because snap Firefox can't read `/tmp`.
3. Build the SPA once (`bun run build`), then pass `SKIP_BUILD=1` to every run below.
4. The smokes that start their own server (on their own ports):
   - `SKIP_BUILD=1 node docs/verify/routes-smoke.mjs`: every route as Priya and Marcus. CI runs this one.
   - `SKIP_BUILD=1 node docs/verify/hidden-smoke.mjs`: no control is disabled because of missing access (issue #27).
5. The smokes that need the shared scratch server on :3388:
   1. `SKIP_BUILD=1 docs/verify/scratch-server.sh start`
   2. `node docs/verify/sidebar-smoke.mjs`, `node docs/verify/asset-fields-smoke.mjs`, and `node docs/verify/tasks-smoke.mjs` (Firefox: set `FIREFOX` if it isn't `/snap/bin/firefox`; a cloud container has no Firefox, so skip it there). The first run installs puppeteer-core outside the repo.
   3. `docs/verify/scratch-server.sh stop`
6. Read the results: one `PASS`/`FAIL` line per check, then a summary. The exit code is 1 if any check failed. Each `FAIL` line says why; the scratch server's own log is `server.log` in its `ROOT` folder.
7. A route smoke failure of `not in ROUTES: <path>` means a page was added without a `ROUTES` entry in `docs/verify/routes-smoke.mjs`. Add one.

Each script's header comment lists its other env vars (`PORT`, `ROOT`, `BASE`, `ROUTE_TREE`, `EXTRA_ROUTES`). Never run the smokes against the real `DATA_DIR`.
