@AGENTS.md

<!-- rtk-instructions v2 -->
# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.

# CodeGraph

This repo is indexed by CodeGraph (`.codegraph/`). Use it before Read, Grep,
Glob, find or an Explore agent whenever the target is code:

- **Reading a file or symbol**: call `codegraph_explore` with its name or path.
  It returns line-numbered source you can `Edit` from directly, so don't Read
  it again.
- **Finding code** ("where is X", "what calls Y", "how does Z work"): one
  `codegraph_explore` call with a question or the relevant symbol names.
- **Before an edit**: query the symbols you'll change to see their callers and
  blast radius.
- **Tracing a flow**: name the symbols at both ends; it returns the call path.

Trust its results; don't re-check them with grep. Fall back to Read/Grep only
for files CodeGraph doesn't index (config, Markdown, JSON, SQL migrations) or
for a detail its output didn't cover. If the MCP tool is unavailable, run
`codegraph explore "<query>"` in the shell.
<!-- /rtk-instructions -->

# Handoff guard

`handoff/` holds handoffs written by the user-level handoff skill and hook, which run when context gets full. It is gitignored: handoffs are never committed, and the hook keeps only the newest three on disk (older ones are in git history before they were untracked). If a handoff isn't pasted in as "Previous context", the guard blocks tools it shouldn't, or the state looks off, see "Handoff guard (troubleshooting)" in `~/.claude/CLAUDE.md`. Mention anything odd about it to the user.

# Plans

Every feature plan in this repo follows these rules (set by the user, 2026-10-19):

