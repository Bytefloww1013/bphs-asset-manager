#!/usr/bin/env bash
# Definition of Done for issue #7 (Oxfmt). Contract: one PASS/FAIL line per check; exit 0 only if all pass.
cd "$(dirname "$0")/../.." || exit 1
failed=0
ran=0
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
workflow=.github/workflows/super-linter.yml
oxfmt=node_modules/.bin/oxfmt

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
  node -e "process.exit(/^\d+\.\d+\.\d+$/.test(require('./package.json').devDependencies?.oxfmt ?? '') ? 0 : 1)"
}

scripts_set() {
  node -e "const s = require('./package.json').scripts; process.exit(s.format === 'oxfmt' && s['format:check'] === 'oxfmt --check' ? 0 : 1)"
}

config_ok() {
  node -e "
    const c = JSON.parse(require('fs').readFileSync('.oxfmtrc.json', 'utf8'))
    const need = ['web/src/routeTree.gen.ts', 'server/db/migrations/**', 'bun.lock', 'brand-assets/**', 'docs/**', '.impeccable/**', '.rtk/**', 'handoff/**', '**/*.md']
    const ok = c.\$schema === './node_modules/oxfmt/configuration_schema.json' && c.singleQuote === true && c.semi === false
      && c.printWidth === 120 && need.every((p) => c.ignorePatterns?.includes(p))
    process.exit(ok ? 0 : 1)"
}

# A misformatted file must fail the check, and pass once formatted (so a missing binary can't fake a FAIL).
catches_misformat() {
  local dir rc
  dir=$(mktemp -d)
  printf 'const a = {b:1};\n' >"$dir/probe.ts"
  "$oxfmt" --version && ! "$oxfmt" --check "$dir/probe.ts" && "$oxfmt" "$dir/probe.ts" && "$oxfmt" --check "$dir/probe.ts"
  rc=$?
  rm -rf "$dir"
  return $rc
}

no_stray_md() {
  ! git diff --name-only "$base" -- '*.md' | grep -v -x -E 'README.md|CLAUDE.md|oxfmt-plan.md'
}

# The uncommented step runs format:check and comes before Typecheck.
ci_step_first() {
  awk '/^ +- name: Check formatting$/ { f = NR } /^ +run: bun run format:check$/ && f && NR == f + 1 { r = 1 }
       /^ +- name: Typecheck$/ { t = NR } END { exit !(r && f && t && f < t) }' "$workflow"
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

check "oxfmt is an exact-version pin" pinned
check "format and format:check scripts" scripts_set
check ".oxfmtrc.json matches the agreed config" config_ok
check "bun run format:check passes" bun run format:check
check "a misformatted .ts file fails oxfmt --check" catches_misformat
check "bun run typecheck passes" bun run typecheck
check "bun run test passes" bun run test
check "bun run build passes" bun run build
check "generated files untouched" git diff --quiet "$base" -- web/src/routeTree.gen.ts server/db/migrations
check "no Markdown changes besides README/CLAUDE/plan" no_stray_md
check "CI 'Check formatting' step runs before Typecheck" ci_step_first
check "workflow no longer mentions Prettier" bash -c "! grep -qi prettier $workflow"
check "no Prettier or Biome validators enabled" bash -c "! grep -qE 'VALIDATE_[A-Z_]*(PRETTIER|BIOME)' $workflow"
check "Super-Linter step unchanged" linter_unchanged
check "README has a Formatting section" bash -c "grep -qE '^#+ Formatting' README.md && grep -q 'bun run format' README.md"
check "lockfile installs frozen under CI's Bun" frozen_lock_ci_bun
check "CLAUDE.md has no branch-specific entries" bash -c "! grep -qE 'verify-done|oxfmt-plan' CLAUDE.md"

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
