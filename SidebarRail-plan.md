# Sidebar rail (issue #6) - Implementation

Status: in progress | Started: 2026-10-22 | Branch: `refactor/issue6-sidebar-ui`

Reference design: the throwaway prototype at `.impeccable/mocks/sidebar-rail/index.html` (gitignored; rebuild with `node .impeccable/mocks/sidebar-rail/build.mjs`). Where it and issue #6 differ, the prototype wins. Its example workspaces, figures and rows are not part of this work.

## Decisions

- **Task:** replace the app-shell sidebar with a **navigation rail + pages panel** driven by one nav model (`web/src/lib/nav.ts`) that the rail, the panel, the phone drawer and the **quick switcher** all read.
  - Rail (84px): logo (to Home), panel toggle, Home then each workspace the account can read (label under the icon), **overflow menu** "More" when the window is too short (the active workspace always stays in view), the bell with its count, the account menu as an avatar.
  - Pages panel (236px): workspace name, the Confidential line on Grievances and Administrative Reviews, "Jump to… Ctrl K", the page groups; on Home a collapsible Pinned section with a pin button for the current page.
  - Collapse hides the panel, leaving the rail; remembered in `localStorage` key `bphs.sidebar`.
  - Below 1024px: a top bar (menu, logo + wordmark, "workspace · page", bell) and a **drill-down** drawer that opens on the current workspace's pages, with "All workspaces" a level up.
  - Quick switcher (Ctrl/Cmd K): sidebar pages of the workspaces the account can read; never records.
  - One trailing badge slot for a count, a lock and "Coming later", each with screen-reader text.
  - My Space is renamed **Home** in the UI (URLs stay `/me`). Its pages: My Dashboard (greyed, "Coming later"), Inbox (count), My tasks, Profile, Notices (Super Admin). `/me` opens Inbox. The account menu drops "My Space"; the Back link goes.
- **Out of scope:** My Dashboard's content and making it the landing page (issue #14); the prototype's example workspaces; any server, API or permission change; the colour and logo redesign (last, see memory); dark theme; record pages.
- **Guardrails:**
  - `server/` and `shared/` unchanged; no route file added, removed or renamed; `web/src/routeTree.gen.ts` unchanged.
  - Existing tokens in `web/src/styles.css` unchanged; only `--color-rail` and `--color-rail-hover` added.
  - Kept: workspace read from the URL, reopen in the last workspace (`bphs.workspace`), drawer closes past `lg`, skip link first.
  - Grievances and Administrative Reviews never show a count or badge, in the rail, the panel, the drawer or the switcher.
  - Nothing from inside a workspace is stored in the browser: `bphs.pins` holds sidebar page paths only, validated against the nav model on read.
  - Commit per phase on `refactor/issue6-sidebar-ui` only. Never commit to `main`, never push, no PR unless the user says so.
  - Subagents work with **disjoint file ownership**: the files each owns are listed on its slice; no two write the same file.
- **Definition of Done - scripted:** `docs/verify/verify-done.sh` exits 0, covering:
  - `bun run typecheck`, `lint`, `format:check`, `test`, `build` exit 0.
  - `web/src/lib/nav.test.ts` and `web/src/lib/sidebar-prefs.test.ts` exist and run under `bun run test`.
  - The guardrail diffs against the merge base with `main` are clean (server, shared, routes, route tree, tokens only added).
  - Nothing pushed: no remote branch `refactor/issue6-sidebar-ui`, and `main` has no commits that are not on `origin/main`.
  - `node docs/verify/sidebar-smoke.mjs` passes against `docs/verify/scratch-server.sh` (steps listed in the UI contract below).
- **Definition of Done - manual:** (user confirms)
  - The real app, opened at desktop and phone width, matches the prototype's direction.
- **Open risks:**
  - Rail + panel is 320px against today's 248px; the Physical Assets table must still fit at 1366 (a smoke check).
  - "More" only shows with 6 items on a window under about 520px tall, so it is tested at 480px rather than seen in normal use.
  - Pins are per browser: they do not follow a person to another computer.

### UI contract (the smoke test and every slice use these names)