- Question the user over several rounds before writing a plan.
- Name it `[feature_name]-plan.md`, at the repo root.
- Build it from phases, each made of actionable slices, each slice with a checkbox.
- Commit after each phase (with its slices' boxes ticked), not after each slice.
- Never push to `main` (or anywhere) unless the user says to.
- Write the plan only. Implement nothing until the user gives the go-ahead.

# ARCHITECTURE

- The map is `docs/architecture.md`; how to add, change, depend on or remove a module is `docs/modules.md`; each module's rules are in its own `README.md`.
- Kernel: `server/`, `web/src/`, `shared/` (sign-in, sessions, users, access, registries, frameworks, app shell). Foundation modules: `foundation/<id>/`. Feature modules: `modules/<id>/`, each listed in `FEATURES` (`app.modules.ts`), which sets the registry order. Every module is always installed: `modules:gen` refuses a feature folder the list leaves out.
- A feature's tables, rules, API, pages, seed, tests and README go in its module folder (`server/`, `shared/`, `web/`); the kernel gets only what every module needs.
- Another module is imported only through its public API (`server/index.ts`, `shared/index.ts`, `web/index.ts`) and named in its manifest's `dependsOn`; kernel code reaches feature modules only through the generated registries (lint rule `boundaries/imports`, rules a-f).
- To learn something from other modules, ask a server hook (`ServerHooks` in `server/modules.ts`) or draw a web slot (`SlotProps` in `web/src/modules.ts`); never import them.
- New module: `bun run new-module <id> [--foundation]`, then `bun run db:generate --name <table>`, `bun run dev` (route tree), fill in its README, `bun run docs:gen`.
- After changing `app.modules.ts`, a manifest or a `module.ts`: `bun run modules:gen` (the dev server reruns it too).

# TOOLS AND COMMANDS

- `bun run format` / `bun run format:check` - Oxfmt (config `.oxfmtrc.json`); run `format` before committing.
- `bun run lint` / `bun run lint:fix` - Oxlint, type-aware via oxlint-tsgolint (config `.oxlintrc.json`), with the boundary rules; must exit 0 with no warnings.
- `bun run modules:gen [--check]` - writes or checks the generated registries (`*/modules.gen.ts`) and the module dependency graph.
- `bun run new-module <id> [--foundation]` - scaffolds a module from `scripts/templates/module/` and adds it to `FEATURES`.
- `bun run docs:gen` / `bun run docs:check` - writes / checks the module table in `docs/architecture.md`; `docs:check` also fails on a module README missing a required section and on a quoted path that no longer exists.
- `bunx vitest run <path>` - one test file, the fastest loop.
- `docs/verify/scratch-server.sh start|stop` - seeded scratch API + SPA on :3388 for browser checks and the baselines; never the real DATA_DIR.
- `node docs/verify/routes-smoke.mjs` - every route as Priya and Marcus in headless Chrome (also in CI).
- `node docs/verify/api-snapshot.mjs [--compare]` / `node docs/verify/access-matrix.mjs [--compare]` - record or diff the API and access baselines in `docs/verify/baseline/`.
- `docs/verify/schema-drift.sh` - fails if `drizzle-kit generate` would write a migration.
- `docs/verify/new-module-proof.sh` (`TIER=foundation` for the other tier) - scaffolds a throwaway module, runs every check on it, then removes it.
- `node docs/verify/migration-check.mjs [--db <file>]` - rehearses migration 0024 (custody merge) on the seeded fixture or a copy of a backup; `KEEP=<dir>` keeps the migrated copy.
- `docs/verify/verify-done.sh` - the current branch's Definition of Done checks, one PASS/FAIL line each; exit 0 means done.
- `docs/verify/quick-check.sh` - format, registries, lint, typecheck and test in one run; use it after each phase.
- `node docs/verify/hidden-smoke.mjs` - every route as Marcus and a read-only account; fails on a control disabled for missing access (issue #27).
- `docs/verify/no-permission-disabled.sh` - fails on web code that turns a permission into a disabled reason.
- `docs/verify/*` scratch files and logs go to `BPHS_TMP` (default `$TMPDIR`, else `/tmp`); set `CHROME` to the browser for the `.mjs` smokes (`/opt/pw-browsers/chromium-*/chrome-linux64/chrome` in a cloud container).
- Demo accounts (seed): `p.raghunathan@bphs.local` (Super Admin) and `m.oyelaran@bphs.local` (Admin), password `Demo-pass1!`.

# WORKFLOWS

- PRs to `main` are squash-merge-only: a blame-ignore-revs SHA can only be added in a follow-up PR after the merge.
- Every change updates the docs it makes stale, in the same PR: the module's README, `docs/architecture.md` (`bun run docs:gen`), `docs/modules.md`, README, RUNBOOK and the rest; `bun run docs:check` runs in CI.

# GOTCHAS

- Oxfmt isn't in Super-Linter -> it runs in the `test` job; never enable `VALIDATE_*_PRETTIER` or `VALIDATE_BIOME_FORMAT`.
- Oxlint isn't in Super-Linter either -> it runs in the `test` job; never enable `VALIDATE_TYPESCRIPT_ES`, `VALIDATE_TSX`, `VALIDATE_JSX` or `VALIDATE_BIOME_LINT`.
- `plugins` in `.oxlintrc.json` replaces Oxlint's default list -> name every plugin wanted. Turn a noisy rule off there with a one-line reason, never with `oxlint-disable` comments.
- tsgolint reads the root `tsconfig.json` (a solution file) -> keep it referencing `web` and `server`, or files under `shared/` are linted without their strict options.
- Markdown and generated files are in Oxfmt's `ignorePatterns` -> don't format them by hand either.
- TanStack `Link` sets `aria-current="page"` itself, after `activeProps`, whenever the address is at or under its `to` -> for another value (the rail's `"true"`), spread `useLinkProps` onto a plain `<a>` and set `aria-current` last.
- Bun runs `node-gyp rebuild` for `better-sqlite3` (it ignores `"gypfile": false`), which fails in CI and Docker -> keep `trustedDependencies` in `package.json` explicit (it replaces Bun's default list); add a new dependency there only if its install script is really needed.
- The server runs `.ts` directly under Node type stripping -> it can't use Vite's `@/` alias; cross-folder server imports use package.json subpath imports (`#kernel/…`, `#foundation/…`, `#modules/…`).
- Local Node is 26, CI and Docker run Node 24 -> don't rely on Node features newer than 24.
- Every API route's first handler is its access declaration (`server/access/route.ts`) -> `createApp` throws on a route without one, and a path no route declares is 404.
- A shared manifest imports only `#shared/modules.ts` and `#shared/levels.ts` -> `shared/constants.ts` and `shared/permissions.ts` read the registry as they load, so importing them there is a TDZ cycle.
- The registries never import `modules.gen.ts` -> a new entry point, or a test that calls `vi.resetModules()`, calls `installModules(...)` first, or every registry reader throws.
- drizzle-kit reads `server/db/schema.ts` and the `foundation/*` and `modules/*` `server/schema.ts` files only (`drizzle.config.ts`) -> a table defined anywhere else is invisible to it, and moving one out of those files shows as a drop.
- Tailwind scans only Vite's root `web/` -> each module tier needs an `@source '../../<tier>/*/web/**/*.{ts,tsx}'` line in `web/src/styles.css` (a folder glob doesn't work); the CSS baseline check in `verify-done.sh` catches a missed one.
- `docs/**` is in both the Oxfmt and Oxlint ignore lists -> `format`/`lint` never check `docs/verify/*.mjs`; check those with `node --check` and by running them.
- `docs:gen` and `docs:check` load every `web/module.ts` under `tsx --tsconfig web/tsconfig.json` -> a web module must load outside a browser (no `window` or `document` as it loads).
- `throw notFound()` in a route draws the root not-found page, with no app shell -> a `routes-smoke.mjs` expectation for it is `NOT_FOUND` (`standalone: true`), not `shows` alone.
- Moving code between files or modules -> move first (`git mv`), then reshape, in the same commit, so `git blame -C -C` can follow it.
