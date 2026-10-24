#!/usr/bin/env bash
# Definition of Done for issue #23 (modular architecture; ModularArchitecture-plan.md).
# Contract: one PASS/FAIL/SKIP line per check; exit 0 only if every check ran and passed. A SKIP is a check whose tool a later
# phase builds, so it counts as not done.
# Earlier versions of this file are in git history: issue #19 (asset brand/model/Entra) at 944638a, issue #6 at 9e84fdb, issue #8 at 58a43cf.
cd "$(dirname "$0")/../.." || exit 1
TMP=${BPHS_TMP:-${TMPDIR:-/tmp}} # where scratch files go
mkdir -p "$TMP"
failed=0
skipped=0
ran=0
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
LOGS=${LOGS:-$TMP/bphs-verify}
mkdir -p "$LOGS"

check() { # check "<name>" <command...>
  local name=$1
  shift
  ran=$((ran + 1))
  if "$@" >"$LOGS/check-$ran.log" 2>&1; then echo "PASS: $name"; else
    echo "FAIL: $name (log: $LOGS/check-$ran.log)"
    failed=$((failed + 1))
  fi
}
skip() { # skip "<name>" "<why>"
  echo "SKIP: $1 ($2)"
  skipped=$((skipped + 1))
}
has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)"; }
# check_if <file-or-script> "<name>" <command...>: run the check once its tool exists, else SKIP.
check_if() {
  local tool=$1
  shift
  if [ -e "$tool" ] || has_script "$tool" 2>/dev/null; then check "$@"; else skip "$1" "$tool not built yet"; fi
}

boundaries_enforced() { # the boundary rule from Phase 2 (an in-repo Oxlint JS plugin) is part of `bun run lint`
  test -f scripts/oxlint-boundaries.ts && grep -q '"boundaries/imports": "error"' .oxlintrc.json 2>/dev/null
}
css_unchanged() { # the built CSS equals the baseline, so Tailwind still finds every class, including those only in module folders
  SKIP_BUILD=1 node docs/verify/css-baseline.mjs # its log names the selectors that came or went
}
no_old_central_files() {
  local found=0
  for pattern in 'accessNeeded' 'UPLOAD_PATH' 'WORKSPACE_HOME' 'const IMPORTERS' 'const EXPORTS'; do
    if git grep -n -- "$pattern" -- server shared web ':!*.md'; then found=1; fi
  done
  for path in web/src/lib/queries.ts modules/_legacy; do
    if [ -e "$path" ]; then echo "still there: $path"; found=1; fi
  done
  [ "$found" -eq 0 ]
}
trusted_deps_unchanged() {
  [ "$(git show "$base:package.json" | node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(0)).trustedDependencies))')" = \
    "$(node -e 'console.log(JSON.stringify(require("./package.json").trustedDependencies))')" ]
}
main_untouched() { [ -z "$(git rev-list origin/main..main 2>/dev/null)" ]; }
plan_done() { ! grep -nE '^[[:space:]]*- \[ \]' ModularArchitecture-plan.md; }
issue_block_removed() { ! grep -n 'byte-gh-do-issue #23' CLAUDE.md; }
routes_smoke() { SKIP_BUILD=1 node docs/verify/routes-smoke.mjs; }

check "typecheck" bun run typecheck
check "lint (no warnings)" bun run lint
check "format:check" bun run format:check
check "tests pass" bun run test
check "build" bun run build
check "built CSS matches the baseline (css-baseline.mjs)" css_unchanged
check_if modules:gen "registries current, dependency graph valid (modules:gen --check)" bun run modules:gen --check
if boundaries_enforced; then check "lint carries the boundary rules" boundaries_enforced; else skip "lint carries the boundary rules" "Phase 2"; fi
check "schema drift: no new migration" docs/verify/schema-drift.sh
check_if docs/verify/api-snapshot.mjs "API snapshot matches the Phase 0 baseline" node docs/verify/api-snapshot.mjs --compare
check_if docs/verify/access-matrix.mjs "access matrix matches the baseline (undeclared paths may now be refused)" node docs/verify/access-matrix.mjs --compare
check_if docs/verify/routes-smoke.mjs "route smoke" routes_smoke
check_if docs/verify/migration-check.mjs "custody migration check on the production-shaped fixture" node docs/verify/migration-check.mjs
check_if docs/verify/new-module-proof.sh "extensibility proof (new-module-proof.sh)" docs/verify/new-module-proof.sh
check_if docs:check "docs:check" bun run docs:check
check "no old central files (accessNeeded, UPLOAD_PATH, IMPORTERS/EXPORTS, WORKSPACE_HOME, queries.ts, _legacy)" no_old_central_files
check "trustedDependencies unchanged" trusted_deps_unchanged
check "local main not ahead of origin/main" main_untouched
check "every plan slice ticked" plan_done
check "issue #23 block removed from CLAUDE.md" issue_block_removed

[ "$ran" -eq 0 ] && {
  echo "FAIL: no checks defined"
  failed=1
}
if [ "$failed" -gt 0 ] || [ "$skipped" -gt 0 ]; then
  echo "RESULT: FAIL ($failed failed, $skipped skipped)"
  exit 1
fi
echo "RESULT: PASS"
exit 0
