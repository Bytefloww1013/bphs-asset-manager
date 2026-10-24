#!/usr/bin/env bash
# No control disabled for missing access (issue #27): what the account's access doesn't allow is not drawn, so web code never
# turns a permission into a disabled reason. It fails on a web use of the permission-reason helpers, which only the server
# may use, and on the old lock-screen and reason wording; it warns, with the place, on the two helpers that also return record
# rules, so each use can be checked to reach only those. One PASS/FAIL/WARN line per check; exit 1 if any check fails.
cd "$(dirname "$0")/../.." || exit 1
WEB=(web/src modules/*/web foundation/*/web)
failed=0

# grep -rn over the web folders, generated files and tests left out.
hits() {
  grep -rnE "$1" "${WEB[@]}" --include='*.ts' --include='*.tsx' \
    | grep -vE '\.gen\.ts:|\.test\.tsx?:' || true
}

check() {
  local name=$1 pattern=$2 found
  found=$(hits "$pattern")
  if [ -z "$found" ]; then
    echo "PASS: $name"
  else
    echo "$found"
    echo "FAIL: $name"
    failed=1
  fi
}

check "no useDenied in web code" '\buseDenied\b'
check "no needsAccess in web code" '\bneedsAccess\b'
check "no manage/edit reason helper in web code" '\b(grievanceManageReason|reviewManageReason|taskEditReason)\b'
check "no lock-screen or access wording in web code" \
  "Super Admin only|Needs (Read|Edit|Full|[A-Z][a-z]+ (Read|Edit|Full)) access|Only its assigner|You need .* access"

warn=$(hits '\b(taskApproveReason|taskFileWithdrawProblem)\b' | grep -v '^[^:]*:[0-9]*:import ')
if [ -n "$warn" ]; then
  echo "$warn"
  echo "WARN: helpers that also return record rules are used above: each must be reached only after the permission check"
fi

if [ "$failed" = 0 ]; then echo "NO PERMISSION DISABLED: PASS"; else echo "NO PERMISSION DISABLED: FAIL"; fi
exit "$failed"
