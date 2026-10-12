-- Each rating gets a score from 1 to 100 (100 = as good as new) that says what it means, in place of a position in a
-- hand-ordered list and of code that looked for the names "Good", "Poor" and "Damaged".
ALTER TABLE `condition_ratings` ADD `score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- An untouched list gets the scores below. If any rating has been renamed or added, the names say nothing reliable, so
-- every rating is scored by where it stood in the old order instead: evenly from 100 (first) down to 10 (last).
UPDATE `condition_ratings` SET `score` = CASE
  WHEN (SELECT count(*) FROM `condition_ratings` WHERE lower(trim(`name`)) NOT IN ('new', 'good', 'fair', 'poor', 'damaged')) = 0
    THEN CASE lower(trim(`name`)) WHEN 'new' THEN 100 WHEN 'good' THEN 80 WHEN 'fair' THEN 60 WHEN 'poor' THEN 30 ELSE 10 END
  WHEN (SELECT count(*) FROM `condition_ratings`) = 1 THEN 100
  WHEN (SELECT count(*) FROM `condition_ratings`) <= 91
    THEN 100 - CAST(round(
      (SELECT count(*) FROM `condition_ratings` AS `o`
        WHERE `o`.`sort_order` < `condition_ratings`.`sort_order`
          OR (`o`.`sort_order` = `condition_ratings`.`sort_order` AND `o`.`id` < `condition_ratings`.`id`))
      * 90.0 / ((SELECT count(*) FROM `condition_ratings`) - 1)) AS integer)
  ELSE 100 - (SELECT count(*) FROM `condition_ratings` AS `o`
        WHERE `o`.`sort_order` < `condition_ratings`.`sort_order`
          OR (`o`.`sort_order` = `condition_ratings`.`sort_order` AND `o`.`id` < `condition_ratings`.`id`))
END;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_condition_ratings_score` ON `condition_ratings` (`score`);--> statement-breakpoint
ALTER TABLE `condition_ratings` DROP COLUMN `sort_order`;
