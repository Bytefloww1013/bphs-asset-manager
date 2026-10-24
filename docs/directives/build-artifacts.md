---
description: Where build output, caches, local data and scratch files go; supersedes the directives skill's out-of-tree-artifacts default for the gitignored outputs it lists
scope: root
covers: [build, artifacts, out-of-tree, dist, cache, tsbuildinfo, codegraph, data-dir, scratch, BPHS_TMP, gitignore, tooling, tests, worktree]
---

# Build artifacts

This doc supersedes the directives skill's `out-of-tree-artifacts` default for the outputs listed under "In the repo, gitignored". Everything else follows the default: it goes outside the repo.

## In the repo, gitignored

- `bun run build` writes the web app to `web` under `dist` (`outDir` in `vite.config.ts`). The Dockerfile copies it from there into the image; don't move it.
- Local data: `data/` (the default `DATA_DIR`) and `*.sqlite*` files.
- Tool caches and state: `*.tsbuildinfo`, `.tanstack`, `.codegraph`, `handoff`, `qa-shots`, and the `build`, `review` and `mocks` folders under `.impeccable`.
- Each of these keeps its `.gitignore` line. A new tool whose output must stay in the repo adds its `.gitignore` line and its entry here in the same commit.

## Outside the repo

- Scratch files, logs, scratch servers' databases and test output go to `BPHS_TMP` (default `$TMPDIR`, else `/tmp`). Every `docs/verify/*` script does; a new one does too.
- A scratch server or check never uses the real `DATA_DIR`.
- Adding a tool: check where it writes by default. If that's inside the repo and the output isn't listed above, point it at `BPHS_TMP`.
