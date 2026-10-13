CREATE TABLE `grievance_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grievance_id` integer NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`short_description` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`date_made` text NOT NULL,
	`category_name` text NOT NULL,
	`people` text NOT NULL,
	`changed_by_user_id` integer NOT NULL,
	`changed_by_label` text NOT NULL,
	`changed_at` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`grievance_id`) REFERENCES `grievances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_grievance_versions` ON `grievance_versions` (`grievance_id`,`version`);--> statement-breakpoint
-- Append-only, on the same terms as the timeline: an earlier version is never changed, removed or replaced.
CREATE TRIGGER `grievance_versions_no_update`
BEFORE UPDATE ON `grievance_versions`
BEGIN
  SELECT RAISE(ABORT, 'grievance_versions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_versions_no_delete`
BEFORE DELETE ON `grievance_versions`
BEGIN
  SELECT RAISE(ABORT, 'grievance_versions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `grievance_versions_no_replace`
BEFORE INSERT ON `grievance_versions`
WHEN EXISTS (SELECT 1 FROM `grievance_versions` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'grievance_versions is append-only');
END;
