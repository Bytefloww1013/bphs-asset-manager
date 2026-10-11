CREATE TABLE `asset_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_types_name_unique` ON `asset_types` (`name`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag` text NOT NULL,
	`type_id` integer NOT NULL,
	`serial` text,
	`status` text DEFAULT 'in_service' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_tag_unique` ON `assets` (`tag`);--> statement-breakpoint
CREATE INDEX `ix_assets_type` ON `assets` (`type_id`);--> statement-breakpoint
CREATE INDEX `ix_assets_serial` ON `assets` (`serial`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`returned_at` integer,
	`issued_by_id` integer NOT NULL,
	`returned_by_id` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`returned_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignments_one_open_per_asset` ON `assignments` (`asset_id`) WHERE "assignments"."returned_at" is null;--> statement-breakpoint
CREATE INDEX `ix_assignments_employee` ON `assignments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ix_assignments_asset` ON `assignments` (`asset_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer NOT NULL,
	`user_id` integer,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`details` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_audit_time` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `condition_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_ratings_name_unique` ON `condition_ratings` (`name`);--> statement-breakpoint
CREATE TABLE `conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`assignment_id` integer,
	`kind` text NOT NULL,
	`rating_id` integer NOT NULL,
	`assessed_by_id` integer,
	`notes` text,
	`recorded_by_id` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rating_id`) REFERENCES `condition_ratings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assessed_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_conditions_asset` ON `conditions` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_conditions_rating` ON `conditions` (`rating_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`department` text,
	`job_title` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_code_unique` ON `employees` (`code`);--> statement-breakpoint
CREATE INDEX `ix_employees_name` ON `employees` (`last_name`,`first_name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`employee_id` integer,
	`must_change_password` integer DEFAULT true NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);