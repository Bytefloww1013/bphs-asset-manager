#!/usr/bin/env bash
# Usage: check-branch.sh <branch> <issue#>
# Format: <tag>/issue<N>-<slug>, e.g. bug/issue9-auth-import-issue
b=$1; n=$2; failed=0
[ -n "$b" ] && [ -n "$n" ] || { echo "FAIL: usage: check-branch.sh <branch> <issue#>"; exit 1; }
if printf '%s' "$b" | grep -Eq '^[a-z0-9]+/issue[0-9]+-[a-z0-9]+(-[a-z0-9]+){1,4}$'; then echo "PASS: format <tag>/issue<N>-<2-5 word slug>"
else echo "FAIL: '$b' does not match <tag>/issue<N>-<2-5 kebab words>"; failed=1; fi
if printf '%s' "$b" | grep -Eq "/issue$n-"; then echo "PASS: issue number $n"; else echo "FAIL: issue number is not $n"; failed=1; fi
if [ "${#b}" -le 60 ]; then echo "PASS: ${#b} chars (<= 60)"; else echo "WARN: ${#b} chars (> 60) - shorten the slug"; fi
git check-ref-format --branch "$b" >/dev/null 2>&1 && echo "PASS: valid git ref" || { echo "FAIL: invalid git ref"; failed=1; }
git show-ref --verify --quiet "refs/heads/$b" && echo "WARN: local branch already exists - resume or pick another name"
git ls-remote --exit-code --heads origin "$b" >/dev/null 2>&1 && echo "WARN: remote branch already exists - resume or pick another name"
exit $failed
