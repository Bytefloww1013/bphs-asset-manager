#!/usr/bin/env bash
# The per-phase gate: format, module registries, lint, typecheck and test. One PASS/FAIL line each; exit 0 only if all pass.
# Formats in place first (as before a commit), so run it on a tree you mean to commit.
cd "$(dirname "$0")/../.." || exit 1
TMP=${BPHS_TMP:-${TMPDIR:-/tmp}} # where scratch files go
mkdir -p "$TMP"
failed=0
for step in format "modules:gen --check" lint typecheck test; do
  log="$TMP/bphs-quick-${step%% *}.log"
  # shellcheck disable=SC2086 # the step's words are its script name and arguments
  if bun run $step >"$log" 2>&1; then echo "PASS: $step"; else
    echo "FAIL: $step (log: $log)"
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL ($failed)"
[ "$failed" -eq 0 ]
