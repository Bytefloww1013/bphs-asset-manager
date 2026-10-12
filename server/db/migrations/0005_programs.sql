CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_programs_code` ON `programs` ("code" collate nocase);--> statement-breakpoint
CREATE INDEX `ix_programs_name` ON `programs` (`name`);--> statement-breakpoint
-- An assignment is now held by an employee or by a program. SQLite cannot make `employee_id` optional or add the check in
-- place, so `assignments` is rebuilt, keeping every row and its id. Migrations run inside one transaction with foreign keys
-- on, where a table that other rows point at cannot be dropped, so `conditions` (the only table pointing at it) is set aside
-- first and put back afterwards, unchanged.
CREATE TABLE `__new_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`employee_id` integer,
	`program_id` integer,
	`issued_at` integer NOT NULL,
	`returned_at` integer,
	`issued_by_id` integer NOT NULL,
	`returned_by_id` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`returned_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_assignments_one_holder` CHECK((`employee_id` is null) <> (`program_id` is null))
);
--> statement-breakpoint
INSERT INTO `__new_assignments` (`id`, `asset_id`, `employee_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`)
SELECT `id`, `asset_id`, `employee_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id` FROM `assignments`;--> statement-breakpoint
-- Ids are never handed out twice, so each rebuilt table carries on counting from where the old one stopped.
DELETE FROM `sqlite_sequence` WHERE `name` = '__new_assignments';--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT '__new_assignments', `seq` FROM `sqlite_sequence` WHERE `name` = 'assignments';--> statement-breakpoint
CREATE TABLE `__kept_conditions` AS SELECT * FROM `conditions`;--> statement-breakpoint
CREATE TABLE `__kept_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'conditions';--> statement-breakpoint
DROP TABLE `conditions`;--> statement-breakpoint
DROP TABLE `assignments`;--> statement-breakpoint
ALTER TABLE `__new_assignments` RENAME TO `assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignments_one_open_per_asset` ON `assignments` (`asset_id`) WHERE "assignments"."returned_at" is null;--> statement-breakpoint
CREATE INDEX `ix_assignments_employee` ON `assignments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ix_assignments_program` ON `assignments` (`program_id`);--> statement-breakpoint
CREATE INDEX `ix_assignments_asset` ON `assignments` (`asset_id`);--> statement-breakpoint
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
INSERT INTO `conditions` (`id`, `asset_id`, `assignment_id`, `kind`, `rating_id`, `assessed_by_id`, `notes`, `recorded_by_id`, `recorded_at`)
SELECT `id`, `asset_id`, `assignment_id`, `kind`, `rating_id`, `assessed_by_id`, `notes`, `recorded_by_id`, `recorded_at` FROM `__kept_conditions`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'conditions';--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT 'conditions', `seq` FROM `__kept_sequence`;--> statement-breakpoint
DROP TABLE `__kept_conditions`;--> statement-breakpoint
DROP TABLE `__kept_sequence`;--> statement-breakpoint
CREATE INDEX `ix_conditions_asset` ON `conditions` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_conditions_rating` ON `conditions` (`rating_id`);
