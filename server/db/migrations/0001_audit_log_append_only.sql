-- The Audit Log is append-only: no application path (or stray SQL) may change or remove an entry.
CREATE TRIGGER `audit_log_no_update`
BEFORE UPDATE OF `occurred_at`, `actor`, `action`, `entity_type`, `entity_id`, `details` ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete`
BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