| Part | Element and accessible name |
|---|---|
| Rail | `nav[aria-label="Workspaces"]`; one link per area, named by its full name ("Home", "Assets", "Maintenance", "Employee Tasks", "Administrative Reviews", "Grievances") with the short label visible ("Tasks", "Reviews"); the active one `aria-current="true"`. Order: Home, Assets, Maintenance, Employee Tasks, Administrative Reviews, Grievances. |
| More | button "More workspaces", a menu of the areas that did not fit |
| Panel toggle | button "Pages panel", `aria-expanded`, `aria-controls="pages-panel"` |
| Panel | `#pages-panel` containing `nav[aria-label="Pages"]`; `inert` and zero width when collapsed; current page link `aria-current="page"` |
| Quick switcher | button "Jump to…" with `aria-keyshortcuts="Control+K Meta+K"`; `role=dialog` named "Jump to a page"; `role=combobox` input; `role=option` rows |
| Pinned | button "Pinned" (`aria-expanded`) over the pins; button "Pin this page" / "Unpin this page" |
| Bell | unchanged: "Notifications" or "Notifications, N unread" |
| Account | button "Account: {name}" |
| Phone | button "Open navigation"; dialog "Navigation"; button "All workspaces"; the drawer's lists reuse the panel's `PageList` |
| Badges | count: sr " unread"; lock: sr "Super Admin only" (Users) or "Needs Assign access" (Assign task); soon: "Coming later" |
| Storage | `bphs.sidebar` = `collapsed` or absent; `bphs.pins` = JSON array of page paths |

