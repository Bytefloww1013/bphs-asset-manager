# Security review and VPS production readiness

Review date: **2026-10-14**. Reviewed revision: **`a667db93edb9cf5257b292a51910c91bc1c3c10c`**. Application: BPHS-Connect and the Employee Grievance Tracker.

## 1. Release recommendation

**Do not expose the repository's current Compose deployment directly to the internet.** It was built for an office network and still has that deployment model's defaults. There are useful security controls, but public deployment needs changes to transport security, authentication, resource limits, protection of grievance data, and recovery procedures.

The most significant implementation defect confirmed in this review is a **race between password verification/change and an administrative password reset**. A password change already in progress can overwrite the administrator's reset. Other confirmed concerns include uploads being buffered before authentication, permissive local database/backup file modes, and the ability of every account to read every grievance and download its files.

The grievance access model is explicitly documented as an intentional product decision in `implementation.md`, decision G1. It is not an accidental missing owner check. It nevertheless needs approval again for a public deployment containing actual personnel records. The “Confidential” label in the browser does not impose an access restriction.

Prefer a VPN or an identity-aware access gateway with MFA for this staff-only application. If access must be available from arbitrary internet connections, complete the relevant application and infrastructure controls below before release. Caddy and a purchased certificate address transport security; they do not fix authentication, authorization, unsafe files, or operational recovery.

This document is a report and proposed work plan. **No application, dependency, deployment, configuration, or existing database changes were made for this review.** `SECURITYREVIEW.md` is the only intended repository change. All write-based review scenarios used synthetic records in `/tmp`.

## 2. Scope, method, and limits

### Repository coverage

The repository has 194 tracked files at the reviewed revision. CodeGraph was used before locating and inspecting application code. The review mapped the application across these areas:

| Area | Files and behavior reviewed |
| --- | --- |
| Application boundary | `server/index.ts`, `app.ts`, `config.ts`, `middleware.ts`, `http.ts`: startup, routing, security headers, CSRF, limits, cookies, static files, error responses, shutdown, and expired-session cleanup |
| Identity and administration | Authentication and user services, auth/people routes, password utilities, bootstrap, account-recovery CLI, shared password rules and permission matrix |
| Physical assets and assignments | Routes and services for assets, issue/return, bulk operations, employee/program holders, conditions, reference lists and dashboard |
| Employees, programs, digital assets | CRUD, archive/deactivate/delete rules, user linkage, account-seat validation, history and imports |
| Grievances | Routes/services for lists, detail, ownership, status, edits, versions, timeline entries, corrections, categories, attachments, downloads, withdrawal and exports |
| Database | SQLite client, schema, SQL migrations `0000`–`0011`, relationships, indexes, transactions and append-only triggers; migration metadata is generated supporting material |
| Browser | Authentication guards, API client, query caching, login/password-change, session renewal, logout, rich text, file handling, CSV/XLSX import/export, print case file and primary screens |
| Delivery and operations | Dockerfile, Compose, environment example, ignore files, backup script, backup/recovery tools, package manifest, Bun lockfile, Vite/Vitest/TypeScript configuration |
| Supporting material | README, runbook, product/design and implementation/planning documents; public assets, styles and generated route/build structure were considered in their supporting roles |

Dynamic tests used a temporary copy of tracked files at `/tmp/bphs-security-review`, the existing installed dependencies, and a newly seeded synthetic database. The server served a fresh production web build on temporary port 3137. Browser automation used headless Chromium through Playwright. Screenshots of the grievance page, ordinary Admin access, and the expired-session screen were visually inspected. Browser tooling and evidence were kept under `/tmp/bphs-security-browser`, outside the repository; these temporary paths are not durable report attachments.

### Verification results

| Check | Result |
| --- | --- |
| Existing automated tests | Initial run: 174 passed, 2 failed because the sandbox denied child processes with `EPERM`. All 3 CLI tests then passed outside that restriction. Every one of the 176 tests had a passing result across these runs. No tests were changed. |
| TypeScript | `bun run typecheck` passed in the temporary copy. |
| Production frontend build | `bun run build` passed in the temporary copy. |
| Locked dependency advisory audit | `bun audit --json` reported one moderate development-only esbuild advisory. `bun audit --production --json` returned `{}`. This is registry coverage at review time, not proof that dependencies contain no vulnerabilities. |
| Browser navigation | Login, overview, physical register/detail, assignments, available stock, digital assets, employees, programs, lists, import/export, asset audit, users, grievance list/new/detail/versions/entry/case file/categories/audit, edit and add-entry screens were exercised. No uncaught page errors were recorded in the successful scenarios. |
| Unauthenticated API reads | Assets, assignments, employees, programs, digital assets, grievances, grievance audit, users and audit CSV returned `401`. |
| Role enforcement | Ordinary Admin received `403` for user management and changing another owner's grievance status. The Edit button was disabled for that grievance. |
| Forced password change | The seeded temporary-password account was sent to `/password-change`; reading employee data returned `403`. |
| Session cookie | Default deployment produced `HttpOnly; SameSite=Lax` without `Secure`. A separate run with `COOKIE_SECURE=true` produced all three attributes. Token values are intentionally omitted. |
| CSRF/CORS | Cross-site multipart was rejected with `403`. A foreign-origin JSON preflight had no `Access-Control-Allow-Origin`. Sending JSON directly from a non-browser client is not evidence of a browser CSRF bypass. |
| Stored rich text | A synthetic body containing a script, event handler and `javascript:` link was stored as `<p>Safe review text</p>bad link`. No script executed when viewed. |
| File delivery | An ordinary Admin could download another owner's grievance file; response used attachment disposition and `nosniff`. A fabricated DOCX was also accepted, as detailed in SR-10. |
| Reset concurrency | Direct service-level tests confirmed old-password login can finish after the stored hash changes, and an overlapping password change can overwrite a reset. See SR-02. |
| Unauthenticated streaming upload | A controlled request without a session had all 3 MiB of its supplied stream consumed before receiving `401`. No large-scale denial-of-service test was run. |
| Backup | A synthetic online backup passed `integrity_check`, used DELETE journal mode, and included sessions and attachment data. Under umask `022`, both database and backup had mode `0644`. |
| Static-file probes | `/.env`, `/.git/config`, `/server/config.ts`, `/data/bphs.sqlite`, and a traversal-shaped path returned the SPA HTML shell, not the requested file contents. Missing `/static/` JavaScript returned `404`. A shell response with status `200` is not a confirmed secret-file disclosure. |
| Secret checks | No tracked `.env`, private-key or data history was found by the sensitive-filename history check. Targeted current-tree patterns found no private key blocks, AWS access-key IDs or GitHub tokens. Demo/test passwords are present intentionally. A full-history entropy/secret scanner was not run. |

### Limits on the conclusion

The destination VPS, DNS, purchased certificate, cloud firewall, SSH configuration, host permissions, external backup destination, monitoring and production user population were not available for inspection. No production TLS termination or actual Caddy installation was tested. No container image/OS vulnerability scan or live internet penetration test was performed. Browser work used Chromium, not a full cross-browser compatibility campaign. The browser checks covered security paths and representative screens, not every possible UI interaction. Existing API tests cover additional business-rule and permission cases.

Infrastructure items below are requirements to verify, not claims that an uninspected VPS is already misconfigured. No confirmed unauthenticated database read, SQL injection, stored script execution, or arbitrary server command execution was found in the reviewed paths. This is a bounded review, not a guarantee that none exists.

## 3. Controls worth preserving

- Passwords have per-password cryptographic salts, scrypt hashes and timing-safe comparisons. Session cookies contain random 32-byte tokens; SQLite stores their SHA-256 hashes.
- Session authentication reloads the user on each request and rejects inactive accounts. Password resets and deactivation normally delete sessions. Required password changes are enforced by the API, not just the UI.
- Sensitive operations have server-side permission checks. Grievance ownership is checked in services for edits, status and owner changes. File IDs are scoped to their grievance before download.
- Zod validates writes; reviewed Drizzle and SQL queries bind user-controlled values. The observed `sql.raw` uses supply internal SQL words/aliases, not request input.
- Rich-text writes are sanitized server-side against a small allowlist. React escapes ordinary text. The CSP restricts scripts to the application and blocks objects and framing. The `blob:` permission is scoped to workers used by Excel tooling, not scripts generally.
- API responses have `Cache-Control: no-store`. Attachments use download disposition and `nosniff`; files are not mounted into the public web tree. Static production source maps are disabled.
- CSV output neutralizes several leading formula characters; workbook output explicitly writes strings as text cells. Imports are validated again on the server and do not execute or parse workbooks there.
- Database constraints protect assignment relationships and uniqueness. Append-only triggers cover audit records, grievance entries, versions and file bytes, including replacement-insert protections.
- The Docker runtime uses `USER node`, separates build/runtime stages, installs production dependencies for runtime, rotates application logs and has a health check. Backup uses SQLite's online backup API rather than copying an active WAL database.
- Notifications (added Oct 19 2026, after this review): every `/api/me/*` query is scoped to the caller's own user ID, so another account's notification or notice answers 404. A notification's link must be an in-app path, checked when it is written and again before the page follows it; titles name the thing, never sensitive details. Grievances and Administrative Reviews never notify. Only Super Admins can send notices (API-enforced), and each notice is written to the audit log.

