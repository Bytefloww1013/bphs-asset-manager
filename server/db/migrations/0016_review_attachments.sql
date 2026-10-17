CREATE TABLE `review_attachment_data` (
	`attachment_id` integer PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `review_attachments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `review_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`cap_id` integer,
	`entry_id` integer NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by_user_id` integer NOT NULL,
	`uploaded_by_label` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawn_reason` text,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cap_id`) REFERENCES `review_caps`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `review_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_review_attachments_review` ON `review_attachments` (`review_id`);--> statement-breakpoint
CREATE INDEX `ix_review_attachments_cap` ON `review_attachments` (`cap_id`);--> statement-breakpoint
-- Nothing is removed. The one change let through is withdrawing a file: setting when and why, once.
CREATE TRIGGER `review_attachments_no_update`
BEFORE UPDATE ON `review_attachments`
WHEN NOT (
  OLD.`withdrawn_at` IS NULL
  AND NEW.`withdrawn_at` IS NOT NULL
  AND NEW.`withdrawn_reason` IS NOT NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`review_id` IS OLD.`review_id`
  AND NEW.`cap_id` IS OLD.`cap_id`
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
  SELECT RAISE(ABORT, 'review_attachments can only be withdrawn');
END;
--> statement-breakpoint
CREATE TRIGGER `review_attachments_no_delete`
BEFORE DELETE ON `review_attachments`
BEGIN
  SELECT RAISE(ABORT, 'review_attachments is append-only');
END;
--> statement-breakpoint
-- A file hangs off an entry of its own review, filed under the same CAP or none; the entry's CAP is already held to that review.
CREATE TRIGGER `review_attachments_entry_own`
BEFORE INSERT ON `review_attachments`
WHEN NOT EXISTS (SELECT 1 FROM `review_entries` WHERE `id` = NEW.`entry_id` AND `review_id` = NEW.`review_id` AND `cap_id` IS NEW.`cap_id`)
BEGIN
  SELECT RAISE(ABORT, 'an attachment must belong to an entry of the same review and CAP');
END;
--> statement-breakpoint
-- The bytes of a file never change and are never removed; a withdrawn file's bytes stay, unreadable through the app.
CREATE TRIGGER `review_attachment_data_no_update`
BEFORE UPDATE ON `review_attachment_data`
BEGIN
  SELECT RAISE(ABORT, 'review_attachment_data is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_attachment_data_no_delete`
BEFORE DELETE ON `review_attachment_data`
BEGIN
  SELECT RAISE(ABORT, 'review_attachment_data is append-only');
END;
--> statement-breakpoint
-- INSERT OR REPLACE deletes without firing a delete trigger; this closes that way round.
CREATE TRIGGER `review_attachments_no_replace`
BEFORE INSERT ON `review_attachments`
WHEN EXISTS (SELECT 1 FROM `review_attachments` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'review_attachments is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_attachment_data_no_replace`
BEFORE INSERT ON `review_attachment_data`
WHEN EXISTS (SELECT 1 FROM `review_attachment_data` WHERE `attachment_id` = NEW.`attachment_id`)
BEGIN
  SELECT RAISE(ABORT, 'review_attachment_data is append-only');
END;
