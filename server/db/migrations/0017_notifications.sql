CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_notices_audience" CHECK("notices"."audience" in ('all', 'picked'))
);
--> statement-breakpoint
CREATE TABLE `notification_mutes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source_key` text,
	`until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_mutes` ON `notification_mutes` (`user_id`,`kind`,coalesce("source_key", ''));--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`archived_at` integer,
	`muted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_notifications_user` ON `notifications` (`user_id`,`archived_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_notifications_unread` ON `notifications` (`user_id`) WHERE "notifications"."read_at" is null and "notifications"."archived_at" is null and "notifications"."muted" = 0;