Do not remove these protections while implementing the slices. In particular, keep `worker-src 'self' blob:` when adjusting CSP and preserve the cross-site multipart protections when adding a reverse proxy.

## 4. Prioritized issue register

“High” means a material confidentiality, integrity or availability risk under the stated conditions. “Medium” means a significant hardening/control gap or a narrower attack. Priority expresses when to address it; a documented policy decision can resolve a design issue, but does not make its consequences disappear.

| ID | Severity | Finding | Release priority |
| --- | --- | --- | --- |
| SR-01 | High | Public HTTP port and insecure-cookie defaults; no production TLS boundary | Before exposure |
| SR-02 | High | In-flight password operations can defeat a reset | Before exposure |
| SR-03 | High | No source/global authentication throttling; account lockout can be abused | Before exposure |
| SR-04 | High | Upload buffering before authentication and missing cumulative resource budgets | Before exposure |
| SR-05 | High, policy dependent | Every account can read/export all grievances and files | Before real grievance data |
| SR-06 | High | Password-only access and no step-up verification for privileged actions | Before unrestricted public access |
| SR-07 | Medium | Short minimum password and below-baseline scrypt work factor | Before password enrollment |
| SR-08 | High with local/storage access | Sensitive database and internal backups have permissive file modes | Before importing production data |
| SR-09 | High, operational | Off-host recovery is not deployed; restore can resurrect sessions | Before production reliance |
| SR-10 | Medium | Attachment signatures are superficial; no malware quarantine | Before real uploads |
| SR-11 | Medium | Sliding sessions lack absolute expiry; temporary credentials do not expire | Before public access |
| SR-12 | Medium | Raw query logging and incomplete security telemetry | Before production logging |
| SR-13 | Medium | Container isolation/resource limits and VPS controls need hardening | Before exposure |
| SR-14 | Medium | Development advisory and incomplete release/supply-chain checks | Before release, then recurring |
| SR-15 | Medium | Browser-reported exports are not a complete exfiltration audit | Before relying on audit claims |
| SR-16 | Medium | Indefinite sensitive-data retention and unencrypted copies need a policy | Before real grievance data |
| SR-17 | Medium | Expired-session dialog leaves sensitive content readable; logout can fail silently | Before shared-device use |
| SR-18 | Medium | Bootstrap/demo-data and secret-handling assumptions need deployment safeguards | Before first public start |

Each issue below is broken into slices small enough to implement and verify separately. All boxes are intentionally unchecked: tests showing a problem exists do not constitute remediation. Record the implementing change and verification evidence when closing a slice.

### SR-01 — Establish an HTTPS-only production boundary

**Evidence:** `docker-compose.yml:15` publishes `8080:3000` without a loopback bind; line 20 sets `COOKIE_SECURE: 'false'`. `server/index.ts:16` listens on all IPv4 interfaces. `server/config.ts:22` defaults cookie security to false even in production, and its boolean parser silently treats misspellings as false. `server/app.ts:66` disables HSTS. The browser confirmed the resulting cookie lacks `Secure`.

**Impact:** Direct public HTTP permits credential and session interception. Adding HTTPS while leaving port 8080 public leaves a bypass around the proxy and its controls. A non-Secure cookie can also be sent on HTTP requests to its host. `HttpOnly` does not address network interception.

**Fix:** Use the Caddy design in section 5. Publish the app only to host loopback, or expose it only on a private Docker network used by Caddy. Enable Secure cookies explicitly. Introduce a production configuration profile that rejects insecure/malformed values instead of depending on a comment in Compose. Use separate deliberate development settings.

- [ ] **SR-01.1 — Isolate the upstream.** Replace the public port mapping with `127.0.0.1:8080:3000` for host Caddy, or remove host publication for container Caddy. Inspect the rendered Compose configuration and externally test IPv4 and IPv6. Done when only the intended HTTPS/redirect endpoints are reachable.
- [ ] **SR-01.2 — Make production configuration fail closed.** Reject production startup with a false/unset Secure-cookie setting or an invalid boolean; add a validated canonical public-origin setting. Done when a typo such as `COOKIE_SECURE=treu` prevents startup and correct configuration emits `Secure` cookies.
- [ ] **SR-01.3 — Install and validate Caddy and the certificate.** Implement the section 5 topology, certificate permissions, redirect and size limits. Done when browser login, multipart uploads, downloads, import/export and deep links work through HTTPS.
- [ ] **SR-01.4 — Add HSTS after HTTPS is stable.** Begin with a short max-age, then raise it after validation. Add `includeSubDomains` or preload only after reviewing every affected hostname. Done when HTTPS has one intended HSTS policy and no public plaintext application endpoint exists.

### SR-02 — Make password changes, resets and login atomic with credential state

**Evidence:** `server/services/auth.ts:94` reads a password hash, awaits verification, then at lines 147–155 reloads account state without checking that the hash is still the one verified. `changePassword`, lines 160–181, verifies the old hash and later writes a new hash without a conditional update against the previously verified credential state. Administrative resets in `server/services/users.ts:122` and `server/admin.ts:61` change the hash and remove sessions.

**Confirmed reproductions, using an in-memory synthetic database:**

1. Start `login` with the existing password. Change the stored hash and set `mustChangePassword=true` while hashing is pending. The original login still succeeds and creates a session. That session is initially restricted by the forced-change flag, which limits the impact of this login variant.
2. Start `changePassword` with the existing password. While verification is pending, replace the stored hash, require a change, and delete the user's sessions, as a reset does. The stale change still succeeds, overwrites the replacement hash and sets `mustChangePassword=false`.

**Impact:** Resetting credentials is not a reliable containment boundary for a compromised account while requests are in flight. The second variant requires the prior password and a valid session when the request starts; it is not an unauthenticated password-reset endpoint.

**Fix:** Add a monotonically increasing credential/security version to users. Capture it before hashing. In a short transaction after hashing, re-read active status, version, current hash and required session state. Insert a session or change a password only if the verified version remains current. Increment the version on reset and password change; check it when authenticating sessions. A conditional update against the old hash can provide part of this protection, but consistently versioning credentials and sessions is easier to apply to all revocation paths. Do not keep a SQLite transaction open while awaiting scrypt.

- [ ] **SR-02.1 — Add deterministic regression tests.** Pause password derivation with a controllable test seam, reset/revoke, then release it. Done when tests express both confirmed interleavings and fail on the current implementation.
- [ ] **SR-02.2 — Version login credentials.** Add the migration and enforce unchanged credential state before session creation. Done when an old-password verification cannot create a session after reset or password change.
- [ ] **SR-02.3 — Protect password writes and privileged async work.** Use conditional/versioned password updates, and revalidate session/account authorization before committing sensitive operations that awaited work. Done when a pending change cannot overwrite a reset or act after relevant revocation.
- [ ] **SR-02.4 — Verify the complete containment path.** Test UI reset, CLI reset, deactivation, simultaneous changes and existing sessions. Done when reset invalidates existing and in-flight use without breaking normal password changes.

### SR-03 — Add layered authentication throttling

**Evidence:** `server/services/auth.ts:94` hashes unknown-account attempts using `verifyDecoy`; a real account locks after five failures for 15 minutes. Neither the routes nor the deployment define per-source/global request limits or a bound on queued password work. Twelve parallel requests for different nonexistent accounts all returned `401`, without `429` or `Retry-After`. The lockout tests verify that correct credentials are also refused during a lock.

**Impact:** Attackers can use arbitrary email addresses to consume scrypt CPU/memory and worker capacity. With a known email they can repeatedly lock out staff. A known account eventually returning `423`, while an unknown one remains `401`, also permits account discovery. The decoy check helps ordinary timing differences but does not hide this response difference.

