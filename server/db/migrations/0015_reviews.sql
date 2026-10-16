CREATE TABLE `review_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer NOT NULL,
	`user_id` integer,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`review_id` integer,
	`details` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_review_audit_time` ON `review_audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_review_audit_action` ON `review_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `ix_review_audit_review` ON `review_audit_log` (`review_id`);--> statement-breakpoint
CREATE TABLE `review_caps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`short_description` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`responsible_employee_id` integer NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`completed_by_user_id` integer,
	`completed_by_label` text,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`responsible_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_review_caps_status" CHECK("review_caps"."status" in ('not_started', 'in_progress', 'completed', 'cancelled')),
	CONSTRAINT "ck_review_caps_completed" CHECK(("review_caps"."status" = 'completed') = ("review_caps"."completed_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_caps_seq` ON `review_caps` (`review_id`,`seq`);--> statement-breakpoint
CREATE INDEX `ix_review_caps_responsible` ON `review_caps` (`responsible_employee_id`);--> statement-breakpoint
CREATE INDEX `ix_review_caps_due` ON `review_caps` (`due_date`);--> statement-breakpoint
CREATE TABLE `review_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`cap_id` integer,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`corrects_entry_id` integer,
	`occurred_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`title` text NOT NULL,
	`short_description` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`documented_by_employee_id` integer,
	`documented_by_user_id` integer NOT NULL,
	`documented_by_label` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cap_id`) REFERENCES `review_caps`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corrects_entry_id`) REFERENCES `review_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`documented_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`documented_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_review_entries_kind" CHECK("review_entries"."kind" in ('update', 'correction', 'system')),
	CONSTRAINT "ck_review_entries_corrects" CHECK(("review_entries"."kind" = 'correction') = ("review_entries"."corrects_entry_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_entries_seq` ON `review_entries` (`review_id`,`seq`);--> statement-breakpoint
CREATE INDEX `ix_review_entries_occurred` ON `review_entries` (`review_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_review_entries_cap` ON `review_entries` (`cap_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`findings` text DEFAULT '' NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`review_date` text NOT NULL,
	`employee_id` integer NOT NULL,
	`reviewer_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_activity_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_reviews_status" CHECK("reviews"."status" in ('open', 'in_progress', 'completed', 'voided')),
	CONSTRAINT "ck_reviews_people" CHECK("reviews"."employee_id" != "reviews"."reviewer_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_code_unique` ON `reviews` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reviews_year_seq` ON `reviews` (`year`,`seq`);--> statement-breakpoint
CREATE INDEX `ix_reviews_status` ON `reviews` (`status`);--> statement-breakpoint
CREATE INDEX `ix_reviews_employee` ON `reviews` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ix_reviews_reviewer` ON `reviews` (`reviewer_id`);--> statement-breakpoint
CREATE INDEX `ix_reviews_review_date` ON `reviews` (`review_date`);--> statement-breakpoint
-- Append-only, on the same terms as `grievance_audit_log`. The one change let through is the foreign key clearing `user_id`
-- when that user is deleted; `actor` keeps the name.
CREATE TRIGGER `review_audit_log_no_update`
BEFORE UPDATE ON `review_audit_log`
WHEN NOT (
  NEW.`user_id` IS NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`occurred_at` IS OLD.`occurred_at`
  AND NEW.`actor` IS OLD.`actor`
  AND NEW.`action` IS OLD.`action`
  AND NEW.`entity_type` IS OLD.`entity_type`
  AND NEW.`entity_id` IS OLD.`entity_id`
  AND NEW.`review_id` IS OLD.`review_id`
  AND NEW.`details` IS OLD.`details`
)
BEGIN
  SELECT RAISE(ABORT, 'review_audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_audit_log_no_delete`
BEFORE DELETE ON `review_audit_log`
BEGIN
  SELECT RAISE(ABORT, 'review_audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_audit_log_no_replace`
BEFORE INSERT ON `review_audit_log`
WHEN EXISTS (SELECT 1 FROM `review_audit_log` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'review_audit_log is append-only');
END;
--> statement-breakpoint
-- A review's history is never changed or removed, only corrected by a later entry. The one change let through is the foreign
-- key clearing `documented_by_employee_id`; `documented_by_label` keeps the name.
CREATE TRIGGER `review_entries_no_update`
BEFORE UPDATE ON `review_entries`
WHEN NOT (
  NEW.`documented_by_employee_id` IS NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`review_id` IS OLD.`review_id`
  AND NEW.`cap_id` IS OLD.`cap_id`
  AND NEW.`seq` IS OLD.`seq`
  AND NEW.`kind` IS OLD.`kind`
  AND NEW.`corrects_entry_id` IS OLD.`corrects_entry_id`
  AND NEW.`occurred_at` IS OLD.`occurred_at`
  AND NEW.`recorded_at` IS OLD.`recorded_at`
  AND NEW.`title` IS OLD.`title`
  AND NEW.`short_description` IS OLD.`short_description`
  AND NEW.`body_html` IS OLD.`body_html`
  AND NEW.`body_text` IS OLD.`body_text`
  AND NEW.`documented_by_user_id` IS OLD.`documented_by_user_id`
  AND NEW.`documented_by_label` IS OLD.`documented_by_label`
)
BEGIN
  SELECT RAISE(ABORT, 'review_entries is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_entries_no_delete`
BEFORE DELETE ON `review_entries`
BEGIN
  SELECT RAISE(ABORT, 'review_entries is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `review_entries_no_replace`
BEFORE INSERT ON `review_entries`
WHEN EXISTS (SELECT 1 FROM `review_entries` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'review_entries is append-only');
END;
--> statement-breakpoint
-- An entry's CAP, and the entry a correction points at, are on the entry's own review.
CREATE TRIGGER `review_entries_same_review`
BEFORE INSERT ON `review_entries`
WHEN (NEW.`cap_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `review_caps` WHERE `id` = NEW.`cap_id` AND `review_id` = NEW.`review_id`))
  OR (NEW.`corrects_entry_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `review_entries` WHERE `id` = NEW.`corrects_entry_id` AND `review_id` = NEW.`review_id`))
BEGIN
  SELECT RAISE(ABORT, 'an entry''s CAP and corrected entry must be on the same review');
END;
