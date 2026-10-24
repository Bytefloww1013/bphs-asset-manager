---
description: Get a branch ready for a pull request — format, local checks, docs, Definition of Done, then a squash-merge PR
scope: root
covers: [definition-of-done, verify-done, quick-check, format, lint, typecheck, test, docs-check, docs-gen, stale-docs, schema-drift, pull-request, squash-merge, push, branch, ci]
---

# Finish a branch

Conventions (commit messages, squash-merge only, never push without being asked) are in `docs/directives/git-and-prs.md`.

1. Run the local gate: `docs/verify/quick-check.sh`. It formats in place first, then runs the module registries check, lint, typecheck and test. Fix every `FAIL` line and run it again until `RESULT: PASS`.
2. Update stale docs (`docs/directives/writing-style.md`, "Keeping docs current"): the module README, `docs/modules.md`, `README.md`, `RUNBOOK.md`. After any module change, run `bun run docs:gen`. Then `bun run docs:check` must pass.
3. If the change touched a schema, `docs/verify/schema-drift.sh` must pass (`how-tos/add-a-db-migration.md`).
4. If the change touched routes, pages or access, run the browser smokes (`how-tos/run-browser-smokes.md`) and compare the baselines (`how-tos/update-verify-baselines.md`).
5. Run the Definition of Done: `docs/verify/verify-done.sh` must exit 0, with no `FAIL` or `SKIP`. A change isn't done until it does. The script is rewritten for each issue, so first check that its header names yours. If it names another issue, rewrite it: replace the checks with your issue's Definition of Done, keep the `check`/`check_if`/`skip` helpers and the one-line-per-check contract, and add the outgoing issue and its last commit to the header's "Earlier versions" line.
6. Remove anything that was for this branch only: issue notes in `CLAUDE.md` or `AGENTS.md`, scratch files, logs.
7. Push only when the user says to: `git push -u origin <branch>`.
8. Open the PR against `main` only when the user asks. It will be squash-merged, so its title becomes the commit subject.
9. Watch CI (`.github/workflows/super-linter.yml`, `test` job). It runs format check, `modules:gen --check`, `docs:check`, lint, typecheck, test, build and the route smoke, in that order.