**Fix:** Add limits before password hashing: source IP/subnet, normalized account identifier, and a small global concurrent-hash budget. Bound the waiting queue and return a controlled `429`/`Retry-After`. Choose rates from actual staff traffic and load measurements, accounting for office NAT. Use progressive delay and detection rather than relying solely on account-wide denial. Keep a protected recovery route for administrators.

- [ ] **SR-03.1 — Bound expensive work.** Add a global semaphore and bounded queue around login/password verification, with reasonable per-endpoint limits. Done when a small controlled burst cannot grow an unlimited hashing queue.
- [ ] **SR-03.2 — Add trusted-source and account limits.** Obtain the socket peer/explicitly trusted proxy address; never trust an arbitrary client `X-Forwarded-For`. Done when changing that header cannot escape the source bucket, and many unknown emails still hit a source/global limit.
- [ ] **SR-03.3 — Review lockout and account-discovery behavior.** Reduce account-specific response differences where practical, preserve clear staff recovery, and alert on targeted locking. Done when the response/recovery policy is documented and protected administrators can recover during an attack.
- [ ] **SR-03.4 — Measure on the target VPS.** Run bounded staging tests for normal NAT traffic, unknown-account bursts, password changes and recovery. Done when rate limits, latency, memory and alert thresholds have recorded evidence.

### SR-04 — Authenticate before large bodies and enforce resource budgets

**Evidence:** `server/app.ts:74` installs body limits before protected-route authentication at line 86. Multipart grievance paths permit **101 MiB**. The installed Hono body-limit middleware reads and retains streams without a trusted Content-Length before calling the next handler. A synthetic no-session stream had 3 MiB consumed before its eventual `401`. `readUploads` additionally copies file bytes into buffers; SQLite stores them as BLOBs. There are per-file/request limits, but no cumulative per-user/case/installation quota or concurrent-upload limit. Several lists return all records; timeline and version endpoints return full bodies without server pagination.

**Impact:** Unauthenticated clients can occupy buffering memory and connections; authenticated or compromised accounts can repeatedly add immutable data and exhaust disk. A 101 MiB request can occupy more than 101 MiB through parsing/copies. Growing SQLite databases, full-result reads and full backups amplify the cost. This was not stress-tested to an actual outage.

**Fix:** Retain cheap header/declared-size checks at the boundary, but authenticate protected uploads before consuming their bodies. Apply streaming limits during parsing, concurrency limits and timeouts. Add transactional aggregate quotas and disk-reserve checks; enforce them server-side. Consider separate attachment storage and streaming downloads as volume grows, while preserving atomic records, authorization and backup consistency. Bound list/search/history work with pagination and deliberate export paths.

- [ ] **SR-04.1 — Reject unauthenticated uploads early.** Reorder protected-route middleware without weakening auth-route size limits or CSRF. Done when no-session streaming requests are rejected without accumulating their supplied file bodies.
- [ ] **SR-04.2 — Bound concurrent and cumulative uploads.** Define per-user/per-case/total storage and request-rate budgets; reserve quota transactionally before persistence. Done when concurrent requests cannot exceed limits by racing and disk-reserve thresholds refuse new writes safely.
- [ ] **SR-04.3 — Reduce memory and query amplification.** Bound multipart parsing, file copies and download concurrency; paginate large lists, entries and versions; constrain heavy exports/searches. Done when representative large datasets stay within a measured memory/time budget.
- [ ] **SR-04.4 — Verify limits under realistic pressure.** Add staging cases for chunked/no-length requests, slow uploads, several 10 MiB files, concurrent downloads and low disk. Done when rejection is controlled and health/recovery remain available. Do not perform outage-scale tests against production.

### SR-05 — Approve or narrow the grievance confidentiality boundary

**Evidence:** Authenticated grievance read routes in `server/routes/grievances.ts:40`, 59, 73, 76, 89 and 94–97 do not restrict by role/participant/owner. Ownership checks in `findToManage` govern certain changes, not viewing. `shared/permissions.ts` provides only Admin and Super Admin, with no grievance-read permission. The browser's ordinary Admin successfully read a different owner's grievance and downloaded its attachment. Both roles can also add entries/files to any unsealed grievance. These behaviors match the documented G1 decision.

**Impact:** Compromising any asset-management account exposes the complete grievance collection, names, allegations, earlier versions and files. Someone accused or otherwise involved in a case may be able to see or add material beyond their intended duties. The broad access includes grievance audit metadata and exported copies.

**Fix:** Have the data owner decide who may see and contribute to which cases. If the intended deployment includes IT inventory staff who should not read HR cases, separate workspace permissions and introduce case access rules. Do not assume that being named in a grievance grants access. Apply rules in queries/services and every related endpoint, not just navigation. A separate deployment/database is another viable separation when teams and duties differ substantially.

- [ ] **SR-05.1 — Approve an explicit access matrix.** Identify inventory-only users, grievance readers, case contributors, owners and administrators, including conflict-of-interest handling. Done when HR/data ownership approves the matrix or explicitly signs off that every account may access every case.
- [ ] **SR-05.2 — Enforce the chosen boundary server-side.** Introduce workspace and, if required, case-level grants/deny rules for list/detail/search/counts/owners, versions, entries, files, downloads, audit and exports. Done when direct URL/API access cannot bypass the chosen policy.
- [ ] **SR-05.3 — Close indirect disclosure paths.** Review employee grievance counts/delete reasons, lookup lists, audit titles/filenames and report metadata under the new policy. Done when unauthorized users cannot infer protected case details through related screens.
- [ ] **SR-05.4 — Verify with distinct accounts.** Test inventory-only, authorized reader, owner, unrelated Admin, named participant and Super Admin through browser and API. Done when the full matrix, including downloads and previous versions, has negative tests. If broad access is retained, record that accepted risk and the restricted account roster instead.

### SR-06 — Require MFA and recent verification for high-impact actions

**Evidence:** `server/routes/auth.ts` and the auth service implement a password-only flow. The user schema has no MFA/authenticator state. Account creation, role/link changes and resets depend on the existing session without a fresh password/MFA check. A long-lived stolen Super Admin session can therefore create access or reset other accounts.

**Impact:** A phished/reused password or stolen active session has a large blast radius, especially with universal grievance access. Login lockout does not stop use of a correct stolen password.

**Fix:** Prefer an existing organizational identity provider with phishing-resistant MFA or a staff access gateway with enforced MFA. Keep the application upstream inaccessible so the gateway cannot be bypassed. If implementing MFA locally, use a mature WebAuthn/TOTP approach with enrollment confirmation, recovery codes, protected reset and audit. Require recent verification for changing credentials, managing MFA, creating/promoting users and resetting another user's password. An upstream gateway adds access control; it does not automatically make the app's own username the gateway identity.

- [ ] **SR-06.1 — Select the identity/access design.** Choose organizational SSO, MFA gateway, or local MFA; define the relationship to local accounts and protected recovery. Done when administrators have a concrete enrollment/recovery design.
- [ ] **SR-06.2 — Enforce MFA before access.** Include Super Admins, recovery accounts and alternate hostnames; remove upstream bypasses. Done when an unenrolled or single-factor session cannot access production staff data under the selected design.
- [ ] **SR-06.3 — Add recent-authentication checks.** Enforce them on high-impact account/security operations and rotate sessions after step-up. Done when an older ordinary session cannot perform those actions without verification.
- [ ] **SR-06.4 — Exercise recovery and removal.** Test lost factors, employee departure and emergency recovery, with alerts and audit. Done when recovery is usable without providing an easier public bypass.

### SR-07 — Strengthen password enrollment and stored-hash cost

**Evidence:** `shared/password.ts:8` accepts eight characters with composition requirements. `server/lib/password.ts:3` uses scrypt `N=2^15, r=8, p=1`. This is below the listed OWASP configurations; for that N/r combination OWASP lists `p=3`. No common/compromised-password blocklist is implemented. The 256-character ceiling is a useful bound and should remain sufficiently generous for passphrases.

**Impact:** Short predictable passwords are easier to guess, and a copied database allows offline attacks at a lower cost than the cited baseline. Composition rules alone do not reliably prevent common passwords.

