# `tasks` (feature)

Employee Tasks: a task sent by one account to one or more others (one task each), with a due date, past-due reminders, files both ways, and an optional approval. Tasks belong to accounts (`users`), not employees, so nothing about an employee is kept here.

## Tables

- `tasks` (`server/schema.ts`): the assignee and assigner accounts, whether a Super Admin assigned it (`assigner_super_admin`, as they were then), the title and rich-text body, `send_at` (now, or a scheduled send), `due_at` (after `send_at`), whether it needs approval or a file, the completion, approval and cancellation times, the reminder days, time and zone, and the assigner's reminders (`none`, `first`, `every`).
- The status is never stored: `taskStatus()` (`shared/tasks.ts`) works it out from those times (Cancelled, Awaiting approval or Completed, Scheduled, Past-Due, Outstanding, in that order).
- The clock's markers (`arrived_at`, `past_due_notified_at`, `last_reminded_on`) say what has been sent, so a restart sends nothing twice.
- `task_events`: each task's history (who, what, a note, the changed fields), deleted with its task.
- `task_attachments` and `task_attachment_data`: a task's files (the assigner's with the task, the assignee's with a completion) and their bytes. Only `server/files.ts` touches the bytes. A withdrawal keeps the row, with its reason, and the file can no longer be downloaded.

## Resources and rules

- The `tasks` resource (`order: 50`, `aboutAccounts`) has the levels None, Read, Assign, Edit and Full. It is the only resource that offers Assign, and the access form's message says so.
- Read sees every task in the Tasks workspace. Assign also sends tasks and edits and cancels its own. Edit edits and cancels anyone's, except a task a Super Admin assigned, which needs Full. Full also deletes (with the history and the notifications).
- Approving or sending back is for the assigner, Edit, Full or a Super Admin, never the assignee (four-eyes). A task sent to its own assigner can't need approval, and an assignee can't change whether their own task needs it.
- Every account sees the tasks sent to it under `/me/tasks`, whatever its access. A scheduled task stays hidden there until it is sent, and anyone else's is a 404.
- A completed, approved or cancelled task can no longer be changed (`taskClosedReason`). Once sent, a task's send time is fixed. A new due date starts its past-due notices over.
- A file is withdrawn by whoever added it, or by anyone who may edit the task.

## Hooks

- Provides the `tasks.clock` job, every minute. It sends scheduled tasks as they arrive, tells the assigner once a task is past due (unless they chose None), and on each reminder day, at the reminder time in the task's zone, reminds the assignee (and the assigner, if they chose Every). A reminder missed for a whole day is skipped. Each task gets its own savepoint, so one failure doesn't stop the rest.
- Uses `notifications` (`notify`, `forgetNotifications`) through its public API, plus the kernel's uploads and rich text.
- `aboutAccounts` on the resource tells the `employees` module to leave Employee Tasks out when it decides whether an account sees every workspace.

## Notifications

- `task_assigned`, `task_updated` and `task_cancelled` go to the assignee, once the task is sent. `task_completed` and `task_approval_requested` go to the assigner. `task_approved` and `task_sent_back` go to the assignee. `task_past_due` goes to either, as the clock decides.
- The assignee's link to `/me/tasks/<id>` and the assigner's to `/tasks/<id>`. All share the source key `task:<id>`, so a delete forgets them. None is an employee kind: they follow the account.

## Public API

- `shared/index.ts`: the statuses and their labels, `taskStatus`, `canAssignTasks`, `canViewEmployeeTasks`, and the row, detail and account types.
- `server/index.ts`: the four tables.
- `web/index.ts`: `tasksQuery` and `myTasksQuery`.

## Pages

- The Tasks workspace (rail `order: 30`): All tasks (`/tasks`), Assign task (`/tasks/new`, locked below Assign), a task (`/tasks/$id`) and its edit page (`/tasks/$id/edit`).
- My tasks on Home (`/me/tasks`, before Profile) and a task there (`/me/tasks/$id`). The files sit flat in `web/routes/` with the module's `routePrefix` `''`, so their URLs and route ids are unchanged, and they nest under the kernel's `me.tsx` by path.
- The API is `/api/tasks` (the workspace) and `/api/me/tasks` (each account's own).

## Gotchas

- The module's `seed` (`server/seed.ts`, loaded only by `bun run db:seed`) runs after the reviews', on the kernel's one random sequence, so the demo data stays the same.
- The `/me/tasks` queries are keyed under `tasks`, not `me`: `refreshData` skips `me` queries, and a write must refresh these.
- A task's reminder time is the assigner's wall clock (`reminder_zone`), not the server's: `localTime` in `server/service.ts` turns an instant into it.
