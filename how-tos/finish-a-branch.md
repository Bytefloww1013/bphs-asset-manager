---
description: Get a branch ready for a pull request — format, local checks, docs, Definition of Done, then a squash-merge PR
scope: root
covers: [definition-of-done, verify-done, quick-check, format, lint, typecheck, test, docs-check, docs-gen, schema-drift, pull-request, squash-merge, push, branch]
---

# Finish a branch

Conventions (commit messages, squash-merge only, never push without being asked) are in `docs/directives/git-and-prs.md`.

1. Format: `bun run format`.
2. Run the local gate: `docs/verify/quick-check.sh`. Fix every `FAIL` line and run it again until `RESULT: PASS`.
3. Update stale docs (`docs/directives/writing-style.md`, "Keeping docs current"): the module README, `docs/modules.md`, `README.md`, `RUNBOOK.md`. After any module change, run `bun run docs:gen`. Then `bun run docs:check` must pass.
4. If the change touched a schema, `docs/verify/schema-drift.sh` must pass (`how-tos/add-a-db-migration.md`).
5. If the change touched routes, pages or access, run the browser smokes (`how-tos/run-browser-smokes.md`) and compare the baselines (`how-tos/update-verify-baselines.md`).
6. Run the branch's Definition of Done: `docs/verify/verify-done.sh` must exit 0, with no `FAIL` or `SKIP`. A change isn't done until it does.
7. Remove anything that was for this branch only: issue notes in `CLAUDE.md` or `AGENTS.md`, scratch files, logs.
8. Push only when the user says to: `git push -u origin <branch>`.
9. Open the PR against `main` only when the user asks. It will be squash-merged, so its title becomes the commit subject.
10. Watch CI (`.github/workflows/super-linter.yml`, `test` job). It runs format check, `modules:gen --check`, `docs:check`, lint, typecheck, test, build and the route smoke, in that order.
