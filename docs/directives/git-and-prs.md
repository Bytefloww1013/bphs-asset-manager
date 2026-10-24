---
description: Branches, commits, pull requests and plans in this repo; supersedes the directives skill's rebase/fast-forward default
scope: root
covers: [git, branch, commit, commit-message, pull-request, squash-merge, blame-ignore-revs, merge-conflict, rebase, force-push, git-mv, blame, format, quick-check, plan, phases, push]
---

# Git and pull requests

This doc supersedes the directives skill's default git conventions (`add/<x>` branches, rebase + fast-forward).

## Merging

- PRs to `main` are squash-merge only. The squashed subject gets the PR number appended by GitHub.
- A blame-ignore-revs SHA can only be added in a follow-up PR, after the squash merge exists.
- Never push to `main`, or anywhere, unless the user says to.

## Branches

- Name a branch after the issue or feature it carries; use the branch the user or session names when one is given.
- On someone else's branch never rebase, amend or force-push: bring `main` in with a merge commit.

## Commits

- Subject: what the change does for the product, in plain words, with the issue number when there is one (`Asset Brand, Model and Entra ObjectId on physical assets (#19)`, `Notifications Phase 4: Super Admin notices`).
- Body: a bullet per area changed, naming tables, migrations, routes and docs touched; end with `Closes #<n>` when it closes an issue.
- Run `bun run format` before committing and `docs/verify/quick-check.sh` after each phase.
- Moving code: `git mv` first, then reshape, in the same commit, so `git blame -C -C` follows it.

## Plans

- A feature plan is `[feature_name]-plan.md` at the repo root, written only after several rounds of questions to the user.
- Phases of actionable slices, one checkbox per slice. Commit once per phase with its boxes ticked, not per slice.
- Write the plan only; implement nothing until the user says go.
