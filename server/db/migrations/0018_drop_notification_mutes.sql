DROP TABLE `notification_mutes`;--> statement-breakpoint
DROP INDEX `ix_notifications_unread`;--> statement-breakpoint
CREATE INDEX `ix_notifications_unread` ON `notifications` (`user_id`) WHERE "notifications"."read_at" is null and "notifications"."archived_at" is null;--> statement-breakpoint
ALTER TABLE `notifications` DROP COLUMN `muted`;