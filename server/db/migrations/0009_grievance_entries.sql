CREATE TABLE `grievance_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grievance_id` integer NOT NULL,
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
	FOREIGN KEY (`grievance_id`) REFERENCES `grievances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corrects_entry_id`) REFERENCES `grievance_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`documented_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`documented_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_grievance_entries_kind" CHECK("grievance_entries"."kind" in ('action', 'event', 'correction', 'system')),
	CONSTRAINT "ck_grievance_entries_corrects" CHECK(("grievance_entries"."kind" = 'correction') = ("grievance_entries"."corrects_entry_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_grievance_entries_seq` ON `grievance_entries` (`grievance_id`,`seq`);--> statement-breakpoint
CREATE INDEX `ix_grievance_entries_occurred` ON `grievance_entries` (`grievance_id`,`occurred_at`);--> statement-breakpoint
-- Every grievance recorded before this table existed gets the first entry it would have had. One whose recording account
-- has since gone is left without it: an entry must name the account that documented it.
INSERT INTO `grievance_entries` (`grievance_id`, `seq`, `kind`, `occurred_at`, `recorded_at`, `title`, `short_description`, `body_html`, `body_text`, `documented_by_employee_id`, `documented_by_user_id`, `documented_by_label`)
SELECT g.`id`, 1, 'system', g.`created_at`, g.`created_at`, 'Grievance recorded', '', '', '', u.`employee_id`, u.`id`, u.`name`
FROM `grievances` g JOIN `users` u ON u.`id` = g.`created_by_user_id`;
--> statement-breakpoint
-- Append-only, on the same terms as the audit logs: no entry may be changed, removed or replaced. The one change let through
-- is the foreign key clearing `documented_by_employee_id` when that employee is deleted; `documented_by_label` keeps the name.
CREATE TRIGGER `grievance_entries_no_update`
BEFORE UPDATE ON `grievance_entries`
WHEN NOT (
  NEW.`documented_by_employee_id` IS NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`grievance_id` IS OLD.`grievance_id`
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
  SELECT RAISE(ABORT, 'grievance_entries is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_entries_no_delete`
BEFORE DELETE ON `grievance_entries`
BEGIN
  SELECT RAISE(ABORT, 'grievance_entries is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_entries_no_replace`
BEFORE INSERT ON `grievance_entries`
WHEN EXISTS (SELECT 1 FROM `grievance_entries` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'grievance_entries is append-only');
END;
--> statement-breakpoint
-- A correction points at an entry of its own grievance.
CREATE TRIGGER `grievance_entries_corrects_own`
BEFORE INSERT ON `grievance_entries`
WHEN NEW.`corrects_entry_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `grievance_entries` WHERE `id` = NEW.`corrects_entry_id` AND `grievance_id` = NEW.`grievance_id`)
BEGIN
  SELECT RAISE(ABORT, 'a correction must point at an entry of the same grievance');
END;
