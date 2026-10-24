-- The custody merge (issue #23): `assignments` (physical assets) and `digital_assignments` (digital seats) become one ledger,
-- `assignments`, whose rows name their item by kind and id. Every row is kept. A physical row keeps its id, which conditions,
-- the audit log and notifications point at. A digital row gets a new one after them: nothing stored names a digital
-- assignment's id (the audit log and notifications name the seat), so the ids only have to stay unique.
-- Migrations run inside one transaction with foreign keys on, where a table other rows point at cannot be dropped, so
-- `conditions` is set aside first and put back afterwards, unchanged: the pattern 0005 and 0023 used.
CREATE TABLE `__new_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`item_id` integer NOT NULL,
	`employee_id` integer,
	`program_id` integer,
	`issued_at` integer NOT NULL,
	`returned_at` integer,
	`issued_by_id` integer NOT NULL,
	`returned_by_id` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`returned_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_assignments_one_holder` CHECK((`employee_id` is null) <> (`program_id` is null))
);
--> statement-breakpoint
INSERT INTO `__new_assignments` (`id`, `kind`, `item_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`)
SELECT `id`, 'asset', `asset_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id` FROM `assignments`;--> statement-breakpoint
-- Numbered after every id the physical ledger has handed out, deleted ones too, in their own order.
INSERT INTO `__new_assignments` (`id`, `kind`, `item_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`)
SELECT max(coalesce((SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'assignments'), 0), coalesce((SELECT max(`id`) FROM `assignments`), 0))
         + row_number() OVER (ORDER BY `id`),
       'digital-asset', `digital_asset_id`, `employee_id`, NULL, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`
FROM `digital_assignments`;--> statement-breakpoint
-- Ids are never handed out twice, so the ledger carries on counting from the highest of both.
DELETE FROM `sqlite_sequence` WHERE `name` = '__new_assignments';--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`)
SELECT '__new_assignments', max(coalesce((SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'assignments'), 0), coalesce((SELECT max(`id`) FROM `__new_assignments`), 0));--> statement-breakpoint
CREATE TABLE `__kept_conditions` AS SELECT * FROM `conditions`;--> statement-breakpoint
CREATE TABLE `__kept_sequence` AS SELECT `name`, `seq` FROM `sqlite_sequence` WHERE `name` = 'conditions';--> statement-breakpoint
DROP TABLE `conditions`;--> statement-breakpoint
DROP TABLE `assignments`;--> statement-breakpoint
DROP TABLE `digital_assignments`;--> statement-breakpoint
ALTER TABLE `__new_assignments` RENAME TO `assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assignments_one_open_per_item` ON `assignments` (`kind`,`item_id`) WHERE "assignments"."returned_at" is null;--> statement-breakpoint
CREATE INDEX `ix_assignments_employee` ON `assignments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ix_assignments_program` ON `assignments` (`program_id`);--> statement-breakpoint
CREATE INDEX `ix_assignments_item` ON `assignments` (`kind`,`item_id`);--> statement-breakpoint
CREATE TABLE `conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`assignment_id` integer,
	`kind` text NOT NULL,
	`rating_id` integer NOT NULL,
	`assessed_by_id` integer,
	`notes` text,
	`recorded_by_id` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rating_id`) REFERENCES `condition_ratings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assessed_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `conditions` (`id`, `asset_id`, `assignment_id`, `kind`, `rating_id`, `assessed_by_id`, `notes`, `recorded_by_id`, `recorded_at`)
SELECT `id`, `asset_id`, `assignment_id`, `kind`, `rating_id`, `assessed_by_id`, `notes`, `recorded_by_id`, `recorded_at` FROM `__kept_conditions`;--> statement-breakpoint
CREATE INDEX `ix_conditions_asset` ON `conditions` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_conditions_rating` ON `conditions` (`rating_id`);--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'conditions';--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT `name`, `seq` FROM `__kept_sequence`;--> statement-breakpoint
DROP TABLE `__kept_conditions`;--> statement-breakpoint
DROP TABLE `__kept_sequence`;--> statement-breakpoint
-- The foreign keys `item_id` can't have, one kind at a time: a row names an item that is there, keeps naming it, and an item
-- that was ever held is never deleted. A module that registers a new custody kind adds the same three for its table.
CREATE TRIGGER `assignments_item_exists`
BEFORE INSERT ON `assignments`
WHEN (NEW.`kind` = 'asset' AND NOT EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`item_id`))
  OR (NEW.`kind` = 'digital-asset' AND NOT EXISTS (SELECT 1 FROM `digital_assets` WHERE `id` = NEW.`item_id`))
BEGIN
  SELECT RAISE(ABORT, 'assignments: no such item');
END;
--> statement-breakpoint
CREATE TRIGGER `assignments_item_fixed`
BEFORE UPDATE OF `kind`, `item_id` ON `assignments`
WHEN NEW.`kind` IS NOT OLD.`kind` OR NEW.`item_id` IS NOT OLD.`item_id`
BEGIN
  SELECT RAISE(ABORT, 'assignments: an assignment keeps its item');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_keep_held`
BEFORE DELETE ON `assets`
WHEN EXISTS (SELECT 1 FROM `assignments` WHERE `kind` = 'asset' AND `item_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'assets: one with assignment history is never deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `digital_assets_keep_held`
BEFORE DELETE ON `digital_assets`
WHEN EXISTS (SELECT 1 FROM `assignments` WHERE `kind` = 'digital-asset' AND `item_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'digital_assets: one with assignment history is never deleted');
END;
