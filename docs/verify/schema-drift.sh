#!/usr/bin/env bash
# Schema drift (issue #23): fails if `drizzle-kit generate` would write a migration, i.e. if the schema files and the last
# migration snapshot disagree. It runs on a copy of the migrations folder, so nothing in the repo is written.
# The schema list comes from drizzle.config.ts itself, so the check follows the schema as it is split into modules.
cd "$(dirname "$0")/../.." || exit 1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r server/db/migrations "$tmp/migrations"
# drizzle-kit puts "./" in front of `out`, so it has to be relative; and it exits 0 even when it fails, so PASS needs its own
# "No schema changes" line as well as an unchanged folder.
out_rel=$(realpath --relative-to=. "$tmp/migrations")
cat >"$tmp/drizzle.config.ts" <<EOF
import base from '$PWD/drizzle.config.ts'
export default { ...base, out: '$out_rel' }
EOF
before=$(find "$tmp/migrations" -type f | sort | xargs sha256sum)
if ! out=$(bunx drizzle-kit generate --config "$tmp/drizzle.config.ts" 2>&1); then
  echo "$out"
  echo "FAIL: drizzle-kit generate failed"
  exit 1
fi
after=$(find "$tmp/migrations" -type f | sort | xargs sha256sum)
if [ "$before" = "$after" ] && grep -q "No schema changes" <<<"$out"; then
  echo "PASS: schema drift: drizzle-kit generate writes no migration"
else
  echo "$out"
  diff <(echo "$before") <(echo "$after") | sed "s#$tmp/##"
  echo "FAIL: schema drift: drizzle-kit generate would write a migration (or did not run cleanly)"
  exit 1
fi
