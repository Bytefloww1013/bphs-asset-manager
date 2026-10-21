#!/usr/bin/env bash
# Definition of Done for issue #8 (Oxlint). Contract: one PASS/FAIL line per check; exit 0 only if all pass.
cd "$(dirname "$0")/../.." || exit 1
failed=0
ran=0
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
workflow=.github/workflows/super-linter.yml
oxlint=node_modules/.bin/oxlint

check() { # check "<name>" <command...>
  local name=$1
  shift
  ran=$((ran + 1))
  if "$@" >/dev/null 2>&1; then echo "PASS: $name"; else
    echo "FAIL: $name"
    failed=$((failed + 1))
  fi
}

pinned() {
  node -e "
    const d = require('./package.json').devDependencies ?? {}
    process.exit(['oxlint', 'oxlint-tsgolint'].every((p) => /^\d+\.\d+\.\d+$/.test(d[p] ?? '')) ? 0 : 1)"
}

scripts_set() {
  node -e "
    const s = require('./package.json').scripts
    process.exit(s.lint === 'oxlint --type-aware --deny-warnings' && s['lint:fix'] === 'oxlint --type-aware --fix' ? 0 : 1)"
}

# .oxlintrc.json allows comments, so strip them before parsing (no string in it contains //).
config_ok() {
  node -e "
    const c = JSON.parse(require('fs').readFileSync('.oxlintrc.json', 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    const plugins = ['typescript', 'react', 'jsx-a11y', 'import', 'unicorn', 'vitest', 'oxc']
    const ignores = ['web/src/routeTree.gen.ts', 'server/db/migrations/**', 'brand-assets/**', 'docs/**', '.impeccable/**', '.rtk/**', 'handoff/**']
    const env = (glob, name) => c.overrides?.some((o) => o.files.includes(glob) && o.env?.[name])
    const on = (rule) => [].concat(c.rules?.[rule])[0] === 'error'
    const ok = c.\$schema === './node_modules/oxlint/configuration_schema.json'
      && plugins.every((p) => c.plugins?.includes(p))
      && c.categories?.correctness === 'error' && c.categories?.suspicious === 'warn'
      && c.options?.typeAware === true && on('react/rules-of-hooks') && on('react/exhaustive-deps')
      && ignores.every((p) => c.ignorePatterns?.includes(p))
      && env('server/**', 'node') && env('web/src/**', 'browser') && env('**/*.test.ts', 'vitest')
    process.exit(ok ? 0 : 1)"
}

# An unused import and an un-awaited promise must each fail lint with a GitHub annotation on their line.
catches_probe() {
  local dir=web/src/__lint_probe out rc
  mkdir -p "$dir"
  printf "import { cn } from '../lib/cn'\nasync function f() {\n  return 1\n}\nexport function g() {\n  f()\n}\n" >"$dir/probe.ts"
  out=$(bun run lint --format github "$dir/probe.ts" 2>&1)
  rc=$?
  rm -rf "$dir"
  [ "$rc" -ne 0 ] &&
    grep -q "::error file=$dir/probe.ts,line=1,.*no-unused-vars" <<<"$out" &&
    grep -q "::error file=$dir/probe.ts,line=6,.*no-floating-promises" <<<"$out"
}

generated_ignored() {
  "$oxlint" --type-aware web/src/routeTree.gen.ts server/db/migrations 2>&1 | grep -q 'No files found to lint'
}

no_inline_suppressions() {
  ! git grep -nE '(oxlint|eslint)-disable' -- ':!docs' ':!*.md' ':!web/src/routeTree.gen.ts'
}

# The uncommented step runs lint with GitHub annotations, after "Check formatting" and before "Typecheck".
ci_step_order() {
  awk '/^ +- name: Check formatting$/ { f = NR } /^ +- name: Lint$/ { l = NR }
       /^ +run: bun run lint --format github$/ && l && NR == l + 1 { r = 1 }
       /^ +- name: Typecheck$/ { t = NR } END { exit !(r && f && l && t && f < l && l < t) }' "$workflow"
}

# Super-Linter's step, compared as parsed YAML so quote-style changes don't count.
linter_unchanged() {
  python3 - "$workflow" <(git show "$base:$workflow") <<'EOF'
import sys, yaml
step = lambda p: [s for s in yaml.safe_load(open(p))['jobs']['lint']['steps'] if s.get('name') == 'Lint Code Base']
sys.exit(0 if step(sys.argv[1]) == step(sys.argv[2]) else 1)
EOF
}

frozen_lock_ci_bun() {
  local bun_version
  bun_version=$(node -p "require('./package.json').packageManager.split('@')[1]")
  bunx "bun@$bun_version" install --frozen-lockfile --dry-run
}

check "oxlint and oxlint-tsgolint are exact-version pins" pinned
check "lint and lint:fix scripts" scripts_set
check ".oxlintrc.json matches the agreed config" config_ok
check "bun run lint passes with no warnings" bun run lint
check "unused import and floating promise fail lint with annotations" catches_probe
check "generated files are not linted" generated_ignored
check "generated files untouched" git diff --quiet "$base" -- web/src/routeTree.gen.ts server/db/migrations
check "no inline oxlint/eslint-disable comments" no_inline_suppressions
check "bun run format:check passes" bun run format:check
check "bun run typecheck passes" bun run typecheck
check "bun run test passes" bun run test
check "bun run build passes" bun run build
check "CI 'Lint' step runs after formatting, before Typecheck" ci_step_order
check "workflow no longer mentions ESLint" bash -c "! grep -qi eslint $workflow"
check "no ES/TSX/JSX/Biome lint validators enabled" bash -c "! grep -qE 'VALIDATE_(TYPESCRIPT_ES|TSX|JSX|BIOME_LINT)' $workflow"
check "Super-Linter step unchanged" linter_unchanged
check "README has a Linting section" bash -c "grep -qE '^#+ Linting' README.md && grep -q 'bun run lint' README.md"
check "lockfile installs frozen under CI's Bun" frozen_lock_ci_bun
check "CLAUDE.md has no branch-specific entries" bash -c "! grep -qE 'verify-done|oxlint-plan|issue #8' CLAUDE.md"

[ "$ran" -eq 0 ] && {
  echo "FAIL: no checks defined"
  failed=1
}
if [ "$failed" -gt 0 ]; then
  echo "RESULT: FAIL ($failed)"
  exit 1
fi
echo "RESULT: PASS"
exit 0
