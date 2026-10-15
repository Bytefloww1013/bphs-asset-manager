CREATE TABLE `maintenance_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_by_user_id` integer,
	`created_by_label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_maintenance_notes_kind" CHECK("maintenance_notes"."kind" in ('note', 'system'))
);
--> statement-breakpoint
CREATE INDEX `ix_maintenance_notes_request` ON `maintenance_notes` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `maintenance_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text NOT NULL,
	`program` text NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`urgent` text,
	`request_date` text,
	`noticed_date` text,
	`zoho_added_time` text,
	`received_at` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`assigned_employee_id` integer,
	FOREIGN KEY (`assigned_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_maintenance_status" CHECK("maintenance_requests"."status" in ('not_started', 'dispatched', 'on_hold', 'rejected', 'finished')),
	CONSTRAINT "ck_maintenance_dispatch" CHECK(("maintenance_requests"."status" != 'dispatched' or "maintenance_requests"."assigned_employee_id" is not null) and ("maintenance_requests"."status" != 'not_started' or "maintenance_requests"."assigned_employee_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_maintenance_dedupe` ON `maintenance_requests` (`email`,`zoho_added_time`);--> statement-breakpoint
CREATE INDEX `ix_maintenance_received` ON `maintenance_requests` (`received_at`);