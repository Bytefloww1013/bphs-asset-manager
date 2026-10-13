CREATE TABLE `grievance_attachment_data` (
	`attachment_id` integer PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `grievance_attachments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `grievance_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grievance_id` integer NOT NULL,
	`entry_id` integer,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by_user_id` integer NOT NULL,
	`uploaded_by_label` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawn_reason` text,
	FOREIGN KEY (`grievance_id`) REFERENCES `grievances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `grievance_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_grievance_attachments_grievance` ON `grievance_attachments` (`grievance_id`);--> statement-breakpoint
CREATE INDEX `ix_grievance_attachments_entry` ON `grievance_attachments` (`entry_id`);--> statement-breakpoint
-- Nothing is removed (G2). The one change let through is withdrawing a file: setting when and why, once.
CREATE TRIGGER `grievance_attachments_no_update`
BEFORE UPDATE ON `grievance_attachments`
WHEN NOT (
  OLD.`withdrawn_at` IS NULL
  AND NEW.`withdrawn_at` IS NOT NULL
  AND NEW.`withdrawn_reason` IS NOT NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`grievance_id` IS OLD.`grievance_id`
  AND NEW.`entry_id` IS OLD.`entry_id`
  AND NEW.`filename` IS OLD.`filename`
  AND NEW.`content_type` IS OLD.`content_type`
  AND NEW.`size` IS OLD.`size`
  AND NEW.`sha256` IS OLD.`sha256`
  AND NEW.`uploaded_by_user_id` IS OLD.`uploaded_by_user_id`
  AND NEW.`uploaded_by_label` IS OLD.`uploaded_by_label`
  AND NEW.`uploaded_at` IS OLD.`uploaded_at`
)
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachments can only be withdrawn');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_attachments_no_delete`
BEFORE DELETE ON `grievance_attachments`
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachments is append-only');
END;
--> statement-breakpoint
-- A file on an entry belongs to that entry's grievance.
CREATE TRIGGER `grievance_attachments_entry_own`
BEFORE INSERT ON `grievance_attachments`
WHEN NEW.`entry_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `grievance_entries` WHERE `id` = NEW.`entry_id` AND `grievance_id` = NEW.`grievance_id`)
BEGIN
  SELECT RAISE(ABORT, 'an attachment must belong to an entry of the same grievance');
END;
--> statement-breakpoint
-- The bytes of a file never change and are never removed; a withdrawn file's bytes stay, unreadable through the app.
CREATE TRIGGER `grievance_attachment_data_no_update`
BEFORE UPDATE ON `grievance_attachment_data`
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachment_data is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_attachment_data_no_delete`
BEFORE DELETE ON `grievance_attachment_data`
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachment_data is append-only');
END;
--> statement-breakpoint
-- INSERT OR REPLACE deletes without firing a delete trigger; this closes that way round.
CREATE TRIGGER `grievance_attachments_no_replace`
BEFORE INSERT ON `grievance_attachments`
WHEN EXISTS (SELECT 1 FROM `grievance_attachments` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachments is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_attachment_data_no_replace`
BEFORE INSERT ON `grievance_attachment_data`
WHEN EXISTS (SELECT 1 FROM `grievance_attachment_data` WHERE `attachment_id` = NEW.`attachment_id`)
BEGIN
  SELECT RAISE(ABORT, 'grievance_attachment_data is append-only');
END;
