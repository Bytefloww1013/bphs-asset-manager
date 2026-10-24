#!/usr/bin/env bash
# Usage: check-plan.sh <temp-gh-issue<N>-implementation.md>
path=$1; failed=0
[ -n "$path" ] && [ -f "$path" ] || { echo "FAIL: ${path:-<plan path>} not found"; exit 1; }

for k in '## Decisions' '**Task:**' '**Guardrails:**' '**Definition of Done' '## Ownership'; do
  if grep -Fq -- "$k" "$path"; then echo "PASS: has '$k'"; else echo "FAIL: missing '$k'"; failed=1; fi
done

open=$(grep -Ec '^[[:space:]]*- \[ \]' "$path")
done_=$(grep -Ec '^[[:space:]]*- \[[xX]\]' "$path")
total=$((open + done_))
if [ "$total" -eq 0 ]; then echo "FAIL: no slices (- [ ] checkboxes) found"; failed=1
elif [ "$open" -eq 0 ]; then echo "PASS: $total/$total slices done"
else
  echo "FAIL: $open of $total slices unchecked"
  echo "NEXT: $(grep -Em1 '^[[:space:]]*- \[ \]' "$path" | sed 's/^[[:space:]]*//')"
  failed=1
fi
grep -Eq '<slice>|<name>|<paths>' "$path" && echo "WARN: template placeholders remain"
if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then echo "WARN: plan is tracked by git - it should be in .git/info/exclude"; fi
exit $failed
