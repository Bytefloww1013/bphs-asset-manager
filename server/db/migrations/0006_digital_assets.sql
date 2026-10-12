CREATE TABLE `digital_asset_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digital_asset_types_name_unique` ON `digital_asset_types` (`name`);--> statement-breakpoint
CREATE TABLE `digital_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type_id` integer NOT NULL,
	`account` text NOT NULL,
	`status` text DEFAULT 'in_service' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `digital_asset_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digital_assets_code_unique` ON `digital_assets` (`code`);--> statement-breakpoint
CREATE INDEX `ix_digital_assets_type` ON `digital_assets` (`type_id`);--> statement-breakpoint
CREATE TABLE `digital_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digital_asset_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`returned_at` integer,
	`issued_by_id` integer NOT NULL,
	`returned_by_id` integer,
	FOREIGN KEY (`digital_asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`returned_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_digital_assignments_one_open_per_asset` ON `digital_assignments` (`digital_asset_id`) WHERE "digital_assignments"."returned_at" is null;--> statement-breakpoint
CREATE INDEX `ix_digital_assignments_employee` ON `digital_assignments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ix_digital_assignments_asset` ON `digital_assignments` (`digital_asset_id`);--> statement-breakpoint
-- The four kinds of seat the register opens with. They are part of the schema's first state, not demo data, so they are added
-- here once and can be renamed, deactivated or deleted on the Lists screen like any other.
INSERT INTO `digital_asset_types` (`name`) VALUES ('M365-BusinessStandard'), ('M365-PowerBI'), ('Zoho'), ('Relias');