**Fix:** Adopt a longer minimum appropriate to the selected MFA design, support password managers/paste and passphrases, and reject known compromised/common choices. For remaining password-only accounts, use at least a 15-character minimum as the target policy. Benchmark a stronger scrypt configuration such as `N=2^15,r=8,p=3` or `N=2^17,r=8,p=1`, or a maintained Argon2id implementation. Raise cost together with SR-03's concurrency limits. Store parameters and rehash on successful login when needed. These recommendations follow [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

- [ ] **SR-07.1 — Define and apply enrollment rules.** Share the same server/UI policy, add a local blocklist or a privacy-preserving breach check, and avoid logging candidate passwords. Done when weak/common examples fail and long manager-generated passwords work.
- [ ] **SR-07.2 — Benchmark and raise the KDF cost.** Measure on the target VPS with the bounded hash queue. Done when a documented stronger configuration meets acceptable latency and memory use.
- [ ] **SR-07.3 — Migrate existing hashes safely.** Rehash after a valid login using SR-02's credential-version safeguards; retain a tested legacy verification path during migration. Done when existing staff can sign in and new hashes use the selected cost.
- [ ] **SR-07.4 — Review normalization and recovery compatibility.** Keep enrollment and verification normalization consistent, and test unicode/passphrases, temporary credentials and CLI recovery. Done when policy changes do not silently lock out legitimate users.

### SR-08 — Enforce private database and backup permissions

**Evidence:** `server/db/client.ts:17` creates directories without an explicit mode; SQLite file creation inherits process permissions. `server/backup.ts:28` creates backup directories and the backup without setting private modes. Docker creates `/data` and changes its owner at `Dockerfile:32`, but does not set a private directory mode or umask. Under umask `022`, review files were `0755` for the data directory and `0644` for both live database and backup. The existing checkout's database/WAL/SHM also had mode `0644` when listed.

`scripts/backup-offbox.sh:9` correctly uses `umask 077` for the **host-side** copy. That shell's umask does not automatically become the umask of `docker exec ... node server/backup.ts` inside a running container. Runbook statements implying all copies are already mode 600 are therefore too broad.

**Impact:** Where directory traversal permits it, another local/container process can read password hashes, personnel data, grievance bodies and attachment BLOBs. Effective host access also depends on parent directories and volume permissions. This is not evidence that the SQLite file is downloadable over HTTP.

**Fix:** Establish umask `077` before database creation, explicitly create data/backup directories with mode `0700` and keep database, WAL, SHM and backups private. Repair permissions of existing files during a controlled maintenance step. Coordinate any backup-reader group explicitly; do not make the entire volume readable just to simplify copying.

- [ ] **SR-08.1 — Set secure creation defaults.** Apply a process/container umask and explicit directory modes before migrations or backups. Done when a fresh deployment creates private files without relying on the operator's login umask.
- [ ] **SR-08.2 — Repair existing storage.** Inventory database sidecars, internal/host/off-host backups, pre-restore folders and operator exports; apply approved owner/group/modes. Done when unrelated test accounts cannot traverse/read the sensitive storage.
- [ ] **SR-08.3 — Add permission verification.** Check first boot, writes that create WAL/SHM, backup, restore and restart. Done when these paths preserve the intended modes and backup jobs still work.
- [ ] **SR-08.4 — Correct operations documentation.** Distinguish host and container permissions and document the repair procedure. Done when the runbook matches measured behavior.

### SR-09 — Deploy recoverable, independent backups and revoke restored sessions

**Evidence:** Compose provides a local named volume. `server/backup.ts` creates local copies; `scripts/backup-offbox.sh` copies from container to host. Despite its name, that script by itself does not copy off the VPS. The runbook correctly leaves external transfer and cron setup to the operator. Review backup integrity passed and the copy contained session rows and attachment data. The restore procedure does not clear restored sessions.

The backup shell also exits immediately if its initial `docker exec` fails, before `prune` runs. An interrupted stream at line 39 can leave a `.partial` file. Its comment that housekeeping runs after a failed backup is not true for every failure path.

**Impact:** A VPS failure/compromise may destroy both live data and all host copies. Full copies include all historical attachment bytes and can exhaust disk. Restoring an older backup restores old password hashes, active flags and sessions, potentially reviving access previously revoked. Integrity checks alone do not prove a backup can satisfy the business's recovery needs.

**Fix:** Define recovery-point and recovery-time targets, schedule checked backups, encrypt and transfer them to an independently controlled destination, and monitor freshness/completion. Preserve recovery keys separately. Build a restore workflow that invalidates all restored sessions before exposure and reconciles account/security changes since the backup. Keep full-copy sizing in capacity planning; file withdrawal currently saves no bytes.

- [ ] **SR-09.1 — Make backup execution reliable.** Add a scheduled job, non-overlap control, failure cleanup and alerts; make pruning behavior explicit. Done when deliberately failed backup/transfer paths alert and leave no apparently complete invalid copy.
- [ ] **SR-09.2 — Keep independent encrypted copies.** Choose off-VPS storage, separate credentials/keys and retention, preferably versioning/immutability appropriate to the threat model. Done when a VPS-only compromise cannot erase every recovery copy or obtain every decryption key.
- [ ] **SR-09.3 — Make restore a security event.** Restore privately, invalidate all sessions, reconcile deactivations/resets/roles and rotate affected credentials where needed before reopening. Done when a cookie valid only in the restored backup cannot authenticate afterward.
- [ ] **SR-09.4 — Run a full recovery drill.** Restore database and files to an isolated instance, verify integrity, accounts, roles, records, attachments, audit and migrations, and measure elapsed time/data loss. Done when the recovery targets and quarterly drill owner are recorded.

### SR-10 — Quarantine and inspect uploaded files

**Evidence:** `server/services/grievance-attachments.ts:21` checks file headers. Its Office check at line 27 only requires a ZIP prefix and the strings `[Content_Types].xml` and `word/` or `xl/` anywhere in the byte sequence. The browser/API review submitted a file containing only those markers and ordinary trailing text as a DOCX; it returned `201`. It was not a valid ZIP/Office document. PDFs/images are similarly recognized by leading markers, and text/email checks are deliberately light. No malware scanner or quarantine is present, as the runbook acknowledges.

**Impact:** A valid-looking extension/signature does not make a document safe to open. Malicious PDFs, Office documents, emails or archive tricks can reach staff endpoints. Current download disposition and CSP help protect this application's origin but do not disinfect downloaded content. No server execution or browser-origin XSS was demonstrated from this file path.

