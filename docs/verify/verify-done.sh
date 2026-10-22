#!/usr/bin/env bash
# Definition of Done for issue #19 (asset Brand, Model, Entra ObjectId; AssetBrandModelEntra-plan.md).
# Contract: one PASS/FAIL line per check; exit 0 only if all pass.
# Earlier versions of this file are in git history: issue #6 (sidebar rail) at 9e84fdb, issue #8 (Oxlint) at 58a43cf.
cd "$(dirname "$0")/../.." || exit 1
failed=0
ran=0
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
branch=$(git rev-parse --abbrev-ref HEAD)
LOGS=${LOGS:-/home/josh/tmp/bphs-verify}
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

untouched() { # tracked files unchanged since the merge base, and no new files
  git diff --quiet "$base" -- "$@" && [ -z "$(git ls-files --others --exclude-standard -- "$@")" ]
}
new_tests() {
  test -f server/tests/asset-fields.test.ts && test -f web/src/lib/exports.test.ts &&
    grep -q 'brand' server/tests/asset-fields.test.ts && grep -qi 'entra' web/src/lib/exports.test.ts
}
migration_added() { # exactly one new migration, 0023, in the journal and on disk
  ls server/db/migrations/0023_*.sql >/dev/null && grep -q '"tag": "0023_' server/db/migrations/meta/_journal.json &&
    test -f server/db/migrations/meta/0023_snapshot.json &&
    [ -z "$(git diff --name-status "$base" -- server/db/migrations | grep -vE '^M\s+server/db/migrations/meta/_journal.json$|^A\s+server/db/migrations/(0023_[a-z_]+\.sql|meta/0023_snapshot\.json)$')" ]
}
old_migrations_kept() {
  local files
  files=$(git ls-tree --name-only "$base" server/db/migrations/ server/db/migrations/meta/ | grep -E '/(00(0[0-9]|1[0-9]|2[0-2])_|meta/00(0[0-9]|1[0-9]|2[0-2])_snapshot)')
  [ -n "$files" ] && git diff --quiet "$base" -- $files
}
seed_ok() { # a fresh seed carries realistic brand, model and Entra data
  local dir
  dir=$(mktemp -d "$LOGS/seed.XXXXXX")
  DATA_DIR="$dir" node --env-file-if-exists=.env server/seed.ts >"$dir/seed.log" 2>&1 || return 1
  DB="$dir/bphs.sqlite" node -e '
    const db = new (require("better-sqlite3"))(process.env.DB, { readonly: true })
    const n = (q) => db.prepare(q).get().n
    const checks = {
      "active brands > 1": n("select count(*) n from asset_brands where is_active = 1") > 1,
      "Unknown archived": n("select count(*) n from asset_brands where name = '"'"'Unknown'"'"' and is_active = 0") === 1,
      "no asset on Unknown": n("select count(*) n from assets a join asset_brands b on b.id = a.brand_id where b.name = '"'"'Unknown'"'"'") === 0,
      "some with model": n("select count(*) n from assets where model is not null") > 0,
      "some without model": n("select count(*) n from assets where model is null") > 0,
      "some with entra": n("select count(*) n from assets where entra_object_id is not null") > 0,
      "some without entra": n("select count(*) n from assets where entra_object_id is null") > 0,
      "entra lowercase uuid": db.prepare("select entra_object_id e from assets where entra_object_id is not null").all()
        .every((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r.e)),
    }
    for (const [name, ok] of Object.entries(checks)) console.log(ok ? "ok" : "NOT OK", name)
    process.exit(Object.values(checks).every(Boolean) ? 0 : 1)'
  local status=$?
  rm -rf "$dir"
  return $status
}
docs_updated() {
  for f in README.md RUNBOOK.md; do
    grep -q 'Brand' "$f" && grep -q 'Entra ObjectId' "$f" || return 1
  done
}
claudemd_generic() { ! grep -nEi 'issue ?#?19|feature-asset-brand|brand|entra' CLAUDE.md; }
not_pushed() {
  ! git ls-remote --exit-code --heads origin "$branch" && [ -z "$(git rev-list origin/main..main 2>/dev/null)" ]
}
smoke() {
  SKIP_BUILD=1 docs/verify/scratch-server.sh start || return 1
  node docs/verify/asset-fields-smoke.mjs
  local status=$?
  docs/verify/scratch-server.sh stop
  return $status
}

check "typecheck" bun run typecheck
check "lint (no warnings)" bun run lint
check "format:check" bun run format:check
check "new asset-field and export tests exist" new_tests
check "tests pass" bun run test
check "build" bun run build
check "migration 0023 added, nothing else in migrations changed" migration_added
check "migrations 0000-0022 unchanged" old_migrations_kept
check "fresh seed has brands, models and Entra ObjectIds" seed_ok
check "README and RUNBOOK describe Brand and Entra ObjectId" docs_updated
check "digital asset files unchanged" untouched server/services/digital-assets.ts web/src/routes/_app/digital-assets.tsx web/src/features/digital-assets
check "no new dependencies" untouched package.json bun.lock
check "colour tokens unchanged" untouched web/src/styles.css
check "CLAUDE.md has no branch-specific text" claudemd_generic
check "nothing pushed" not_pushed
check "browser smoke test" smoke

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
