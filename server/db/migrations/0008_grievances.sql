CREATE TABLE `grievance_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grievance_categories_name_unique` ON `grievance_categories` (`name`);--> statement-breakpoint
CREATE TABLE `grievance_people` (
	`grievance_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`grievance_id`) REFERENCES `grievances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_grievance_people_role" CHECK("grievance_people"."role" in ('employee', 'management'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_grievance_people` ON `grievance_people` (`grievance_id`,`employee_id`,`role`);--> statement-breakpoint
CREATE INDEX `ix_grievance_people_employee` ON `grievance_people` (`employee_id`);--> statement-breakpoint
CREATE TABLE `grievances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`short_description` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`date_made` text NOT NULL,
	`owner_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `grievance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_grievances_status" CHECK("grievances"."status" in ('open', 'in_progress', 'resolved', 'closed', 'voided'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grievances_code_unique` ON `grievances` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_grievances_year_seq` ON `grievances` (`year`,`seq`);--> statement-breakpoint
CREATE INDEX `ix_grievances_status` ON `grievances` (`status`);--> statement-breakpoint
CREATE INDEX `ix_grievances_owner` ON `grievances` (`owner_id`);--> statement-breakpoint
CREATE INDEX `ix_grievances_category` ON `grievances` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_grievances_date_made` ON `grievances` (`date_made`);--> statement-breakpoint
-- The starting categories are part of the migration, not the dev seed: production runs on live data and needs them too.
INSERT INTO `grievance_categories` (`name`) VALUES
  ('Conduct'),
  ('Pay and hours'),
  ('Health and safety'),
  ('Discrimination or harassment'),
  ('Working conditions'),
  ('Other');
