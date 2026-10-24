---
description: Break-glass account recovery from the server shell when nobody can sign in — list accounts, unlock, or issue a one-time password
scope: root
covers: [account-recovery, locked-out, lockout, unlock, reset-password, admin-cli, super-admin, break-glass, password, server-cli, audit]
---

# Recover a locked-out account

Use this only when nobody can do it on the Users screen (every Super Admin is locked out, or the only one forgot their password). The full rules are in [RUNBOOK.md section 6](../RUNBOOK.md#6-locked-out-account-recovery).

1. Get a shell on the server. This command line is the only way to change accounts without signing in.
2. List the accounts and their state: `docker compose exec assets node server/admin.ts list`.
   - If the app is down, use `docker compose run --rm assets node server/admin.ts …` instead of `exec`.
   - On the production VPS, use `sudo docker compose -f /etc/bphs-connect/compose.yml` instead of `docker compose`.
   - On a development checkout, run `bun run admin list` (and the same for the other commands).
3. Choose the fix:
   - A lock only (5 wrong passwords lock an account for 15 minutes, and the lock clears by itself): run `… node server/admin.ts unlock <email>`.
   - A forgotten password: run `… node server/admin.ts reset-password <email>`. It prints a one-time password, signs the account out everywhere, clears the lock, and forces a password change at the next sign-in.
4. Give the one-time password to the person over a channel you trust.
5. A deactivated account stays deactivated: a Super Admin must reactivate it on the Users screen.
6. Check that the person can sign in. The Audit log shows the change with the actor `server-cli`.
7. Afterwards, make sure there are at least two active Super Admins, so one lost password is never an outage again.
