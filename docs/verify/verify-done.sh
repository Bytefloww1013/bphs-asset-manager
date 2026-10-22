#!/usr/bin/env bash
# Definition of Done for issue #6 (sidebar rail, SidebarRail-plan.md). Contract: one PASS/FAIL line per check; exit 0 only if all pass.
# The issue #8 (Oxlint) version of this file is in git history (58a43cf).
cd "$(dirname "$0")/../.." || exit 1
failed=0
ran=0
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
branch=refactor/issue6-sidebar-ui

check() { # check "<name>" <command...>
  local name=$1
  shift
  ran=$((ran + 1))
  if "$@" >/dev/null 2>&1; then echo "PASS: $name"; else
    echo "FAIL: $name"
    failed=$((failed + 1))
  fi
}

untouched() { # tracked files unchanged since the merge base, and no new files
  git diff --quiet "$base" -- "$@" && [ -z "$(git ls-files --others --exclude-standard -- "$@")" ]
}
routes_kept() { # route files may change, but none is added, removed or renamed
  [ -z "$(git diff --name-status "$base" -- web/src/routes | grep -v '^M')" ] &&
    [ -z "$(git ls-files --others --exclude-standard -- web/src/routes)" ]
}
tokens_only_added() { # no existing line of styles.css removed or changed
  ! git diff -U0 "$base" -- web/src/styles.css | grep -qE '^-[^-]'
}
rail_tokens_added() { grep -q -- '--color-rail:' web/src/styles.css && grep -q -- '--color-rail-hover:' web/src/styles.css; }
nav_tests() {
  test -f web/src/lib/nav.test.ts && test -f web/src/lib/sidebar-prefs.test.ts && grep -q 'web/src/lib' vitest.config.ts
}
one_nav_model() { # the nav model lives in nav.ts; the shell no longer builds its own lists
  test -f web/src/lib/nav.ts && ! grep -qE 'function (useNav|WorkspaceSwitcher|BackLink|NavList)\b' web/src/components/shell/app-shell.tsx
}
home_opens_inbox() { grep -q "to: '/me/inbox'" web/src/routes/_app/me.index.tsx; }
no_my_space_in_ui() { # "My Space" may stay in code comments, not in anything a person reads
  [ -z "$(grep -rn 'My Space' web/src | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*|\{/\*)')" ]
}
not_pushed() {
  ! git ls-remote --exit-code --heads origin "$branch" && [ -z "$(git rev-list origin/main..main 2>/dev/null)" ]
}
smoke() {
  SKIP_BUILD=1 docs/verify/scratch-server.sh start || return 1
  node docs/verify/sidebar-smoke.mjs >/tmp/claude-sidebar-smoke.log 2>&1
  local status=$?
  docs/verify/scratch-server.sh stop
  return $status
}

check "typecheck" bun run typecheck
check "lint (no warnings)" bun run lint
check "format:check" bun run format:check
check "nav and sidebar-prefs unit tests exist" nav_tests
check "tests pass" bun run test
check "build" bun run build
check "one nav model (nav.ts), old shell lists removed" one_nav_model
check "/me opens Inbox" home_opens_inbox
check "no 'My Space' in UI text" no_my_space_in_ui
check "server/ and shared/ unchanged" untouched server shared
check "no route added, removed or renamed" routes_kept
check "routeTree.gen.ts unchanged" untouched web/src/routeTree.gen.ts
check "existing tokens unchanged" tokens_only_added
check "rail tokens added" rail_tokens_added
check "nothing pushed" not_pushed
check "browser smoke (log: /tmp/claude-sidebar-smoke.log)" smoke

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
