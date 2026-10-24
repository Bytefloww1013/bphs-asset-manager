#!/usr/bin/env bash
# Usage: check-agentsmd.sh <CLAUDE.md|AGENTS.md> <issue#> [active|clean] [maxLines=200]
# active: the issue block exists and has all 5 sections. clean: no trace of the issue block remains.
path=$1; n=$2; mode=${3:-active}; max=${4:-200}; failed=0
[ -n "$path" ] && [ -n "$n" ] || { echo "FAIL: usage: check-agentsmd.sh <file> <issue#> [active|clean]"; exit 1; }
[ -f "$path" ] || { echo "FAIL: $path not found"; exit 1; }
start="<!-- byte-gh-do-issue #$n START -->"; end="<!-- byte-gh-do-issue #$n END -->"

lines=$(wc -l < "$path" | tr -d ' ')
if [ "$lines" -le "$max" ]; then echo "PASS: $lines lines (<= $max)"; else echo "WARN: $lines lines (> $max) - prune it"; fi

if [ "$mode" = clean ]; then
  if grep -Fq "byte-gh-do-issue #$n " "$path"; then echo "FAIL: issue #$n markers still present"; failed=1; else echo "PASS: no issue #$n markers"; fi
  if grep -Eq "^#+[[:space:]]*Issue #$n([^0-9]|$)" "$path"; then echo "FAIL: 'Issue #$n' heading still present"; failed=1; else echo "PASS: no 'Issue #$n' heading"; fi
  exit $failed
fi

s=$(grep -Fc -- "$start" "$path"); e=$(grep -Fc -- "$end" "$path")
if [ "$s" -eq 1 ] && [ "$e" -eq 1 ]; then echo "PASS: one START/END marker pair"
else echo "FAIL: expected 1 START and 1 END marker, found $s/$e"; exit 1; fi
block=$(awk -v s="$start" -v e="$end" 'index($0,s){f=1} f{print} index($0,e){f=0}' "$path")
[ -n "$(printf '%s' "$block" | grep -F -- "$end")" ] || { echo "FAIL: END marker comes before START"; exit 1; }
for sec in "Tools" "Tests" "CI" "Important Information" "Gotchas"; do
  if printf '%s\n' "$block" | grep -Eiq "^#+[[:space:]]*$sec[[:space:]]*$"; then echo "PASS: section '$sec'"
  else echo "FAIL: section '$sec' missing in issue block"; failed=1; fi
done
printf '%s\n' "$block" | grep -Eq '<command>|<trap>|<branch>|<N>' && echo "WARN: template placeholders remain"
exit $failed
