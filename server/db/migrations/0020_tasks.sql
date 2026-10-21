CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`details` text DEFAULT '' NOT NULL,
	`actor_user_id` integer,
	`actor_label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_task_events_kind" CHECK("task_events"."kind" in ('assigned', 'edited', 'completed', 'sent_back', 'approved', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `ix_task_events_task` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignee_user_id` integer NOT NULL,
	`assigner_user_id` integer NOT NULL,
	`assigner_super_admin` integer DEFAULT false NOT NULL,
	`title` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`send_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`requires_approval` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`completion_note` text,
	`approved_at` integer,
	`cancelled_at` integer,
	`reminder_days` text NOT NULL,
	`reminder_time` text NOT NULL,
	`reminder_zone` text NOT NULL,
	`assigner_reminders` text DEFAULT 'none' NOT NULL,
	`arrived_at` integer,
	`past_due_notified_at` integer,
	`last_reminded_on` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_tasks_assigner_reminders" CHECK("tasks"."assigner_reminders" in ('none', 'first', 'every')),
	CONSTRAINT "ck_tasks_due" CHECK("tasks"."due_at" > "tasks"."send_at"),
	CONSTRAINT "ck_tasks_approved" CHECK("tasks"."approved_at" is null or "tasks"."completed_at" is not null)
);
--> statement-breakpoint
CREATE INDEX `ix_tasks_assignee` ON `tasks` (`assignee_user_id`,`send_at`);--> statement-breakpoint
CREATE INDEX `ix_tasks_due` ON `tasks` (`due_at`);