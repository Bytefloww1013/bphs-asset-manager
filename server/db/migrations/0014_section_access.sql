ALTER TABLE `users` ADD `access` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_super_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Each role becomes the access it had. Every role could add and change employees, so each keeps Employees Edit.
-- A Super Admin is also given Full in every section, so turning the switch off later does not leave them with nothing.
UPDATE `users` SET `is_super_admin` = 1, `access` = '{"assets":"full","grievances":"full","maintenance":"full","employees":"full"}' WHERE `role` = 'super_admin';--> statement-breakpoint
UPDATE `users` SET `access` = '{"assets":"edit","grievances":"edit","employees":"edit"}' WHERE `role` = 'admin';--> statement-breakpoint
UPDATE `users` SET `access` = '{"assets":"edit","employees":"edit"}' WHERE `role` = 'asset_admin';--> statement-breakpoint
UPDATE `users` SET `access` = '{"grievances":"edit","employees":"edit"}' WHERE `role` = 'grievance_admin';--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;
