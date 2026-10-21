CREATE TABLE `task_attachment_data` (
	`attachment_id` integer PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `task_attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`side` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by_user_id` integer,
	`uploaded_by_label` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawn_reason` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_task_attachments_side" CHECK("task_attachments"."side" in ('assigner', 'assignee'))
);
--> statement-breakpoint
CREATE INDEX `ix_task_attachments_task` ON `task_attachments` (`task_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_events` (
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
	CONSTRAINT "ck_task_events_kind" CHECK("__new_task_events"."kind" in ('assigned', 'edited', 'completed', 'sent_back', 'approved', 'cancelled', 'file_withdrawn'))
);
--> statement-breakpoint
INSERT INTO `__new_task_events`("id", "task_id", "kind", "note", "details", "actor_user_id", "actor_label", "created_at") SELECT "id", "task_id", "kind", "note", "details", "actor_user_id", "actor_label", "created_at" FROM `task_events`;--> statement-breakpoint
DROP TABLE `task_events`;--> statement-breakpoint
ALTER TABLE `__new_task_events` RENAME TO `task_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ix_task_events_task` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `requires_file` integer DEFAULT false NOT NULL;