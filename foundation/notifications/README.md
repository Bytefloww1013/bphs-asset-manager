# `notifications` (foundation)

The Inbox, the bell and its unread count, and the notices a Super Admin sends. Every module tells people things through `notify()`; this module owns the rows and the pages that show them.

## Tables

- `notifications` (`server/schema.ts`): one row per recipient, with its kind, what it is about (`source_key`, as in `asset:113`), title, body, in-app link, and when it was read and archived. Written only by `notify()`.
- `notices` (`server/schema.ts`): a Super Admin's announcement, sent to everyone or to the accounts picked. Each recipient gets a `notice` notification with the source key `notice:<id>`.

## Resources and rules

- No resource of its own. Every signed-in account reads and changes its own notifications only (`/api/me/notifications*`, `/api/me/notices/:id`); another account's id is a 404.
- Sending notices and seeing who read them is for Super Admins (`canSendNotices`, `/api/notices`).
- `notify()` runs inside the transaction of the change that caused it, so a change that rolls back takes its notifications with it. The actor and inactive accounts get nothing. A link must be an in-app path, and the kind must be one a module declares.
- Grievances and Administrative Reviews never notify (the generator refuses notification kinds from a confidential module, and the boundary lint keeps them from importing this module).

## Notifications

- Each module declares its kinds and their labels in its manifest (`notificationKinds`); `notificationKinds()` (`shared/registry.ts`) is them all, and the Inbox and the bell label rows with it. A kind is declared once.
- This module declares `notice` and the kernel's account kinds (`account_password_reset`, `account_access_changed`, `account_unlocked`, `account_employee_linked`): the kernel has no manifest of its own.
- `employeeNotificationKinds` in a manifest lists the kinds that tell an account about the employee linked to it. `forgetEmployeeNotifications` drops them when the link changes.

## Jobs

- `notifications.purge`, every 6 hours and at start: notifications and notices over a year old go, read or not.

## Hooks

- None. Other modules call the public API instead.

## Public API

- `server/index.ts`: the `notifications` and `notices` tables; `notify` and `NewNotification`; `accountOf` and `sectionTeam` (recipient lists); `forgetNotifications` (a record is deleted), `forgetEmployeeNotifications` (an account's employee link changes), `relinkNotifications` (a page moves, as when an asset's tag changes); `purgeNotifications`.
- `shared/index.ts`: `canSendNotices`, the notice limits, the Inbox views, the list and notice schemas, and the row types.
- `web/index.ts`: `NotificationBell` and `UnreadBadge` (the shell draws them), `notificationCountQuery` (the Home nav's badge).

## Pages

- `/me/inbox` (`web/routes/inbox.tsx`), `/me/inbox/$noticeId` (`web/routes/inbox_.$noticeId.tsx`) and `/me/notices` (`web/routes/notices.tsx`), under Home. Their nav entries are this module's (`web/module.ts`).

## Gotchas

- The pages nest under the kernel's `/me` layout (`web/src/routes/_app/me.tsx`), so their route ids stay `/_app/me/...`.
- The overdue reminders (`sendOverdueReminders`) and their job are the assets module's: they are its custody rule, sent through `notify()`.
- Every query is keyed under `notifications` (and `notice`, `notices`), so invalidating `['notifications']` refreshes the bell, its popover and the Inbox together.
