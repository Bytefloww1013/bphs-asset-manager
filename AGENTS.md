# Agents

## Directives

Before starting any task, run `/directives context "<task description>"` to load the relevant
conventions for that task. Do not proceed without doing this first.

The project's directives are in `docs/directives/`.

<!-- byte-gh-do-issue #27 START -->
## Issue #27 (branch `docs/test-context-skill` only - removed before the PR)

### Tools
- `CHROME=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` - prefix every `docs/verify/*.mjs` smoke in this container (the default path is a dev machine's)
- `docs/verify/scratch-server.sh start|stop` - seeded scratch server for sidebar/hidden smokes

### Tests
- `bunx vitest run web/src/lib/nav.test.ts` - sidebar entries absent without permission
- `docs/verify/no-permission-disabled.sh` - no permission-fed `disabledReason` left
- `docs/verify/quick-check.sh` - format, registries, lint, typecheck, tests (after each phase)
- `node docs/verify/routes-smoke.mjs`, `node docs/verify/sidebar-smoke.mjs`, `node docs/verify/hidden-smoke.mjs` - browser smokes
- `node docs/verify/api-snapshot.mjs --compare`, `node docs/verify/access-matrix.mjs --compare` - API/access unchanged

### CI
- `CI/test` - format:check, modules:gen --check, docs:check, lint, typecheck, test, build, routes-smoke; locally `docs/verify/quick-check.sh` + `bun run docs:check` + `bun run build` + routes-smoke

### Important Information
- Plan: `hide-unpermitted-ui-plan.md` (committed per phase, per CLAUDE.md "Plans")
- Guardrail: no change under `server/`, `*/server/` or any `shared/permissions.ts`; server reason helpers stay
- Guardrail: push only to `docs/test-context-skill`; no PR without asking
- Rule source: `docs/directives/ui-rules.md` "Permissions and state"

### Gotchas
- `perm ?? recordRule` -> hide on missing perm, keep `disabledReason={recordRule}`
- "You cannot approve your own task" and other self-actions -> record rule, stay disabled with reason
- Grievance owners with Read -> Add action / Attach / Add correction hidden (API needs Edit)
- `ActiveSwitch` / maintenance Status for read-only -> `Badge` with dot, never hidden
- Lock screens (`/users`, `/me/notices`, `/tasks/new`) -> standard not-found, not a redirect
- Menu item the account may not use -> `hidden: !can`, never `disabledReason`; `Menu` drops its trigger when nothing is left
- Permission checks in components -> `useCan(section, level)` (boolean); `useDenied` is removed at the end of Phase 3
- `docs/verify/*` scripts write logs to `/home/josh/tmp` -> `mkdir -p /home/josh/tmp` once per container
<!-- byte-gh-do-issue #27 END -->
