# My Space — plan

> **[NotificationsAndMessages-plan.md](NotificationsAndMessages-plan.md) depends on this plan.** Build this one first: the Inbox, notification settings and notices all live in My Space.

Status: **planned (2026-10-19), not started.** Nothing here is built until the go-ahead is given.

## How this plan is worked

- Each phase is made of slices. Tick a slice's box when it is done, and commit the tick with the slice's work: **one commit per slice**.
- **Push to `main` when a phase is done**, not before.
- Each slice ends with `bun run typecheck` and `bun run test` passing. Slices that change screens are also checked in the browser.
- Deploying to the VPS is separate. It happens only when you ask, with [DEPLOY-GUIDE.md step 13](DEPLOY-GUIDE.md#13-deploy-later-updates).

## 1. What it is

**My Space** is an area of the app that belongs to the signed-in person rather than to a team. Every account has one, whatever its access. It is where personal features go, now and later: the Inbox, notification settings, profile details, and eventually a mailbox, a personal dashboard, tasks or a calendar.

**Why "My Space" and not "My Workspace".** In this app a *workspace* (Assets, Grievances, Maintenance, Administrative Reviews) is a shared work area that access is granted to and that appears in the workspace switcher. My Space is neither of those. Calling it a workspace would blur that line just as more workspaces are being asked for. "My Account" sounds like settings only, and the area is meant to grow beyond that.

## 2. Decisions made

| Question | Decision |
|---|---|
| Separate plan or part of notifications? | A separate plan, built first. |
| How people get in | From the account menu at the foot of the sidebar, and (once notifications exist) from the bell. **It is not in the workspace switcher.** How to show many workspaces cleanly is a Future TODO in [TODO.md](TODO.md). |
| Address | `/me`, with pages below it (`/me/profile`, later `/me/inbox`, …). |
| Sidebar | My Space has its own sidebar. At the top, in place of the switcher, is a **Back to *last workspace*** link. |
| First pages | **Profile** (read-only). Placeholders for **Mailbox** and **Personal Dashboard**: shown greyed out, not clickable, marked "Coming later". |
| Pages added by the notifications plan | Inbox, Notification settings, and Notices (Super Admins only). |
| Change password | Stays where it is: in the account menu, as its own full-screen page (which the forced first sign-in also uses). |
| Colour | Uses the neutral accent. It does not take on a workspace's colour. |

## 3. How it fits the code today

- The address decides the workspace: `workspaceOf()` in [web/src/lib/workspace.ts](web/src/lib/workspace.ts) treats any unknown path as **Assets**. Left as it is, `/me` would show the Assets sidebar. Worse, the `_app` guard (`requireSession(..., workspaceOf(pathname))` in [web/src/routes/_app.tsx](web/src/routes/_app.tsx)) would send an account without Assets access somewhere else.
- So My Space is a new kind of **area**, beside the workspaces. It is **not** added to `WORKSPACES` in [shared/constants.ts](shared/constants.ts): that list also drives `SECTIONS`, access levels and the Users screen, and My Space needs no access grant.
- `rememberWorkspace()` must not remember My Space. Reopening the app should still go to the last *workspace*, and the Back link needs that workspace.
- The sidebar is built per workspace in `useNav()` in [web/src/components/shell/app-shell.tsx](web/src/components/shell/app-shell.tsx). My Space adds one more branch there, and that branch is the list that later plans add pages to.
- The server needs nothing new for this plan. The Profile page reads the session user (`meQuery`). It gets the linked employee's name from `lookupsQuery`, whose employee list every account may read.

## 4. Phases and slices

### Phase 1 — The area itself

- [ ] **1.1 Route and area detection.**
  - Add `/me` under `_app`: a `me.tsx` layout and a `me.index.tsx` that redirects to `/me/profile`.
  - Add an `Area` type (`Workspace | 'me'`) and `useArea()` next to `useWorkspace()`. `workspaceOf()` keeps returning a workspace, for the existing callers.
  - Make the `_app` guard check only the session for `/me` paths, with no workspace access needed.
  - Stop `rememberWorkspace()` from recording `me`.
  - Check: an account with Maintenance access only can open `/me` and is not redirected. Reloading `/me` stays on `/me`.
- [ ] **1.2 Shell: sidebar, Back link, entry point.**
  - In My Space, show the My Space sidebar in place of the workspace switcher and the workspace nav. The nav is a list of entries with an optional `disabled` reason, so later plans add pages by adding entries.
  - Add **Back to *last workspace*** at the top of the sidebar.
  - Add **My Space** as the first item in the account menu.
  - The mobile drawer gets the same sidebar.
  - Check: the wide and narrow layouts, keyboard order, and that the Back link goes to the right workspace.
- [ ] **1.3 Profile page.**
  - `/me/profile`, read-only: name, email, linked employee (code and name), Super Admin badge, and each section's access level, worded as on the Users screen.
  - Include a **Change password** link to the existing page.
  - Check: a Super Admin, an account with mixed access, and the first account (which has no linked employee).
- [ ] **1.4 Placeholders.**
  - **Mailbox** and **Personal Dashboard** entries in the My Space sidebar: greyed out, `aria-disabled`, not focusable as links, with a "Coming later" hint that screen readers also get.
  - Check them in the browser with the keyboard and a screen-reader label check.

### Phase 2 — Docs and end-to-end check

- [ ] **2.1 Docs.**
  - [PRODUCT.md](PRODUCT.md) and [README.md](README.md): what My Space is, and why it is not a workspace.
  - [DESIGN.md](DESIGN.md): the My Space sidebar, the Back link and disabled nav entries.
- [ ] **2.2 End-to-end browser check.**
  - Sign in as three accounts (Super Admin, Assets-only, Maintenance-only).
  - Open My Space from the account menu, use the Back link, reload on a My Space page, try a narrow window, and check that the placeholders cannot be activated.
  - Record the results in [design-qa.md](design-qa.md).

## 5. Not in this plan

- The bell, Inbox, settings and notices: [NotificationsAndMessages-plan.md](NotificationsAndMessages-plan.md).
- Mailbox (messages between people), the personal dashboard, and how many workspaces are shown: Future TODOs in [TODO.md](TODO.md).