Smoke steps (`docs/verify/sidebar-smoke.mjs`, Chrome for Testing, seeded data):
1. Priya (Super Admin) at 1440×900: the rail has the 6 areas in order; the skip link is the first Tab stop; on `/grievances` and `/reviews` the Confidential line shows and no rail item, panel link or switcher row for those two carries a count.
2. The panel lists the same links as the drawer for each area (compared at 1440 and 390 wide).
3. Pages panel toggle collapses the panel; after a reload it is still collapsed; toggle again restores it.
4. Ctrl+K opens "Jump to a page"; typing "categories" and Enter lands on `/grievances/categories`.
5. At 1440×480 "More workspaces" appears, and the active area is still in the rail.
6. At 1366×768 on `/assets` the page does not scroll sideways (`scrollWidth <= innerWidth`).
7. Pin this page on `/assets` adds it under Pinned on Home; `localStorage['bphs.pins']` holds only `["/assets"]`.
8. Marcus (no Maintenance access) sees Home, Assets, Employee Tasks, Administrative Reviews, Grievances, and no Maintenance. (Dana's seeded account must change its password first, so the smoke test uses Marcus.)
9. At 390×844: "Open navigation" opens the drawer on the current area's pages; "All workspaces" lists the areas; following a link closes the drawer; reopening it and resizing to 1280 wide closes it.
10. No console errors on any step.

## Leading words

| User's explanation | Leading word |
|---|---|
| "ensure they do not work on the same files, at the same time" | disjoint file ownership (fan-out / fan-in) |
| "a quick throwaway mockup" | throwaway prototype |
| "Prefer the design choices made in this conversation over the choices in the GitHub Issue" | the prototype is the reference design |
| the 5.png layout: labelled icon rail beside a panel of the workspace's pages | navigation rail + pages panel |
| Ctrl K "Jump to…" (pages only, no actions) | quick switcher (not a command palette) |
| "More" for workspaces that do not fit | overflow menu |
| phone drawer: pages, then "All workspaces" a level up | drill-down navigation |

## Goal

```
/goal Every slice in SidebarRail-plan.md is ticked and the navigation rail + pages panel is built to its UI contract; proven by `bash docs/verify/verify-done.sh` exiting 0 with its PASS lines shown in chat; server/, shared/, route files, routeTree.gen.ts and existing tokens unchanged, no count on Grievances or Administrative Reviews, nothing on main and nothing pushed, commit per phase with disjoint file ownership for subagents; if manual DoD items remain, stop and ask the user; stop after 60 turns and report what is blocking.
```

## Phase 1 - Nav model (serial)

- [x] 1.1 `web/src/lib/nav.ts`: the areas in rail order (Home + workspaces) with full name, short label, icon, confidential flag, and `navFor(area, user, unread)` returning the page groups now built by `useNav` in `app-shell.tsx` (Home's pages renamed as in Decisions; lock reasons; "Coming later"; counts only on Home's Inbox). `areasFor(user)` uses `workspacesOf`.
- [x] 1.2 `nav.ts`: `fitRail(count, height, activeIndex)` returning the areas shown and the overflow, the active one always shown; `jumpIndex(user)` a flat list of `{ area, group, label, to }` without disabled entries.
- [x] 1.3 `web/src/lib/sidebar-prefs.ts`: read and write `bphs.sidebar` and `bphs.pins` (try/catch like `rememberWorkspace`; pins filtered to paths in the nav model, at most 8).
- [x] 1.4 Widen `vitest.config.ts` to `web/src/lib/**/*.test.ts`; `nav.test.ts` (Priya, Marcus, Dana, ops: areas and order; no count on confidential areas; `fitRail` keeps the active area; `jumpIndex` has no disabled entry) and `sidebar-prefs.test.ts` (unknown or record paths dropped, storage errors ignored).

## Phase 2 - Shared list (serial)

- [x] 2.1 `web/src/components/shell/nav-badge.tsx`: the one trailing slot (count, lock, soon) with its screen-reader text, reusing `UnreadBadge`.
- [x] 2.2 `web/src/components/shell/page-list.tsx`: `PageList({ area, onNavigate })` rendering `navFor` groups with `NavBadge`, the `yields` active rule, `aria-current="page"`, and the disabled `span role=link aria-disabled` for locked and coming-later entries (reason under the name, as in the prototype); on Home it ends with the collapsible Pinned section, so the panel and the drawer share it.

## Phase 3 - Shell parts (fan-out: 4 subagents, disjoint file ownership)

Each agent reads Phase 1-2 files and `.impeccable/mocks/sidebar-rail/src.html`, writes only its own files, and does not touch `app-shell.tsx`. Fan-in before Phase 4.

- [x] 3.1 Agent A owns `rail.tsx`, `account-menu.tsx`, `web/src/styles.css`: the rail (logo, panel toggle by prop, areas, More menu via `fitRail` and a `ResizeObserver`, bell slot, avatar account menu without "My Space"); adds `--color-rail` and `--color-rail-hover` only.
- [x] 3.2 Agent B owns `pages-panel.tsx`: header, Confidential line, "Jump to…" trigger by prop, `PageList`, the "Pin this page" / "Unpin this page" button for the current page outside Home (via `sidebar-prefs`), the panel swap animation with `prefers-reduced-motion` respected.
- [x] 3.3 Agent C owns `quick-switcher.tsx`: the Radix dialog combobox over `jumpIndex`, arrow keys, Enter, Escape, and `useQuickSwitcherShortcut` for Ctrl/Cmd K.
- [x] 3.4 Agent D owns `phone-nav.tsx`: the top bar and the drill-down drawer (Radix Dialog, `PageList` with `onNavigate`, "All workspaces" level, focus moved to the new level's heading).

## Phase 4 - Assemble (serial)

- [x] 4.1 Rewrite `app-shell.tsx` on the parts: grid of rail + panel + main, collapse state from `sidebar-prefs` with `inert`, skip link first, `data-workspace`, remember and reopen workspace as today, drawer closes past `lg`; remove `WorkspaceSwitcher`, `BackLink`, `NavList`, `useNav`, `UserMenu`.
- [x] 4.2 `web/src/routes/_app/me.index.tsx` redirects to `/me/inbox`; `web/src/features/users/level-help.ts` says "Home" for "My Space".
- [x] 4.3 `bun run format`, then `lint`, `typecheck`, `test`, `build` clean; fix what they find.

## Phase 5 - Docs and smoke (fan-out: 2 subagents for docs, smoke run by the lead)

- [x] 5.1 Agent E owns `DESIGN.md`: Navigation rewritten for the rail, panel, More, collapse, Pinned, quick switcher, phone drill-down, badges; Home in place of My Space.
- [x] 5.2 Agent F owns `PRODUCT.md`, `README.md`, `RUNBOOK.md`, `TODO.md`: "My Space" → "Home" where it names the UI; the switcher wording; TODO "Show many workspaces cleanly" ticked, "Personal Dashboard" pointing at #14.
- [x] 5.3 Lead: `docs/verify/scratch-server.sh start`, `node docs/verify/sidebar-smoke.mjs`, fix until it passes, `scratch-server.sh stop`.

## Phase 6 - Verify

- [x] 6.1 `docs/verify/verify-done.sh` exits 0, output shown in chat
- [x] 6.2 User confirms manual DoD items
- [x] 6.3 CLAUDE.md reviewed: added (TanStack `Link` aria-current gotcha)
