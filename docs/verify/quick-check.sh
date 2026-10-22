#!/usr/bin/env bash
# The per-phase gate: format, lint, typecheck and test. One PASS/FAIL line each; exit 0 only if all pass.
# Formats in place first (as before a commit), so run it on a tree you mean to commit.
cd "$(dirname "$0")/../.." || exit 1
failed=0
for step in format lint typecheck test; do
  if bun run "$step" >"/home/josh/tmp/bphs-quick-$step.log" 2>&1; then echo "PASS: $step"; else
    echo "FAIL: $step (log: /home/josh/tmp/bphs-quick-$step.log)"
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL ($failed)"
[ "$failed" -eq 0 ]
