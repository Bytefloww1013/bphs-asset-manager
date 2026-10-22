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

# TOOLS AND COMMANDS

- `bun run format` / `bun run format:check` - Oxfmt (config `.oxfmtrc.json`); run `format` before committing.
- `bun run lint` / `bun run lint:fix` - Oxlint, type-aware via oxlint-tsgolint (config `.oxlintrc.json`); must exit 0 with no warnings.
- `docs/verify/scratch-server.sh start|stop` - seeded scratch API + SPA on :3388 for browser checks; never the real DATA_DIR.
# WORKFLOWS

- PRs to `main` are squash-merge-only: a blame-ignore-revs SHA can only be added in a follow-up PR after the merge.

# GOTCHAS

- Oxfmt isn't in Super-Linter -> it runs in the `test` job; never enable `VALIDATE_*_PRETTIER` or `VALIDATE_BIOME_FORMAT`.
- Oxlint isn't in Super-Linter either -> it runs in the `test` job; never enable `VALIDATE_TYPESCRIPT_ES`, `VALIDATE_TSX`, `VALIDATE_JSX` or `VALIDATE_BIOME_LINT`.
- `plugins` in `.oxlintrc.json` replaces Oxlint's default list -> name every plugin wanted. Turn a noisy rule off there with a one-line reason, never with `oxlint-disable` comments.
- tsgolint reads the root `tsconfig.json` (a solution file) -> keep it referencing `web` and `server`, or files under `shared/` are linted without their strict options.
- Markdown and generated files are in Oxfmt's `ignorePatterns` -> don't format them by hand either.
- TanStack `Link` sets `aria-current="page"` itself, after `activeProps`, whenever the address is at or under its `to` -> for another value (the rail's `"true"`), spread `useLinkProps` onto a plain `<a>` and set `aria-current` last.
- Bun runs `node-gyp rebuild` for `better-sqlite3` (it ignores `"gypfile": false`), which fails in CI and Docker -> keep `trustedDependencies` in `package.json` explicit (it replaces Bun's default list); add a new dependency there only if its install script is really needed.
