CREATE TABLE `asset_brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_brands_name_unique` ON `asset_brands` (`name`);--> statement-breakpoint
-- Every asset that exists now gets this brand. It is archived, so no form offers it: a new asset or an edit picks a real one.
INSERT INTO `asset_brands` (`name`, `is_active`) VALUES ('Unknown', 0);--> statement-breakpoint
-- SQLite cannot add a NOT NULL column with a foreign key in place, so `assets` is rebuilt, keeping every row and its id.
-- Migrations run inside one transaction with foreign keys on, where a table that other rows point at cannot be dropped, so
-- `assignments` and `conditions` (the tables pointing at it) are set aside first and put back afterwards, unchanged. This is
-- the pattern 0005 used for `assignments`.
CREATE TABLE `__new_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag` text NOT NULL,
	`type_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`model` text,
	`entra_object_id` text,
	`serial` text,
	`status` text DEFAULT 'in_service' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `asset_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`brand_id`) REFERENCES `asset_brands`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_assets` (`id`, `tag`, `type_id`, `brand_id`, `serial`, `status`, `created_at`)
SELECT `id`, `tag`, `type_id`, (SELECT `id` FROM `asset_brands` WHERE `name` = 'Unknown'), `serial`, `status`, `created_at` FROM `assets`;--> statement-breakpoint
-- Ids are never handed out twice, so each rebuilt table carries on counting from where the old one stopped.
DELETE FROM `sqlite_sequence` WHERE `name` = '__new_assets';--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT '__new_assets', `seq` FROM `sqlite_sequence` WHERE `name` = 'assets';--> statement-breakpoint
CREATE TABLE `__kept_assignments` AS SELECT * FROM `assignments`;--> statement-breakpoint
CREATE TABLE `__kept_conditions` AS SELECT * FROM `conditions`;--> statement-breakpoint
CREATE TABLE `__kept_sequence` AS SELECT `name`, `seq` FROM `sqlite_sequence` WHERE `name` IN ('assignments', 'conditions');--> statement-breakpoint
DROP TABLE `conditions`;--> statement-breakpoint
DROP TABLE `assignments`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_tag_unique` ON `assets` (`tag`);--> statement-breakpoint
CREATE INDEX `ix_assets_type` ON `assets` (`type_id`);--> statement-breakpoint
CREATE INDEX `ix_assets_brand` ON `assets` (`brand_id`);--> statement-breakpoint
CREATE INDEX `ix_assets_serial` ON `assets` (`serial`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assets_entra_object_id` ON `assets` (`entra_object_id`) WHERE "assets"."entra_object_id" is not null;--> statement-breakpoint
CREATE TABLE `assignments` (
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
INSERT INTO `assignments` (`id`, `asset_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`)
SELECT `id`, `asset_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id` FROM `__kept_assignments`;--> statement-breakpoint
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
CREATE INDEX `ix_conditions_asset` ON `conditions` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_conditions_rating` ON `conditions` (`rating_id`);--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` IN ('assignments', 'conditions');--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT `name`, `seq` FROM `__kept_sequence`;--> statement-breakpoint
DROP TABLE `__kept_assignments`;--> statement-breakpoint
DROP TABLE `__kept_conditions`;--> statement-breakpoint
DROP TABLE `__kept_sequence`;