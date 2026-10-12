-- Close the gaps the first two triggers left: an entry could be renumbered, handed to another user, or swapped for a
-- new one with INSERT OR REPLACE (SQLite does not fire the DELETE trigger for a row that REPLACE removes).
DROP TRIGGER `audit_log_no_update`;
--> statement-breakpoint
-- The one change let through is the foreign key clearing `user_id` when that user is deleted; `actor` keeps the name.
CREATE TRIGGER `audit_log_no_update`
BEFORE UPDATE ON `audit_log`
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
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_replace`
BEFORE INSERT ON `audit_log`
WHEN EXISTS (SELECT 1 FROM `audit_log` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
