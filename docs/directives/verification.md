---
description: Which checks run where (quick-check locally, CI as the fail-fast gate); supersedes the directives skill's hierarchical-verification default for quick-check.sh only
scope: root
covers: [verification, testing, linting, typecheck, format, ci, fail-fast, quick-check, verify-done, pre-commit, smoke]
---

# Verification

This doc supersedes the directives skill's `hierarchical-verification` default for `docs/verify/quick-check.sh` only.

- `docs/verify/quick-check.sh` is the local check before a commit and after each phase. It runs every step (format, `modules:gen --check`, lint, typecheck, test) even after one fails, so one run lists every failure, and its `format` step fixes formatting in place. Keep it that way.
- CI (`.github/workflows/super-linter.yml`, `test` job) is the fail-fast gate, cheapest step first: `format:check`, `modules:gen --check`, `docs:check`, lint, typecheck, test, build, route smoke. A new CI step goes where its cost puts it in that order.
- `docs/verify/verify-done.sh` decides whether the current branch's Definition of Done is met; a change isn't reported done until it exits 0. It holds one issue's checks: each issue rewrites it, and its header lists the earlier versions in git history.
