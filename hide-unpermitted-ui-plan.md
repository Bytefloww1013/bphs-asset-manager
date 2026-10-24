# Issue #27 - Hide UI elements the account lacks permission for across all workspaces - Implementation

Status: in progress | Started: 2026-10-24 | Branch: `docs/test-context-skill` | Issue: https://github.com/Bytefloww1013/bphs-asset-manager/issues/27

## Decisions

- **Task:** every page, section, tab, nav entry, button, menu item and submit the account's access doesn't allow is not rendered; disabled-with-reason stays only for unbuilt placeholders and record rules.
- **Answers to the issue's open questions:**
  1. `/users`, `/me/notices`, `/tasks/new` without permission: the standard not-found page.
  2. Read-only `ActiveSwitch` and maintenance Status: `Badge` with a dot; Dispatched to: plain text.
  3. Grievance owners with Read only: Add action, Attach files and Add correction stay hidden (the API requires Grievances Edit: `modules/grievances/server/routes.ts:119,135`).
  4. Import: show only the importers the account may use; hide the tab and the route when there are none.
  5. "You cannot approve your own task" is a record rule: disabled with its reason.
- **Rules applied everywhere:** `perm ?? recordRule` becomes "hide when the permission is missing, `disabledReason={recordRule}`"; a menu with no usable items hides its trigger; a component with no actions renders nothing.
- **Out of scope:** server, API, access rules, database; the server reason helpers (`needsAccess`, `grievanceManageReason`, `reviewManageReason`, `taskEditReason`, `taskApproveReason`, `taskFileWithdrawProblem`) stay as they are.
- **Guardrails:**
  - No change under `server/`, `*/server/`, `shared/permissions.ts` or module `shared/permissions.ts`; API and access baselines compare clean.
  - Work and push only on `docs/test-context-skill`; no PR without asking.
  - One commit per phase with its boxes ticked; `bun run format` before each commit.
  - American English; every stale doc and comment updated on this branch.
- **Definition of Done - scripted:**
  - `docs/verify/quick-check.sh` - format, registries, lint, typecheck, tests.
  - `bun run docs:check` - module table and README sections.
  - `node docs/verify/routes-smoke.mjs` and `node docs/verify/sidebar-smoke.mjs` - every route and the sidebar as Priya and Marcus.
  - `node docs/verify/api-snapshot.mjs --compare` and `node docs/verify/access-matrix.mjs --compare` - API and access unchanged.
  - `bunx vitest run web/src/lib/nav.test.ts` - locked entries absent; non-admin panel case.
  - `docs/verify/no-permission-disabled.sh` (new) - no `disabledReason` fed by `useDenied`, `needsAccess` or a manage/edit/approve permission helper.
  - `node docs/verify/hidden-smoke.mjs` (new) - as Marcus and a read-only account, no `aria-disabled` control on any route gives a permission reason; My Dashboard still says "Coming later".
- **Definition of Done - manual:** (user confirms)
  - A look through the app as Marcus and the read-only account.
- **Open risks:** `hidden-smoke.mjs` checks controls visible on page load and in opened row menus, not every sheet's inner controls.

## Ownership

| Slice | Owner | Owns (files / section / topic) |
|---|---|---|
| 1.1-1.3 | main | `web/src/modules.ts`, `web/src/lib/nav.ts`, `web/src/lib/nav.test.ts`, `web/src/components/shell/*`, `modules/assets/web/module.ts`, `modules/tasks/web/module.ts` |
| 2.1-2.4 | main | `web/src/lib/session.ts`, `web/src/components/list-parts.tsx`, `web/src/components/records/files.tsx`, `web/src/components/ui/overlay.tsx`, `web/src/components/ui/button.tsx` |
| 2.5 | main | `modules/assets/web/asset-actions.tsx`, `modules/digital-assets/web/*`, `foundation/employees/web/*`, `foundation/programs/web/*` |
| 3.1 | agent-assets | `modules/assets/web/**` except `module.ts` and `asset-actions.tsx` |
| 3.2 | agent-grievances | `modules/grievances/web/**` |
| 3.3 | agent-reviews | `modules/reviews/web/**` |
| 3.4 | agent-ops | `modules/maintenance/web/**`, `modules/tasks/web/**` except `module.ts` |
| 3.5 | main | `web/src/routes/_app/import-export.tsx`, `web/src/routes/_app/users.tsx`, `foundation/notifications/web/**` |
| 4.x | main | `docs/verify/**`, `README.md`, module READMEs, `docs/*.md`, this plan |

