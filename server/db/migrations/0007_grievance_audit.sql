CREATE TABLE `grievance_audit_log` (
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
CREATE INDEX `ix_grievance_audit_time` ON `grievance_audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_grievance_audit_action` ON `grievance_audit_log` (`action`);--> statement-breakpoint
-- Append-only, on the same terms as `audit_log`: no entry may be changed, removed or replaced. The one change let through
-- is the foreign key clearing `user_id` when that user is deleted; `actor` keeps the name.
CREATE TRIGGER `grievance_audit_log_no_update`
BEFORE UPDATE ON `grievance_audit_log`
WHEN NOT (
  NEW.`user_id` IS NULL
  AND NEW.`id` IS OLD.`id`
  AND NEW.`occurred_at` IS OLD.`occurred_at`
  AND NEW.`actor` IS OLD.`actor`
  AND NEW.`action` IS OLD.`action`
  AND NEW.`entity_type` IS OLD.`entity_type`
  AND NEW.`entity_id` IS OLD.`entity_id`
  AND NEW.`details` IS OLD.`details`
)
BEGIN
  SELECT RAISE(ABORT, 'grievance_audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_audit_log_no_delete`
BEFORE DELETE ON `grievance_audit_log`
BEGIN
  SELECT RAISE(ABORT, 'grievance_audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_audit_log_no_replace`
BEFORE INSERT ON `grievance_audit_log`
WHEN EXISTS (SELECT 1 FROM `grievance_audit_log` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'grievance_audit_log is append-only');
END;