**Fix:** Keep the extension/type/size allowlist, but validate container structure with bounded parsing and reject malformed files. Add isolated malware scanning with quarantine and fail-closed download eligibility. Limit archive expansion/entries and external-content features where applicable. Never submit confidential grievance files to a public scanning service without explicit data-owner approval. Consider reducing accepted types if the business does not need them. See [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

- [ ] **SR-10.1 — Strengthen bounded format validation.** Validate Office package structure rather than searching for marker strings; set parser/ZIP limits. Done when the fabricated DOCX is rejected and legitimate examples remain accepted.
- [ ] **SR-10.2 — Add quarantine state.** Store a file as pending and keep it unavailable to downloads/exports until a successful decision. Done when scanner failure, timeout or restart leaves the file unavailable rather than implicitly clean.
- [ ] **SR-10.3 — Integrate isolated scanning.** Run a maintained scanner with bounded resources and a controlled signature-update process. Record verdict/time/signature version without leaking case content. Done when an approved harmless test signature is quarantined and clean fixtures are released.
- [ ] **SR-10.4 — Verify the entire delivery path.** Keep ownership/access checks, attachment disposition, safe filename encoding and `nosniff`; test malformed/mismatched names and withdrawn/infected files. Done when all related endpoints honor quarantine and authorization.

### SR-11 — Bound session lifetime and temporary-credential use

**Evidence:** `findSession` in `server/services/auth.ts:56` slides expiry forward after five minutes of activity. Although sessions have `createdAt`, it is not used as an absolute expiry. `SESSION_IDLE_HOURS` defaults to 12 and accepts values up to 8760. Expired rows are purged on startup and every six hours (`server/index.ts:33`), so cleanup does exist; the missing control is an absolute lifetime and active-session management. Temporary passwords have a forced-change flag but no validity deadline or single-redemption record. Updating a user's role/link does not revoke that user's sessions, though their next request does read the current role/link.

**Impact:** An actively used stolen session can remain valid indefinitely. Long-unclaimed temporary credentials remain usable until changed/reset. Existing sessions automatically receive the effects of later role changes, including promotions. Calling the temporary password “one-time” overstates its behavior before the required change has occurred.

**Fix:** Enforce both idle and absolute expiration on the server, add deliberate reauthentication/session rotation and cap/review active sessions. Treat temporary passwords as short-lived enrollment/recovery credentials with expiry and constrained redemption. Consider a `__Host-` cookie name after HTTPS migration (Secure, path `/`, no Domain) and a one-time session invalidation during the rename. It is defense in depth; the present cookie is already host-only. Follow [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

- [ ] **SR-11.1 — Add server-enforced absolute expiry.** Choose staff-appropriate idle/absolute durations and restrict production configuration to the approved range. Done when activity cannot extend a session past its absolute deadline.
- [ ] **SR-11.2 — Add session rotation and revocation.** Rotate after credential changes/step-up, provide sign-out-all capability, and revoke/reverify sessions when privileges change. Done when old tokens fail and current roles are still enforced immediately.
- [ ] **SR-11.3 — Expire enrollment/recovery credentials.** Add issuance/expiry/redemption state and rate-limited recovery. Done when an expired credential cannot create a session and completed enrollment invalidates every outstanding temporary use.
- [ ] **SR-11.4 — Verify cookie lifecycle.** Test Secure issuance, sliding renewal, absolute expiry, logout clearing and any cookie rename through Caddy. Done when browser and server agree about validity without accepting stale cookies.

### SR-12 — Redact request logs and add actionable security telemetry

**Evidence:** `server/app.ts:46` uses Hono's default logger. The installed logger builds the logged path by slicing the full URL, retaining the query string. Grievance/audit searches use `q`, which may contain confidential names or allegations. Current request logs do not provide a structured actor, trusted client IP or request ID. Individual failed logins are not audited; the account-lock transition is. Grievance audit details intentionally omit body text but include case titles and filenames, which can themselves be sensitive.

**Impact:** Sensitive search text can be copied to container logs or external log collectors. Limited telemetry makes abuse harder to distinguish and investigate. Adding Caddy access logging without filtering would create another copy of the same query data.

**Fix:** Use structured, bounded logging with a query-free or filtered path, trusted source address, request ID, actor ID when known, outcome and timing. Never log passwords, session cookies, raw request bodies, attachment content or private keys. Protect and retain audit/access logs according to their sensitivity. Add alerting for bursts, targeted locks, privilege changes, security resets, download volume, storage pressure and backup/certificate failures.

- [ ] **SR-12.1 — Redact at every logging layer.** Replace/filter the Hono logger and configure Caddy/collectors to remove sensitive query values and credentials. Done when a unique synthetic search marker and cookie cannot be found in any collected log.
- [ ] **SR-12.2 — Add useful structured security events.** Record bounded authentication/rate-limit/authorization/security-admin outcomes with trusted attribution and correlation IDs. Done when a controlled failed/successful sequence can be investigated without reading secret content.
- [ ] **SR-12.3 — Deploy protected monitoring and alerts.** Configure retention, restricted access, remote copies where needed and named responders. Done when an end-to-end test alert reaches the responsible operator.
- [ ] **SR-12.4 — Test log abuse and privacy.** Ensure attacker-controlled strings cannot inject misleading records or create unbounded logs; document who may view grievance audit metadata. Done when logs stay useful under malformed input and ordinary burst traffic.

### SR-13 — Harden the runtime and verify the VPS perimeter

**Evidence:** The runtime is non-root, but Compose has no memory/CPU/PID budget, read-only root filesystem, capability drop or `no-new-privileges` setting. The application requires writes in `/data`, not to its source tree. The Dockerfile has a health check; its current HTTP health endpoint returns a constant success object, not a database read/write or capacity check. No VPS hardening/firewall configuration is supplied. Docker containers have no resource limits by default; verify the actual engine settings as described in [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/).

**Impact:** Application compromise or resource exhaustion has more room to affect the VPS. A green HTTP health endpoint may coexist with failed writes/full disk. Published Docker ports require special attention: ordinary host firewall expectations can differ from Docker's forwarding behavior, as covered in [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

**Fix:** Keep the non-root runtime. Trial a read-only root filesystem with the data volume and a bounded temporary filesystem; drop unnecessary capabilities and prevent privilege escalation. Set tested memory/CPU/PID/file-descriptor budgets while reserving resources for Caddy, OS and backups. Restrict SSH, cloud firewall, IPv6 and Docker management access. Keep data and local SQLite WAL on a supported local filesystem; use one deliberate writer deployment rather than assuming several application replicas can share this file safely.

- [ ] **SR-13.1 — Add container isolation.** Trial `read_only`, a bounded `/tmp`, `cap_drop: [ALL]`, `no-new-privileges` and the existing non-root user. Done when startup, migrations, uploads, native SQLite, backups and shutdown work with only intended writable locations.
- [ ] **SR-13.2 — Set measured runtime budgets.** Define memory/CPU/PID/descriptor limits and disk monitoring, allowing for scrypt, 101 MiB requests and backups. Done when controlled overload does not exhaust the whole VPS.
- [ ] **SR-13.3 — Verify host and network controls.** Use a supported patched OS, key-only restricted SSH, protected provider account/MFA, NTP, and a minimal firewall. Restrict Docker-group/socket access as privileged administration. Done when an independent external scan shows only the intended service ports over IPv4/IPv6.
- [ ] **SR-13.4 — Add readiness/capacity monitoring.** Keep public health details minimal; perform authenticated/local database and disk checks separately. Done when failed storage, application restarts and backup freshness alert even if `/api/health` still returns `200`.

### SR-14 — Resolve the development advisory and make releases auditable

**Evidence:** Audit reported esbuild `0.18.20` through `drizzle-kit -> @esbuild-kit/esm-loader -> @esbuild-kit/core-utils`. The advisory is **GHSA-67mh-4wv8-2f99**, moderate, affecting esbuild through `0.24.2`, fixed in `0.25.0`. It concerns the esbuild development server's permissive CORS, not this app's production Hono route handlers. [The maintainer's advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) describes the affected behavior.

The production audit returned no advisories, and the Dockerfile reinstalls production dependencies for runtime. The development finding should therefore not be presented as a confirmed production remote-code-execution flaw. Node/Bun base images are tag-pinned but not digest-pinned, and the application image is `latest`. No committed CI/security workflow was found. No image/OS scan was run during this review.

**Fix:** Upgrade/replace the development dependency chain so the obsolete esbuild version is removed; verify migration tooling rather than blindly overriding a transitive API. Keep development servers and inspectors away from the public interface. Add locked clean builds, dependency and image scans, secret scanning and a patch/rebuild schedule. Track release commit and image digest so a rollback is reproducible.

- [ ] **SR-14.1 — Remove the vulnerable development chain.** Update compatible Drizzle tooling or replace the obsolete loader dependency. Done when the lockfile no longer contains affected esbuild and schema-generation/migration checks pass.
- [ ] **SR-14.2 — Scan the actual production image.** Run an image/OS scanner and record an SBOM, runtime versions and reachability triage. Done when exploitable release blockers are fixed or explicitly accepted with an owner/date.
- [ ] **SR-14.3 — Add release gates.** Run tests, typecheck, production build, production/full dependency audits and current/history secret scans in a protected pipeline. Done when an introduced known bad fixture/dependency would stop release and credentials are absent from artifacts.
- [ ] **SR-14.4 — Make release and patching reproducible.** Record immutable image references, protected review/release access, signed/provenance metadata where supported and a rebuild cadence. Done when the exact deployed source/image and rollback version can be identified.

### SR-15 — Clarify and strengthen the grievance access/export audit

**Evidence:** `recordGrievanceExport` at `server/services/grievances.ts:307` records a browser POST saying an export occurred. The workbook helper logs before generating its file, and the case-file page gates printing with React state/CSS (`web/src/routes/grievances.$code.case-file.tsx:125`). But detail, entries and versions already return the complete data to authenticated clients without a read audit. A user can copy API responses or browser content without making an exports POST. Attachment downloads are audited server-side, which is stronger, although that records a server delivery attempt rather than proof a person opened the file.

**Impact:** Statements such as “no copy leaves without a log entry” are not enforceable by these client controls. Investigations may mistake an absence of export events for an absence of access/copying. Append-only triggers protect records against the app's normal write paths, not against a host administrator replacing SQLite or dropping triggers.

**Fix:** Describe browser export events as normal-workflow telemetry. Log sensitive reads/deliveries server-side if required, and use authenticated audited generation/delivery endpoints for official exports. Restrict/export-authorize before serialization under SR-05. Keep an independent protected audit sink if audit survival against VPS compromise matters. No web app can prevent a legitimately authorized viewer photographing or manually copying a visible record.

- [ ] **SR-15.1 — Define the audit guarantee.** Specify what a read, download, export request and successful delivery mean. Correct absolute no-copy claims. Done when operations/HR understand the actual coverage and limitations.
- [ ] **SR-15.2 — Add server-side sensitive access events.** Audit permitted reads/export generation/delivery with minimal metadata, rate limits and a policy for logging failures. Done when direct API access produces the expected event independently of the UI.
- [ ] **SR-15.3 — Protect official exports.** Gate generation/delivery by current permissions and record the operation in a server-controlled path; test failures without claiming a completed download. Done when skipping a browser reporting call does not bypass official-export audit.
- [ ] **SR-15.4 — Preserve independent evidence.** Export security/audit events to restricted off-host storage with failure monitoring where required. Done when a drill can reconstruct access even after the application VPS is unavailable.

### SR-16 — Define retention, encryption and handling of personnel data

**Evidence:** Grievance bodies, earlier versions, timeline entries and attachment BLOBs stay in the unencrypted SQLite file. Append-only triggers deliberately prevent deletion, and withdrawal preserves the bytes. Full backups contain all of it. The code has no expiry/purge mechanism for case data. Digital-asset fields reject labeled secrets using a heuristic (`shared/secrets.ts`), which cannot identify an unlabeled token or password. Case titles, filenames and exported workbooks/PDFs are additional sensitive copies.

**Impact:** Every retained version/file increases breach exposure and storage requirements. Withdrawing an accidental sensitive attachment does not remove it from databases/backups. A VPS snapshot or backup copy bypasses browser authentication. “Never deleted” may conflict with the organization's eventual retention/deletion obligations; those obligations were not determined in this technical review.

**Fix:** Obtain a data-owner-approved classification, retention, legal-hold and deletion policy. Use encrypted storage/snapshots and independently encrypted backups with separate key custody. At-rest encryption protects copied media/snapshots according to the key arrangement; it does not protect against a fully compromised running application/host with the keys. Design controlled retention tooling consistent with audit/legal holds rather than weakening append-only protections casually. Provide staff guidance on allowed content and exported-file handling.

- [ ] **SR-16.1 — Approve the data policy.** Identify sensitive content, authorized users, export destinations, retention periods and legal holds with the appropriate organizational advisers. Done when a named owner approves policy for live data, old versions, files, logs and backups.
- [ ] **SR-16.2 — Protect storage and keys.** Verify VPS disk/snapshot encryption, encrypt off-host backups, restrict access and test key recovery. Done when a copied backup alone cannot be read and recovery remains possible with independently held keys.
- [ ] **SR-16.3 — Design controlled retention/purge.** Add authorized, audited tooling that handles old versions, attachments and backup expiration under approved holds. Done when unwanted data can leave every applicable retention tier without quietly rewriting normal audit history.
- [ ] **SR-16.4 — Train and validate handling.** Explain that account-seat fields are not a password vault, avoid sensitive case titles/filenames where unnecessary, and protect downloaded exports. Done when real production examples and incident handling match the policy.

### SR-17 — Hide confidential browser content when sessions end and make logout reliable

**Evidence:** `web/src/router.tsx:16` intentionally preserves active query data after `401`. `web/src/features/auth/sign-in-again.tsx:91` draws a translucent overlay (`bg-ink/35`). Browser review confirmed the API returned `401` and the reauthentication alert appeared, but grievance text and people remained visibly readable behind it. This is local display exposure, not an API authentication bypass.

`signOut` in `web/src/components/shell/app-shell.tsx:167` catches logout failure and continues to the login screen. If the server did not receive logout, the HttpOnly session cookie can remain valid; the UI may misleadingly suggest a successful sign-out. There is no explicit cross-tab logout notification mechanism in the reviewed client code.

**Impact:** A person at an unattended/shared workstation can read already-loaded personnel data after expiry. A failed sign-out can leave authenticated access behind. Preserving drafts is valuable, but a translucent modal is not a privacy curtain.

**Fix:** Cover sensitive views with an opaque full-screen lock state immediately on detected expiry and according to an approved local inactivity policy. Keep drafts only in memory and reveal them only after reauthenticating the same authorized identity; clear them if switching users. Coordinate sign-out/lock across tabs. Treat failed logout as an explicit incomplete operation; provide retry and verify server revocation. The browser cannot make previously delivered data unknown to someone already able to inspect the running browser, so the aim is preventing ordinary local disclosure and misleading UI.

- [ ] **SR-17.1 — Add an opaque locked view.** Conceal case details, filenames and names while preserving permitted drafts in memory. Done when a screenshot after detected expiry contains no case content behind the prompt.
- [ ] **SR-17.2 — Make sign-out outcome truthful.** Confirm server revocation, handle network failure visibly and retry; consider a suitable `Clear-Site-Data` policy only after testing browser behavior. Done when failure cannot be mistaken for completed logout and a successful logout invalidates its cookie server-side.
- [ ] **SR-17.3 — Coordinate tabs and account changes.** Broadcast lock/logout events and clear identity-scoped queries/drafts before another user resumes. Done when signing out in one tab conceals other tabs and a different login cannot see the previous user's preserved screen.
- [ ] **SR-17.4 — Verify browser privacy paths.** Test expiry, deactivation, reset, offline logout, back/forward navigation, restored tabs and shared-device workflows. Done when sensitive content and session status follow the approved policy in each case.

### SR-18 — Secure first-run provisioning and exclude secrets/demo data

**Evidence:** `server/bootstrap.ts:38` creates a Super Admin automatically whenever the user table is empty and prints the credential to ordinary application logs. Defaults use the predictable account name `admin@bphs.local`, although the password itself is random. `server/seed.ts` includes fixed demo passwords and refuses production seeding, which is a useful guard. However, a database seeded earlier in development can still be mounted into production. Compose has no explicit operator acknowledgement that an empty volume is expected.

`.gitignore` and `.dockerignore` exclude `.env` and `.env.local`, but do not comprehensively exclude alternate secret environment files, purchased-certificate keys or credential directories. `Dockerfile:16` copies the whole allowed build context into the build stage; secrets accidentally placed there can reach a build context/cache even if absent from the final image. No real private certificate or account key was found by the limited secret checks in this review.

**Impact:** Public startup against the wrong/new volume can silently provision a fresh administrative identity, and broad log access can reveal its initial credential. Shipping a demo database creates known-password accounts. Placing purchased keys beside source can disclose them through Git/build artifacts/caches.

**Fix:** Provision privately before opening the firewall. Use a real administrator identifier, replace its temporary password immediately, and retire the credential-bearing bootstrap log according to the logging policy. Require explicit bootstrap intent and refuse unexpected empty/missing production storage. Keep all private certificate and environment material outside the checkout/build context; expand ignore/scanning policy and minimize build copies. Keep recoverable copies of legitimate keys in controlled encrypted storage.

- [ ] **SR-18.1 — Make bootstrap explicit.** Add a deliberate initialization mode/guard and distinguish a new deployment from a missing volume. Done when ordinary production startup fails safely on unexpected empty storage rather than silently creating an account.
- [ ] **SR-18.2 — Provision before public access.** Initialize with firewall restricted, set real named administrators and change bootstrap credentials; verify no demo/test users or known-password seed data remain. Done when public release uses the intended production volume and account roster.
- [ ] **SR-18.3 — Keep secrets out of source and builds.** Store certificate keys/production env outside the repo; exclude alternative secret files and credential directories from build/Git contexts, preserving safe examples. Done when a harmless secret-canary fixture is caught/excluded and image layers/build output contain none.
- [ ] **SR-18.4 — Update deployment documentation.** Replace office-only assumptions, explain bootstrap logs/volume identity and purchased-cert handling, and correct backup/audit guarantees. Done when another operator can follow the production path without reintroducing the reviewed defaults.

## 5. Implementing Caddy and a purchased TLS/SSL certificate

### 5.1 Recommended topology for this repository

For a single VPS, a straightforward arrangement is **Caddy installed as a host service, proxying to the application container published only on loopback**:

```text
Staff browser
    |
    | HTTPS, TCP 443, purchased certificate
    v
Caddy host service ---- optional staff access gateway / MFA enforcement
    |
    | HTTP to 127.0.0.1:8080, reachable only on the VPS
    v
Docker published loopback port -> assets:3000
    |
    v
Private persistent data volume: SQLite, WAL/SHM, attachment BLOBs

Scheduled backup -> encrypted independent off-VPS storage
```

The gateway's placement depends on the selected product; it must cover all application access and must not be bypassable by reaching the upstream directly. The example below describes the TLS/proxy layer only, not the complete MFA/rate-limiting implementation.

TLS terminates at Caddy. The existing Hono process can continue to serve HTTP on its private upstream connection; no certificate/private-key handling is needed inside React, Hono or SQLite. Public configuration templates can be committed to the repo. The purchased certificate's **private key must stay outside the repo, image and build context**. The paid certificate is compatible with Caddy's manual `tls <cert_file> <key_file>` configuration. Keep Caddy's secure protocol/cipher defaults unless a verified compatibility requirement warrants a change. [Caddy TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls).

If Caddy is instead containerized, place it and the app on an explicitly managed backend network and proxy to `assets:3000`. Remove the app's host `ports` entirely; publish only Caddy's required ports. `127.0.0.1` inside a Caddy container refers to that container, not the application or host. Keep certificate mounts read-only and keep Caddy's state volumes distinct from the application's `/data`. Do not mount the Docker socket into Caddy merely to discover this one service.

### 5.2 Proposed repository/deployment work

The following is illustrative future configuration; it was **not applied** during this review:

```yaml
# Relevant changes to the existing assets service, for HOST-installed Caddy.
# Replace the existing ports/environment values; do not append a second port mapping.
services:
  assets:
    ports:
      - '127.0.0.1:8080:3000'
    environment:
      COOKIE_SECURE: 'true'
      SESSION_IDLE_HOURS: '1' # supported interim setting; approve the final policy in SR-11
      BOOTSTRAP_ADMIN_EMAIL: actual.named.admin@example.com
      BOOTSTRAP_ADMIN_NAME: Actual Administrator
```

Retain the intended persistent volume, restart/logging configuration and image/build settings. Before using Compose overrides, inspect `docker compose config`: merged port lists can leave the original public mapping in place. Verify the volume identity as well; a different Compose project name can create a new empty volume. Do not change project names or volume bindings casually during migration.

Candidate future repository files are `deploy/Caddyfile.example`, a clearly named production Compose configuration, and revised production instructions in `RUNBOOK.md`/`README.md`. Production values, the actual Caddyfile and certificate paths can be installed under `/etc/caddy` by deployment tooling. This report does not create those files.

### 5.3 Purchased-certificate preparation

Use the actual selected hostname in place of `assets.example.com` throughout these examples.

1. Point the DNS A record to the VPS. Publish an AAAA record only if IPv6 routing and firewall rules are ready too. Remove stale records that send some users elsewhere.
2. Generate the private key and CSR on a trusted machine/VPS under restrictive permissions. Submit the CSR, not the private key, to the certificate provider. Confirm the issued certificate's SAN covers the exact application hostname and any deliberately supported alternatives.
3. Obtain the leaf certificate and required intermediate certificates in PEM format. Construct `fullchain.pem` with the leaf first, then the intermediate chain. Normally do not append the public root certificate. If the provider delivers PKCS#12/PFX, convert it privately and do not leave an unprotected export or password in shell history.
4. Install the matching unencrypted PEM private key where the Caddy service can read it unattended. A suitable host arrangement is a `root:caddy` certificate directory with mode `0750`, and `root:caddy` files with mode `0640`; verify all parent directories permit only the intended access. Keep the application container/user out of that group. Equivalent secret-manager arrangements are acceptable.
5. Use versioned certificate directories with an atomic `current` symlink/directory switch to replace the **pair** consistently. Protect and briefly retain the prior pair for rollback; manage its eventual disposal and encrypted recovery copy under the key policy.

Suggested installed layout:

```text
/etc/caddy/Caddyfile
/etc/caddy/certs/assets/current/fullchain.pem
/etc/caddy/certs/assets/current/privkey.pem
```

Review the key/certificate match before activation without printing the private key:

```bash
openssl x509 -in /etc/caddy/certs/assets/current/fullchain.pem \
  -noout -subject -issuer -dates -ext subjectAltName

# These two public-key digests must match.
openssl pkey -in /etc/caddy/certs/assets/current/privkey.pem -pubout | openssl sha256
openssl x509 -in /etc/caddy/certs/assets/current/fullchain.pem -pubkey -noout | openssl sha256
```

### 5.4 Example Caddyfile

**Template requiring staging validation with the exact installed Caddy version and actual certificate.** Caddy was not installed/run during this review. The limits mirror current app limits; reduce them only alongside intentional changes to application upload behavior. Numbers are bytes: 16 KiB for auth, 101 MiB for the three multipart upload shapes, 4 MiB otherwise. Caddy documents body limiting in [the `request_body` directive](https://caddyserver.com/docs/caddyfile/directives/request_body).

```caddyfile
{
    # Keep the administrative API private; reload uses it.
    admin 127.0.0.1:2019

    servers {
        timeouts {
            read_header 10s
            read_body 120s
            idle 120s
        }
    }
}

http://assets.example.com {
    # Fixed destination avoids redirecting to a client-supplied hostname.
    redir https://assets.example.com{uri} 308
}

https://assets.example.com {
    tls /etc/caddy/certs/assets/current/fullchain.pem /etc/caddy/certs/assets/current/privkey.pem

    # Start short; raise only after validating reliable HTTPS and renewal.
    header Strict-Transport-Security "max-age=86400"

    log {
        output file /var/log/caddy/assets-access.json {
            mode 0600
            roll_size 10MiB
            roll_keep 10
            roll_keep_for 168h
        }
        format filter {
            wrap json
            fields {
                request>uri query {
                    delete q
                    delete redirect
                }
                request>headers>Cookie delete
                request>headers>Authorization delete
                resp_headers>Set-Cookie delete
            }
        }
    }

    route {
        @auth path /api/auth/*
        handle @auth {
            request_body {
                max_size 16384
            }
            reverse_proxy 127.0.0.1:8080
        }

        @grievance_upload {
            method POST
            header Content-Type multipart/form-data*
            path_regexp grievance_upload ^/api/grievances(/[^/]+/(entries|attachments))?$
        }
        handle @grievance_upload {
            request_body {
                max_size 105906176
            }
            reverse_proxy 127.0.0.1:8080
        }

        handle {
            request_body {
                max_size 4194304
            }
            reverse_proxy 127.0.0.1:8080
        }
    }
}
```

Pre-create the log directory with ownership/writability suitable for the Caddy service and restricted reader permissions. The example filters sensitive query values and credentials while retaining routing/outcome data. Confirm the actual output rather than assuming every collector preserves those filters. Caddy's file rotation and filter syntax are described in [its logging documentation](https://caddyserver.com/docs/caddyfile/directives/log). The example's initial timeout values need measurement with staff upload speeds and actual file sizes; do not tighten them so far that valid requests fail. [Caddy server options](https://caddyserver.com/docs/caddyfile/options).

This template does not supply source/account/global throttling or MFA. There is no `rate_limit` directive configured here. Choose an application limiter or an explicitly reviewed gateway/Caddy module, manage its release provenance, and test it under SR-03/SR-06. TLS configuration alone does not resolve those findings.

Keep the Hono upstream responsible for serving the SPA and API together. Do not point a generic Caddy `file_server` at the repository, data directory or container root. Do not strip the `/api` prefix with `handle_path`. Preserve the application's CSP, no-store headers, attachment headers and other security headers. Caddy normally preserves the original Host for this HTTP upstream and supplies forwarding headers; only trust additional proxy hops that are explicitly configured. [Caddy reverse proxy behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

### 5.5 CSRF and the canonical public origin

`RUNBOOK.md` section 8 currently says the app does not read Host or forwarded headers. That is incomplete: Hono's CSRF middleware compares `Origin` with the request URL's origin, and the Node adapter constructs that URL using Host and its connection scheme. The plain HTTP upstream sees an HTTP scheme even when the browser used HTTPS. Current browsers normally send `Sec-Fetch-Site: same-origin`, which Hono also accepts, so normal proxied uploads can work. A client without that metadata may fail the default origin comparison.

As part of SR-01, introduce a **validated, explicitly configured public origin** and use it in CSRF validation for form-compatible requests, preserving rejection of foreign/null origins as appropriate. A `PUBLIC_ORIGIN` environment variable is a proposed implementation setting, **not a setting currently supported by this code**. Merely adding it to Compose today would not change CSRF behavior. Test multipart requests through Caddy with and without Fetch Metadata; do not solve a legitimate upload failure by disabling CSRF or accepting arbitrary forwarded headers. Hono documents the origin/metadata behavior in [its CSRF middleware reference](https://hono.dev/docs/middleware/builtin/csrf).

### 5.6 Service installation, validation and renewal

Install a maintained Caddy build using the official instructions for the selected VPS OS, and run it under its dedicated service account with automatic startup. Keep administration on loopback and restrict local shell access: users able to control Caddy's admin API can change its routing/configuration. Give Caddy only its intended network listeners, certificate access and state/log directories. [Official Caddy installation instructions](https://caddyserver.com/docs/install).

Validate the file and certificate access as the same service identity used in production:

```bash
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --force
```

Use the service's normal control path if its packaging requires different privileges or admin address. Force reload is relevant when certificate files change but the Caddyfile text does not; Caddy documents that it can reprovision manually loaded certificates. Keep the admin endpoint enabled and private for this workflow. [Caddy reload documentation](https://caddyserver.com/docs/command-line).

**A certificate manually loaded from files is not automatically renewed just because Caddy is running.** Assign an owner for the purchased certificate's CA renewal, validation/issuance, pair installation and forced reload. If the provider offers a compatible automated issuance interface, implement and test that separately. Caddy's automatic certificate management skips manually loaded certificates under its normal behavior; do not assume a failed paid-certificate renewal silently turns into managed public issuance. [Caddy automatic HTTPS documentation](https://caddyserver.com/docs/automatic-https).

For every renewal: validate hostname/chain/dates and matching key; install the pair atomically; validate as the service user; reload; verify the certificate actually presented externally; keep a restricted rollback pair until success is confirmed. Monitor externally observed expiry with advance warnings, for example 30/14/7 days, and alert if renewal automation stops. A local replacement file's dates do not prove the public listener loaded it.

### 5.7 Caddy/certificate acceptance slices

- [ ] **TLS-1 — Prepare DNS and firewall.** Confirm A/AAAA point to the intended host; expose TCP 443 and TCP 80 for redirect, plus restricted SSH. UDP 443 is optional if deliberately enabling HTTP/3. Keep 3000/8080/5173/2019 and inspector/management ports inaccessible externally. Record an external IPv4/IPv6 check.
- [ ] **TLS-2 — Install the purchased pair securely.** Verify SAN, key match, full chain, permissions, service readability and exclusion from source/build contexts. Record issuer, expiry and renewal owner without including private material.
- [ ] **TLS-3 — Validate the proxy configuration.** Render Compose and validate Caddy as its service identity. Test HTTP redirect, exact-host routing, deep-link reloads and rejection/non-service of unexpected hosts. Confirm no repository/data file serving.
- [ ] **TLS-4 — Exercise authenticated HTTPS behavior.** Check Secure/HttpOnly/SameSite cookies, login, forced change, logout, renewals, JSON import, multipart upload, downloads, workbook export and print layout; verify CSP is retained and mixed content is absent.
- [ ] **TLS-5 — Exercise boundary failures.** Check foreign-origin multipart, missing Fetch Metadata, over-limit/chunked requests, wrong host, scanner/quota failure, proxy restart and upstream outage. Ensure rate limits/MFA cannot be bypassed via the app port.
- [ ] **TLS-6 — Prove renewal and rollback.** Stage a replacement certificate pair, force reload without changing Caddyfile text, verify the external serial/expiry, test the alert path and document rollback. No expired, untrusted, wrong-host or mismatched pair should be accepted for release.

Useful external checks, to run after the real domain is deployed:

```bash
curl -I http://assets.example.com/login
curl -I https://assets.example.com/login
openssl s_client -connect assets.example.com:443 \
  -servername assets.example.com -verify_hostname assets.example.com \
  -verify_return_error -showcerts </dev/null
```

Check the redirect target, certificate chain/trust and hostname, validity period, HSTS and CSP. Inspect browser Network/Application tools for the actual session cookie flags and absence of HTTP requests. `openssl s_client` verification options are described in [the OpenSSL documentation](https://docs.openssl.org/3.0/man1/openssl-s_client/). Do not use `curl -k` or disabled browser verification as proof of a successful certificate deployment.

## 6. Incremental rollout order

The issue slices can become individual work items. A practical dependency order is:

| Stage | Deliverable | Relevant work |
| --- | --- | --- |
| 1 | Approved access and data policy; staging VPS behind restricted access | SR-05.1, SR-06.1, SR-16.1; SR-13.3 |
| 2 | Correct revocation and bounded authentication/upload behavior | SR-02, SR-03, SR-04; SR-07 and SR-11 |
| 3 | Private storage, independent recovery and safe uploads | SR-08, SR-09, SR-10; SR-16 |
| 4 | HTTPS proxy, purchased certificate and protected identity boundary | SR-01, SR-06; TLS-1 through TLS-6 |
| 5 | Verified authorization, browser privacy, audit and observability | SR-05 implementation, SR-12, SR-15, SR-17 |
| 6 | Reproducible hardened release and private production initialization | SR-13, SR-14, SR-18; final acceptance below |

Work can overlap where independent. For example, certificate provisioning and external backup setup need not wait for a frontend privacy change. Avoid importing real grievance records into an internet-accessible staging system while their access/storage controls are unresolved.

## 7. Final production gate

Use this checklist for the **actual destination environment**, not just a developer laptop. A check needs evidence, an owner and a date. Any accepted exception should state the risk, compensating controls and expiry/review date.

- [ ] The data owner approved the user/case access matrix, and the account roster matches it. No demo/test identities or credentials remain.
- [ ] Credential-reset concurrency is fixed and regression-tested. Deactivation, CLI recovery and session revocation work during overlapping requests.
- [ ] Authentication has source/account/global limits, a bounded hash queue and enforced MFA or an approved restricted-access alternative; upstream bypasses are closed.
- [ ] Password and session policies are approved and enforced, including absolute expiry, temporary-credential expiry and privileged reauthentication.
- [ ] Uploads authenticate before expensive buffering and have concurrency, cumulative-storage, format/quarantine and timeout controls. Large reads/exports have measured limits.
- [ ] Caddy presents the purchased trusted full chain for the right hostname, redirects HTTP, preserves application headers and has a tested renewal/alert/rollback procedure.
- [ ] The app's public origin and CSRF behavior are correct through the proxy. Legitimate multipart requests work, and foreign-origin requests fail.
- [ ] External IPv4 and IPv6 checks show only intended ports. Application, database, Docker, development, inspector and Caddy admin interfaces are private.
- [ ] Database/sidecar/backups/certificate keys have measured private permissions. The app cannot read the TLS private key; Caddy cannot browse application data.
- [ ] Encryption/key custody and personnel-data retention/legal-hold rules are approved, including snapshots, earlier versions, withdrawn files and exported copies.
- [ ] Independent encrypted backups run automatically and alert on failure/staleness. A timed restore drill verified data, attachments, audit and revoked-session handling.
- [ ] Runtime isolation and measured memory/CPU/PID/disk budgets are active; restarts, graceful shutdown, full disk and failed writes are monitored.
- [ ] Logs redact sensitive queries and credentials, retain useful trusted attribution, and route tested security/backup/storage/certificate alerts to a named responder.
- [ ] Audit claims match actual guarantees. Direct API reads/official exports are covered according to policy, and independent evidence survives loss of the VPS where required.
- [ ] Expired sessions conceal case content; successful logout invalidates server state; failed/offline logout and multi-tab behavior are truthful and tested.
- [ ] A clean production build passes tests/typecheck, production dependency and image/OS scans, and current/history secret scans; deployed commit and image digest are recorded.
- [ ] Bootstrap is private and deliberate; production volume identity and existing account/data counts were checked before opening access.
- [ ] An incident runbook identifies who can restrict access, revoke sessions/accounts, preserve logs, rotate credentials/keys, restore data and communicate a suspected personnel-data incident.
- [ ] A final staging review used the real HTTPS/proxy/auth topology, followed by an external verification of the deployed VPS. Remaining issues have explicit, time-bounded risk decisions.

**Release decision:** approving these checks is an operational decision after implementation and verification. The current review identifies the work needed; the repository as reviewed should not be treated as ready for unrestricted public deployment.