Shared files (lockfiles, manifests, CI config, CLAUDE.md/AGENTS.md, this plan) belong to `main`.

## Phase 1 - Sidebar: remove the lock mechanism

- [x] 1.1 Remove `NavPage.lock` (`web/src/modules.ts`), `NavEntry.lock` and the `jumpIndex` lock filter (`web/src/lib/nav.ts`), the lock branch in `page-list.tsx` and `nav-badge.tsx`
- [x] 1.2 Users (`modules/assets/web/module.ts`) and Assign task (`modules/tasks/web/module.ts`) become `visible` checks
- [x] 1.3 Rewrite `web/src/lib/nav.test.ts` locked cases to assert absence; add a non-admin panel case

## Phase 2 - Shared components and row-action menus

- [x] 2.1 Replace `useDenied` with a boolean `useCan(section, level)` in `web/src/lib/session.ts`, doc comment states the hide rule
- [x] 2.2 `DeleteButton` hidden without Full; `ActiveSwitch` shows a read-only `Badge` without Edit; record-rule reasons kept (`list-parts.tsx`)
- [x] 2.3 File Withdraw hidden without permission (`records/files.tsx`); `MenuItem` doc and comment at `overlay.tsx:140`; `Button` doc example (`button.tsx:41-42`)
- [x] 2.4 Menus with no usable items hide their trigger (shared helper in `overlay.tsx` if one fits)
- [x] 2.5 Row actions: `asset-actions.tsx`, `digital-parts.tsx`, `employee-parts.tsx`, `program-parts.tsx`

## Phase 3 - Record pages, forms, lock screens, URL gates

- [x] 3.1 Assets: `slots.tsx` (Issue to / Assign to), `assets.$tag.tsx`, `assignments.tsx` (also selection checkboxes), `available.tsx` (also the I key), other `useDenied` sites
- [x] 3.2 Grievances: `manage.tsx`, `form.tsx`, `$code.entries.new.tsx`, `$code.edit.tsx`, new-grievance gate, other sites; comments `manage.tsx:30-31`, `form.tsx:53`
- [x] 3.3 Reviews: `manage.tsx`, `form.tsx`, `cap-form.tsx`, `$code.caps.$cap.index.tsx`, `$code.entries.new.tsx`, `$code.edit.tsx`, `$code.caps.$cap.edit.tsx`, new review/CAP/entry gates; comment `$code.caps.$cap.index.tsx:105`
- [x] 3.4 Maintenance (`$id.tsx` Status badge / Dispatched to text, `new.tsx` gate) and Tasks (`tasks.index.tsx`, `tasks.$id.index.tsx`, `tasks.$id.edit.tsx`, `files.tsx`, `tasks.new.tsx` not-found)
- [x] 3.5 `import-export.tsx` (only allowed importers; tab and route hidden when none), `users.tsx` and `notices.tsx` lock screens become not-found

## Phase 4 - Checks, smokes and docs

- [ ] 4.1 `docs/verify/no-permission-disabled.sh` (grep check) and `docs/verify/hidden-smoke.mjs` (Marcus + read-only account)
- [ ] 4.2 `routes-smoke.mjs`: `/users`, `/me/notices` expect not-found for Marcus; `sidebar-smoke.mjs` expectations; web-css baseline if styles changed
- [ ] 4.3 `README.md:282`, module READMEs, RUNBOOK and `docs/*` describe the hide rule; `bun run docs:gen`

## Phase 5 - Verify + cleanup

- [ ] 5.1 Tests, smokes and local CI commands pass, output shown in chat
- [ ] 5.2 Every acceptance criterion from the issue checked
- [ ] 5.3 User confirms manual DoD items
- [ ] 5.4 Issue block removed from AGENTS.md (`check-agentsmd ... clean`)
