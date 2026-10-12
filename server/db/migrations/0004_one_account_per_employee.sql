-- An employee may be linked to one account only. Where several accounts share an employee today, one keeps the link: an
-- active account before a deactivated one, then the oldest. The others are unlinked, and the Audit Log says so first.
INSERT INTO `audit_log` (`occurred_at`, `user_id`, `actor`, `action`, `entity_type`, `entity_id`, `details`)
SELECT unixepoch() * 1000, NULL, 'migration', 'update', 'user', `u`.`id`,
  `u`.`email` || ' · linked employee: ' || `e`.`code` || ' ' || trim(`e`.`first_name` || ' ' || `e`.`last_name`)
    || ' → none (an employee may be linked to one account only)'
FROM `users` AS `u` JOIN `employees` AS `e` ON `e`.`id` = `u`.`employee_id`
WHERE `u`.`id` <> (SELECT `k`.`id` FROM `users` AS `k` WHERE `k`.`employee_id` = `u`.`employee_id` ORDER BY `k`.`is_active` DESC, `k`.`id` LIMIT 1);--> statement-breakpoint
UPDATE `users` SET `employee_id` = NULL
WHERE `employee_id` IS NOT NULL
  AND `id` <> (SELECT `k`.`id` FROM `users` AS `k` WHERE `k`.`employee_id` = `users`.`employee_id` ORDER BY `k`.`is_active` DESC, `k`.`id` LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_employee` ON `users` (`employee_id`);
