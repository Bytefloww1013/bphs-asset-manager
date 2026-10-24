---
name: byte-gh-do-issue
description: Work a GitHub issue end to end the ByteFlow way - branch from the issue title, answer the grilling questions from the issue and ask only for the gaps, write a phased checkbox plan, keep issue notes in CLAUDE.md/AGENTS.md, fan out file-owning subagents, commit and push per phase, verify with tests/smokes/CI checks, clean up, then squash and open a PR only with the user's permission.
argument-hint: "<issue number or URL>"
disable-model-invocation: true
---

# /byte-gh-do-issue

Issue: $ARGUMENTS

Follow the steps in order. Never skip an approval gate. The user's choice is final once they say they want to keep it.

Bundled files (use them, don't rewrite them):
- `${CLAUDE_SKILL_DIR}/scripts/issue-context.(ps1|sh) <issue>` - issue title, bracket tag, labels, body, comments
- `${CLAUDE_SKILL_DIR}/scripts/check-branch.(ps1|sh) <branch> <issue#>` - branch name format
- `${CLAUDE_SKILL_DIR}/scripts/check-plan.(ps1|sh) <plan.md>` - Decisions/Ownership present, unchecked slices, next slice
- `${CLAUDE_SKILL_DIR}/scripts/check-agentsmd.(ps1|sh) <file> <issue#> [active|clean]` - issue block present with all 5 sections, or fully removed
- `${CLAUDE_SKILL_DIR}/templates/` - `implementation.md`, `issue-block.md`

Script runner: on Windows run `pwsh -NoProfile -File <script>.ps1`; on macOS/Linux run `bash <script>.sh`. Every script prints one `PASS:`/`FAIL:`/`WARN:`/`INFO:` line per check and exits 0 (all pass) or 1 (any FAIL).

Names used below:
- `N` - issue number. `<base>` - the repo's default branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`).
- Plan: `./temp-gh-issue<N>-implementation.md` in the repo root. It is a working file: add it to `.git/info/exclude` so it is never committed.
- Instructions file: `CLAUDE.md` or `AGENTS.md` at the repo root, whichever exists. If both exist and one only imports the other (e.g. `@AGENTS.md`), edit the real one.

---

## Step 0 - Preflight

1. `gh auth status` must pass. If not, stop and ask the user to run `gh auth login`.
2. `git status --porcelain` must be empty. If not, stop and ask: stash, commit, or abort. Never discard the user's changes.
3. Look for `./temp-gh-issue<N>-implementation.md` and a local/remote branch matching `*/issue<N>-*`. If found, run `check-plan` and offer: **resume** at the first unchecked slice (check out the branch, skip to Step 5) or **start fresh**.

## Step 1 - Read the issue + branch

1. Run `issue-context <issue>`. Read the body, every comment, labels, linked PRs (`gh issue develop --list <N>`, `gh pr list --search "<N>"`) and any files or code the issue points at.
2. Build the branch name: `<tag>/issue<N>-<slug>`
   - `<tag>` = the word in the title's brackets, lowercased (`[BUG]` -> `bug`). No brackets: use the first matching label (`bug`, `feature`, `enhancement`, `docs`, `chore`), else ask the user.
   - `<slug>` = 2-5 kebab-case words that condense the title; drop filler words (fix, the, a, system, failed). Example: `[BUG] Fix auth system failed imports` (#9) -> `bug/issue9-auth-import-issue`.
3. Run `check-branch <branch> <N>`. Then:
   `git fetch origin && git switch -c <branch> origin/<base>`
4. Add the plan path to `.git/info/exclude`.

## Step 2 - Grill, issue first

Goal: Task, Guardrails and Definition of Done, each concrete enough to test.

| Part | Must answer |
|---|---|
| **Task** | What changes, for whom, what is explicitly out of scope? For a bug: steps to reproduce, expected vs actual. |
| **Guardrails** | What must not change, what must never be done (send, delete, publish, migrate data), which files/systems are off limits, what needs approval first? |
| **Definition of Done** | Which acceptance criteria, tests, smokes and CI jobs prove it is finished? |

1. Answer every question you can from the issue, its comments and the code. Show the result as a table with a **Source** column: `issue` (quote it), `code` (file:line), `inferred`, or `missing`.
2. Ask the user only about `missing` and `inferred` rows, plus anything the issue contradicts itself on. Use AskUserQuestion, at most 4 questions per batch, recommended answer first with "(Recommended)" and its pros/cons.
3. **Push back once** on a vague, untestable or risky answer with a better alternative. If the user keeps it, record it and move on.
4. Split the DoD into **Scripted** (exit code: tests, lint, build, smoke command, endpoint status) and **Manual** (human judgment). Push to turn manual items into scripted ones. For a bug, a test that reproduces it is always a scripted item.
5. Stop when all three parts are testable, or after 3 rounds. List remaining gaps and ask whether to proceed with them recorded as open risks.
6. Use established terms (leading words) instead of long explanations from here on: "exponential backoff", not "wait longer each retry".

Show a one-screen summary of Task / Guardrails / DoD and **get approval**.

## Step 3 - Plan

Write `./temp-gh-issue<N>-implementation.md` from `templates/implementation.md`. Skip the deep detail for a trivial issue, but always keep Decisions, Ownership and checkbox slices.
- **Decisions** from Step 2, with the issue URL and branch.
- **Phases** of small slices, one `- [ ]` checkbox per slice. A slice is one reviewable change. Each phase becomes one commit.
- **Ownership** table: every slice gets one owner (`main` or `agent-<x>`) and the files/globs, section or topic it owns. No two owners may share a file. Shared files (lockfiles, manifests, CI config, the instructions file, the plan) belong to `main`.
- The last phase is always "Verify + cleanup".

Run `check-plan` (expect FAIL only for unchecked slices). Show the plan and **get approval**.

## Step 4 - Issue notes in CLAUDE.md / AGENTS.md

Add an issue block from `templates/issue-block.md` to the instructions file, between the markers `<!-- byte-gh-do-issue #<N> START -->` and `<!-- byte-gh-do-issue #<N> END -->`, with these sections:
- **Tools** - commands, scripts, MCP servers needed for this issue that the agent can't guess.
- **Tests** - exact commands to run the relevant tests and smokes, fastest first.
- **CI** - which workflow/jobs gate this change and how to reproduce them locally.
- **Important Information** - the plan path, branch, Guardrails in one line each, key file paths.
- **Gotchas** - traps found in the code or the issue, each with the correct behaviour.

Rules: bullets only, one line each, no code walkthroughs, nothing the agent can read from the code, keep the whole file under 200 lines. Never edit content outside the markers. If neither file exists, ask before creating `CLAUDE.md`. Show the diff, **get approval**, write it, run `check-agentsmd <file> <N> active`.

**Standing rule:** whenever a new command, test trick or repeated mistake comes up, propose a one-line addition to the block.

## Step 5 - Implement (fan-out)

- Work phase by phase. Inside a phase, run slices with disjoint ownership in parallel with subagents (Agent tool, one call per owner, sent in one message); run the rest yourself.
- Each subagent brief contains: the issue summary, its slices, the **exact files/section/topic it owns**, the Guardrails, the test command, and these rules: *edit only the files you own; if you need a change elsewhere, stop and report it; do not commit, push, or switch branches; report the files you changed and the test output.*
- After each subagent returns, check `git status --porcelain` / `git diff --stat` against its ownership. Any file outside it: revert that file and redo the work yourself or reassign it.
- Tick `- [x]` in the plan only when a slice is done and its tests pass.
- Respect Guardrails at every step. If a slice would break one, stop and ask.

## Step 6 - Commit + push per phase

At the end of each phase:
1. Run the phase's tests. Do not commit a red phase.
2. Stage only the phase's files by path (never the plan file).
3. Commit: `<tag>(#<N>): phase <k> - <phase name>`, then `git push -u origin <branch>`.
4. Run `check-plan`, then review the issue block: add, prune, or leave it.

## Step 7 - Verify

Run everything that proves the issue is fixed, and show the output in chat:
- The tests and smokes listed in the issue block, then the full suite if it runs in reasonable time.
- What CI runs: read `.github/workflows/*` and run the same lint, type-check, build and test commands locally.
- Each acceptance criterion from the issue, and the reproduction steps for a bug (now passing).
- `gh run list --branch <branch> --limit 3` for the pushed phase commits; any failure gets fixed before moving on.
- Ask the user to confirm each Manual DoD item.

Any failure: fix it in a new slice, commit it as its own phase, re-run Step 7.

## Step 8 - Cleanup

1. Offer to keep any lasting item from the issue block (e.g. a test command that was missing) by moving it into the file's permanent sections. Move only what the user approves.
2. Delete the issue block, markers included. Run `check-agentsmd <file> <N> clean`.
3. Commit `chore(#<N>): remove issue notes` and push. If the issue block was the only content of a file you created in Step 4, delete the file instead.

## Step 9 - PR (permission required)

Done means: every Step 7 check passed, `check-plan` reports 0 unchecked slices, `check-agentsmd ... clean` passes, and the user confirmed the manual items. Report that in a few lines, then **ask for permission to create the PR**. No permission: stop here; the phase commits stay pushed.

With permission:
1. `git fetch origin`. If `<base>` moved, `git rebase origin/<base>` and re-run the Step 7 tests.
2. Squash: `git reset --soft $(git merge-base HEAD origin/<base>)`, then one commit:
   `<tag>(#<N>): <issue title without the bracket tag>` with a body of 3-6 bullets summarising the change, and `Closes #<N>`.
3. `git push --force-with-lease origin <branch>` (force is required because the phase commits were already pushed; never force without the lease).
4. `gh pr create --base <base> --head <branch> --title "<commit subject>" --body "<summary, test evidence, Closes #<N>>"`.
5. Report the PR URL and `gh pr checks <pr>` status. Ask whether to delete the local plan file.
