#!/usr/bin/env bash
# The extensibility proof (issue #23, slices 14.4 and 15.1): a new feature module needs no kernel edit. `bun run new-module`
# scaffolds a throwaway module, `proof-widgets` (a table, a route, a page and a nav entry in its own workspace) and lists
# it in app.modules.ts; the proof checks that the only paths that changed are its folder, its line in app.modules.ts, the generated
# registries and route tree, and one migration.
# Then it runs lint, typecheck, the tests and the route smoke with the module in, and takes it all out again. The files it
# changes are copied first and copied back after (never `git checkout`), so uncommitted work survives; it checks that too.
# One PASS/FAIL line per check; exit 0 only if all pass.
cd "$(dirname "$0")/../.." || exit 1
TMP=${BPHS_TMP:-${TMPDIR:-/tmp}} # where scratch files go
mkdir -p "$TMP"
ID=proof-widgets
# `TIER=foundation` proves a foundation module instead: in `foundation/`, not listed in app.modules.ts, with no workspace.
[ "${TIER:-feature}" = foundation ] && FOUNDATION=1 DIR=foundation/$ID || DIR=modules/$ID
NAME=proof_widgets
SAVED=$(mktemp -d)
LOGS=$TMP/bphs-new-module-proof
CHANGED=(app.modules.ts shared/modules.gen.ts server/modules.gen.ts web/src/modules.gen.ts web/src/routeTree.gen.ts
  server/db/migrations/meta/_journal.json)
failed=0

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  failed=$((failed + 1))
}
# Every file git would see (tracked, and untracked but not ignored), with its hash.
snapshot() { git ls-files -co --exclude-standard -z | sort -z | xargs -0 sha256sum 2>/dev/null; }

[ -e "$DIR" ] && {
  echo "FAIL: $DIR already exists"
  exit 1
}
mkdir -p "$LOGS"
before=$(snapshot)
migrations_before=$(ls server/db/migrations/*.sql)
migration_files() { ls server/db/migrations/*.sql server/db/migrations/meta/*_snapshot.json; }
migration_files_before=$(migration_files)
for file in "${CHANGED[@]}"; do install -D "$file" "$SAVED/$file"; done

restore() {
  rm -rf "$DIR"
  for file in "${CHANGED[@]}"; do cp "$SAVED/$file" "$file"; done
  comm -13 <(echo "$migration_files_before") <(migration_files) | xargs -r rm -f
  rm -rf "$SAVED"
}
trap restore EXIT

# ---- The module, as `bun run new-module` writes it -------------------------------------------------------------------
step() {
  local name=$1
  shift
  if "$@" >"$LOGS/$name.log" 2>&1; then pass "$name"; else fail "$name (log: $LOGS/$name.log)"; fi
}
step new-module bun run new-module "$ID" ${FOUNDATION:+--foundation}

# ---- What it takes to add it ----------------------------------------------------------------------------------------
step migration bunx drizzle-kit generate --name "$NAME"
step build bun run build

allowed="^($DIR/.*|app\.modules\.ts|(shared|server|web/src)/modules\.gen\.ts|web/src/routeTree\.gen\.ts|server/db/migrations/(meta/_journal\.json|meta/[0-9]{4}_snapshot\.json|[0-9]{4}_$NAME\.sql))$"
paths=$(diff <(echo "$before") <(snapshot) | sed -n 's/^[<>] [0-9a-f]*  //p' | sort -u)
outside=$(grep -Ev "$allowed" <<<"$paths")
[ -z "$outside" ] && pass "only the module's own paths changed ($(wc -l <<<"$paths") paths)" ||
  fail "paths outside the module changed: $(tr '\n' ' ' <<<"$outside")"
new=$(comm -13 <(echo "$migrations_before") <(ls server/db/migrations/*.sql))
[ "$(wc -w <<<"$new")" = 1 ] && grep -q "CREATE TABLE \`$NAME\`" "$new" && pass "one migration: $new" ||
  fail "expected one migration creating $NAME, got: ${new:-none}"
# app.modules.ts lists only feature modules, so it never names a foundation one.
for file in "${CHANGED[@]:${FOUNDATION:-0}:$((5 - ${FOUNDATION:-0}))}"; do
  grep -q "$ID\|proofWidgets" "$file" || fail "$file does not name the module"
done

# ---- With the module in ---------------------------------------------------------------------------------------------
step lint bun run lint
step typecheck bun run typecheck
step test bun run test
# Marcus has no access to the new workspace, so he is sent home, as from Maintenance.
step routes-smoke env SKIP_BUILD=1 EXTRA_ROUTES='[["/proof-widgets", null, { "marcus": { "redirect": "/" } }]]' \
  node docs/verify/routes-smoke.mjs

# ---- And out again --------------------------------------------------------------------------------------------------
restore
trap - EXIT
# The built SPA in dist/ (ignored) still has the page; build it again, as the scratch server and the smoke may skip the build.
step rebuild bun run build
[ "$(snapshot)" = "$before" ] && pass "the module is gone and every other file is as it was" ||
  fail "the tree differs from before the proof: $(diff <(echo "$before") <(snapshot) | sed -n 's/^[<>] [0-9a-f]*  //p' | sort -u | tr '\n' ' ')"

[ "$failed" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL ($failed)"
[ "$failed" -eq 0 ]
