# Deploy BPHS-Connect to your VPS

**Names:** the application is BPHS-Connect, but the technical names predate the rebrand and are unchanged: repository `bphs-asset-manager`, image `bphs-asset-manager:latest`, container `bphs-assets`, Compose service `assets`. The backup script and [RUNBOOK.md](RUNBOOK.md) depend on them, so do not rename them.

This guide deploys this repository on **Ubuntu Server 26.04 LTS** at **50.6.205.113**, with the web app available at **https://bphs-connect.com**. It also enables **https://www.bphs-connect.com**.

The existing Dockerfile builds the React frontend and runs the Hono API on Node 24. Nginx on the VPS forwards web requests to that container, and Certbot installs a free Let's Encrypt HTTPS certificate. SQLite stores the application data, including grievance attachments, in a persistent Docker volume.

```text
Browser → bphs-connect.com:443 → Nginx → 127.0.0.1:8080 → app container:3000
                                                           ↓
                                                 bphs-connect-data volume
```

You need SSH access with `sudo`, access to the domain's DNS settings, and permission to clone the repository. These steps assume a fresh VPS without an existing website or hosting control panel. Run commands on the VPS unless a step says **on your computer**. Replace `YOUR_SSH_USER` with the login name your VPS provider supplied; if you log in as root, you can omit `sudo`.

## 1. Confirm the domain's DNS records

At the service managing DNS for `bphs-connect.com`, confirm these records. If they are already correct, leave them in place.

| Type | Name / host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `50.6.205.113` | `300` or the provider's default |
| CNAME | `www` | `bphs-connect.com` | `300` or the provider's default |

Remove conflicting parking records or other A records for these two names. Keep unrelated mail and verification records. If either name has an AAAA record, it must point to this VPS's working IPv6 address; otherwise remove that AAAA record. This guide assumes direct DNS routing; if you use Cloudflare, use **DNS only** for these records during setup.

Both names must resolve correctly before requesting the certificate. If you do not want `www`, omit its DNS record, remove it from Nginx's `server_name` below, and omit `-d www.bphs-connect.com` from the Certbot command.

## 2. Connect and prepare Ubuntu

**On your computer:**

```bash
ssh YOUR_SSH_USER@50.6.205.113
```

Confirm the OS is Ubuntu 26.04 LTS, then install the host tools:

```bash
cat /etc/os-release
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx ufw dnsutils snapd cron
sudo systemctl enable --now nginx cron
```

If Ubuntu reports that a reboot is required, reboot and reconnect before continuing.

Check public DNS:

```bash
dig @1.1.1.1 +short bphs-connect.com A
dig @1.1.1.1 +short www.bphs-connect.com A
dig @1.1.1.1 +short bphs-connect.com AAAA
dig @1.1.1.1 +short www.bphs-connect.com AAAA
```

The A lookups should end in `50.6.205.113`. The AAAA lookups should be empty unless you configured IPv6 for this VPS. DNS changes may take time to reach all resolvers.

## 3. Allow SSH, HTTP and HTTPS

In the VPS provider's firewall, allow inbound TCP **22**, **80** and **443**. Use your actual SSH port instead of 22 if the provider changed it. Do not open app ports 3000 or 8080 to the internet.

Configure Ubuntu's firewall too. Allow your SSH port **before** enabling it, and keep your current SSH session open until a second connection succeeds:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

For a custom SSH port, replace `sudo ufw allow OpenSSH` with, for example, `sudo ufw allow 2222/tcp` before enabling UFW. See [Ubuntu's firewall documentation](https://ubuntu.com/server/docs/how-to/security/firewalls/).

## 4. Install Docker Engine and Compose

Install from [Docker's official Ubuntu repository](https://docs.docker.com/engine/install/ubuntu/). On a fresh VPS:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

If Docker was preinstalled, check the official instructions for conflicting packages before replacing it. The remaining commands use `sudo docker`; adding your SSH account to the Docker group is unnecessary.

## 5. Put the repository on the VPS

The repository is private, so the VPS needs its own read-only **deploy key**. Do not put access tokens in the clone URL. Create the key as your normal SSH user (not root), because that user runs `git pull` in step 13:

```bash
ssh-keygen -t ed25519 -N '' -C 'bphs-connect VPS' -f ~/.ssh/bphs_deploy
cat ~/.ssh/bphs_deploy.pub
```

On GitHub, open the repository's **Settings → Deploy keys → Add deploy key**, paste that public key, and leave **Allow write access** unticked. Then clone:

```bash
sudo install -d -o "$(id -un)" -g "$(id -gn)" /opt/bphs-asset-manager
GIT_SSH_COMMAND='ssh -i ~/.ssh/bphs_deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:Bytefloww1013/bphs-asset-manager.git /opt/bphs-asset-manager
cd /opt/bphs-asset-manager
git config core.sshCommand 'ssh -i ~/.ssh/bphs_deploy -o IdentitiesOnly=yes'
git switch main
git log -1 --oneline
```

The first connection asks you to confirm GitHub's host key; compare it with [GitHub's published fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints). The `core.sshCommand` setting makes later pulls use the same key.

Push the version you want to deploy to GitHub before cloning or updating. The VPS receives committed, pushed files; it will not receive uncommitted files from your computer. Docker installs Bun and Node inside its build stages, so neither needs to be installed on the VPS host.

## 6. Create a production Compose file

Keep the VPS configuration outside the Git checkout. Create this **standalone** file; do not combine it with the repository's `docker-compose.yml`:

```bash
sudo install -d -m 0750 /etc/bphs-connect
sudo tee /etc/bphs-connect/compose.yml > /dev/null <<'EOF'
name: bphs-connect

services:
  assets:
    build:
      context: /opt/bphs-asset-manager
    image: bphs-asset-manager:latest
    container_name: bphs-assets
    restart: unless-stopped
    stop_grace_period: 15s
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '5'
    ports:
      - '127.0.0.1:8080:3000'
    environment:
      NODE_ENV: production
      PORT: '3000'
      DATA_DIR: /data
      WEB_DIR: /app/dist/web
      COOKIE_SECURE: 'true'
      SESSION_IDLE_HOURS: '12'
      BOOTSTRAP_ADMIN_EMAIL: admin@bphs-connect.com
      BOOTSTRAP_ADMIN_NAME: BPHS Super Admin
    volumes:
      - bphs-data:/data

volumes:
  bphs-data:
    name: bphs-connect-data
EOF
sudo chmod 0640 /etc/bphs-connect/compose.yml
sudo docker compose -f /etc/bphs-connect/compose.yml config --quiet
```

Change the bootstrap email/name now if you prefer different login details. This email is an account identifier; deployment does not create an email inbox or require an email service. Bootstrap settings apply only when the database has no users.

Always include `-f /etc/bphs-connect/compose.yml` in Compose commands for this deployment. Running plain `docker compose up` inside the checkout uses the LAN configuration, which publishes port 8080 on all interfaces and disables secure cookies.

The loopback binding matters: [Docker-published ports can bypass UFW rules](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations). The volume's explicit name keeps the data location stable across rebuilds and Git updates. Keep it on the VPS's local disk.

## 7. Build the image

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml build
```

The build installs dependencies from `bun.lock`, builds the frontend, and creates the production image. A first build can take several minutes.

The deployment starts with an empty database: the app creates it, its tables and the first Super Admin on first start. Do not run the demo seed script (`db:seed`) on the VPS.

## 8. Start the app and check its health

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml up -d --wait --wait-timeout 120
sudo docker compose -f /etc/bphs-connect/compose.yml ps
curl -fsS http://127.0.0.1:8080/api/health
sudo docker port bphs-assets
```

Expect a healthy container, `{"ok":true}`, and `3000/tcp -> 127.0.0.1:8080`. Migrations run automatically at startup. The app serves both the API and the built frontend; no Vite development server is needed.

The first Super Admin's starting password is `Brightpath1!`. The log shows it along with the email:

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets
```

Every new install starts with that same password, so sign in and change it (step 11) as soon as HTTPS works; do not leave the site public with it unchanged. Wait until HTTPS is ready before signing in. `COOKIE_SECURE=true` is already enabled, so browser sign-in over plain HTTP will not work.

## 9. Configure Nginx

Create the initial HTTP site. The quoted `EOF` preserves Nginx's `$host` and other variables:

```bash
sudo tee /etc/nginx/sites-available/bphs-connect.com > /dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=bphs_login:10m rate=10r/m;

server {
    listen 80;
    listen [::]:80;
    server_name bphs-connect.com www.bphs-connect.com;

    client_max_body_size 4m;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }

    location /api/grievances {
        client_max_body_size 101m;
        proxy_pass http://127.0.0.1:8080;
    }

    location ~ ^/api/auth/(login|password-change)$ {
        limit_req zone=bphs_login burst=30 nodelay;
        limit_req_status 429;
        error_page 429 = @too_many_attempts;
        proxy_pass http://127.0.0.1:8080;
    }

    location @too_many_attempts {
        default_type application/json;
        return 429 '{"error":"rate_limited","message":"Too many sign-in attempts from this network. Wait a minute and try again."}';
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/bphs-connect.com /etc/nginx/sites-enabled/bphs-connect.com
sudo nginx -t
sudo systemctl reload nginx
```

Reload only if `nginx -t` succeeds. If the symlink already exists, skip the `ln` command.

The API permits 4 MiB for normal requests, and up to 101 MiB for grievance uploads (ten files of up to 10 MiB plus form data). Nginx's default 1 MiB limit would reject valid imports and attachments. The app still enforces its own per-file and route limits. These settings use Nginx's [body-size directive](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size) and [proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

The two `/api/auth/` locations limit password guessing. The app locks one account after five wrong passwords. Nginx also slows down a single address that tries many accounts: after 30 quick attempts, it allows 10 per minute. A whole office signing in at once from one shared address stays under that. Users who go over it see the message above instead of a sign-in error. If a CDN or other proxy is ever put in front of this server, every request arrives from its addresses, and this limit then applies to everyone together. Remove or adapt it before doing that.

Leave the application's `Content-Security-Policy` header intact; Excel import/export needs its `worker-src 'self' blob:` allowance.

**On your computer**, check that HTTP reaches this app through the public domain:

```bash
curl -fsS http://bphs-connect.com/api/health
curl -fsS http://www.bphs-connect.com/api/health
```

Both should return `{"ok":true}`. Resolve DNS/firewall problems before continuing.

## 10. Enable HTTPS and automatic certificate renewal

Follow the [Certbot Nginx instructions](https://certbot.eff.org/instructions?ws=nginx&os=snap), using the snap installation on this fresh VPS:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx --redirect --hsts -m jshope@bphumanservices.com --agree-tos --no-eff-email \
  -d bphs-connect.com -d www.bphs-connect.com
sudo nginx -t
sudo certbot renew --dry-run
sudo systemctl list-timers --all 'snap.certbot.renew*'
```

The email address receives Let's Encrypt account notices. `--agree-tos` accepts its subscriber agreement, and `--no-eff-email` declines the EFF newsletter. Let's Encrypt no longer sends expiry reminders, so the renewal timer and the dry run are what keep the certificate current.

`--hsts` adds a `Strict-Transport-Security` header, valid for one year, to the HTTPS site only. After a browser has seen it, that browser refuses plain HTTP for this domain, so nobody on the network can downgrade a returning user. Do not remove HTTPS later: those browsers will not open the site over HTTP until the year runs out.

If Certbot was installed previously, use one installation method rather than mixing snap and Ubuntu packages. If its symlink already exists, skip that `ln` command.

Certbot updates the Nginx site to serve HTTPS and redirect HTTP. Its scheduled renewal should be present, and the dry run should succeed. Keep port 80 reachable for later certificate validation. After Certbot edits the site, preserve its TLS configuration when making future Nginx changes; do not overwrite it with the initial HTTP block from step 9.

**On your computer**, verify the final URLs:

```bash
curl -I http://bphs-connect.com
curl -fsS https://bphs-connect.com/api/health
curl -fsS https://www.bphs-connect.com/api/health
curl -I https://bphs-connect.com/login
```

Expect an HTTP-to-HTTPS redirect, successful health responses, and a successful login page with a trusted certificate and a `Strict-Transport-Security` header. Do not use `curl -k`; certificate validation is part of this check.

## 11. Sign in and verify the application

Open **https://bphs-connect.com**. Sign in as `admin@bphs-connect.com` (or your configured bootstrap email) with the starting password `Brightpath1!`. Choose a permanent password when prompted.

Before inviting users:

- Create a second Super Admin from **Users** so account recovery has a second route.
- Confirm you can sign out and back in, and refresh a direct URL such as `/assets`.
- Check that the Assets and Grievances workspaces open, and, as a Super Admin, Maintenance.
- Try an import/export and, when appropriate, a grievance attachment upload/download through HTTPS.
- In browser developer tools, confirm the session cookie has `Secure`, `HttpOnly` and `SameSite=Lax`.

Give accounts only to people who may read all grievances: the current app allows every signed-in account to read every grievance. See [RUNBOOK.md](RUNBOOK.md#10-security-notes) for the existing access model.

## 12. Schedule backups and copy them off the VPS

The database is `/data/bphs.sqlite` in Docker volume **`bphs-connect-data`**. It contains accounts, asset records, grievances and attachment contents. Rebuilding or recreating the container preserves this volume.

Run the repository's existing backup script once:

```bash
sudo install -d -m 0700 /srv/backups/bphs
sudo env DEST=/srv/backups/bphs CONTAINER=bphs-assets \
  /opt/bphs-asset-manager/scripts/backup-offbox.sh
sudo ls -lh /srv/backups/bphs
```

The script uses SQLite's online backup API, checks the resulting database, and writes an owner-only copy to the host. Its defaults retain host copies for about 30 days and in-volume copies for about seven days.

Copies in `/srv/backups/bphs` survive container replacement, but if the VPS is lost, they are lost with it. The script can also send each copy to Google Drive. It encrypts the copy on the VPS first, so Google stores only scrambled files.

### Connect Google Drive

Install [rclone](https://rclone.org/drive/) and create a remote named `gdrive`:

```bash
sudo apt install -y rclone
sudo rclone config
```

Answer the prompts:

- `n` (new remote). Name: `gdrive`. Storage: `drive` (Google Drive).
- `client_id` and `client_secret`: leave both blank.
- Scope: `drive.file`, which is "access to files created by rclone only". The VPS can then see only the backups it uploads, not the rest of your Drive.
- `service_account_file`: leave blank. Edit advanced config: `n`.
- **Use web browser to automatically authenticate: `n`.** The VPS has no browser. Rclone prints a command that starts `rclone authorize "drive"`.
- **On your computer**, install rclone (on Windows, run `winget install Rclone.Rclone` in PowerShell, then open a new PowerShell window). Run the printed `rclone authorize ...` command there. Sign in to the Google account that should hold the backups and allow access. Copy the token it prints back into the VPS prompt.
- Configure as a Shared Drive: `n`. Then confirm with `y` and quit with `q`.

Add an encrypting remote, `bphs-backup`, over a `bphs-backups` folder in that Drive:

```bash
PASS1=$(openssl rand -base64 33); PASS2=$(openssl rand -base64 33)
sudo rclone config create bphs-backup crypt remote=gdrive:bphs-backups password="$PASS1" password2="$PASS2" --obscure
printf 'BPHS backup encryption\n  password:  %s\n  password2: %s\n' "$PASS1" "$PASS2"
unset PASS1 PASS2
```

**Save both passwords in your password manager now, somewhere other than this VPS.** Nothing else can decrypt the Drive copies: not you, not Google and not rclone. If the VPS is lost, these passwords are what make the backups usable.

Send one backup and check it arrived:

```bash
sudo env DEST=/srv/backups/bphs CONTAINER=bphs-assets REMOTE=bphs-backup: \
  /opt/bphs-asset-manager/scripts/backup-offbox.sh
sudo rclone ls bphs-backup:
sudo rclone lsf gdrive:bphs-backups
```

The first listing shows `bphs-<date>.sqlite`. The second is what Google holds: the same file under a scrambled name. Send the server's own settings there too, and again whenever you change them:

```bash
sudo rclone copy /etc/bphs-connect bphs-backup:server-config/bphs-connect
sudo rclone copy /etc/nginx/sites-available bphs-backup:server-config/nginx
```

### Schedule it

Run it daily at 02:15 in the VPS's timezone:

```bash
timedatectl
sudo tee /etc/cron.d/bphs-connect-backup > /dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 2 * * * root DEST=/srv/backups/bphs CONTAINER=bphs-assets REMOTE=bphs-backup: /opt/bphs-asset-manager/scripts/backup-offbox.sh >> /var/log/bphs-backup.log 2>&1
EOF
sudo chmod 0644 /etc/cron.d/bphs-connect-backup
```

The VPS keeps 30 days of copies. Drive keeps 180, which you can change with `REMOTE_KEEP_DAYS`. Each copy is the whole database, so 180 copies of a 1 GB database take 180 GB. Expired copies go to Drive's trash, and Google empties the trash after 30 days. If an upload fails, the script exits with an error, and that night's copy stays on the VPS.

**Restoring from Drive:** list the copies with `sudo rclone ls bphs-backup:`. Fetch one with `sudo rclone copy bphs-backup:bphs-<date>.sqlite /srv/backups/bphs/`, then follow [RUNBOOK.md section 5.1](RUNBOOK.md#51-restore-into-the-live-system). On a replacement VPS, install rclone, create `gdrive` again as above, and recreate `bphs-backup` with the saved passwords instead of new ones:

```bash
sudo rclone config create bphs-backup crypt remote=gdrive:bphs-backups password='<saved password>' password2='<saved password2>' --obscure
```

Rclone may lose sight of the files, for example after its access is removed in your Google account settings. In that case, download the `bphs-backups` folder from drive.google.com, and create `bphs-backup` with `remote=` pointing at the downloaded folder instead.

Check the backup log and alert if the newest successful backup becomes more than a day old. Budget disk space for multiple full copies of all attachments. Practise a restore into a scratch volume using [RUNBOOK.md section 5.3](RUNBOOK.md#53-restore-into-a-scratch-volume-drill-or-to-inspect-old-data); the image name remains `bphs-asset-manager:latest`.

## 13. Deploy later updates

Push your tested changes to `main` first. If a change alters the database tables (`server/db/schema.ts`), generate its migration with `bun run db:generate` and commit the new files in `server/db/migrations/` with it; the app applies them at startup and keeps existing rows. On the VPS, back up before changing versions and record the old commit:

```bash
cd /opt/bphs-asset-manager
git rev-parse HEAD
sudo env DEST=/srv/backups/bphs CONTAINER=bphs-assets ./scripts/backup-offbox.sh
git pull --ff-only origin main
sudo docker compose -f /etc/bphs-connect/compose.yml build
sudo docker compose -f /etc/bphs-connect/compose.yml up -d --wait --wait-timeout 120
sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets
curl -fsS https://bphs-connect.com/api/health
sudo docker image prune -f
```

The last command removes the untagged image each rebuild leaves behind (never volumes), so old images do not fill the disk. Keep the old commit ID and the backup filename printed by the script. Stop if the backup, pull or build fails. The app stays available during the build, with a brief interruption when Compose replaces the container. Database migrations run on startup.

Changing settings in `/etc/bphs-connect/compose.yml` requires `up -d` to recreate the container; `restart` alone does not apply changed environment values.

**Rollback:** if an update migrated the database, restore the matching pre-update backup and run the previous code together. An older app version against a newer schema is not a safe rollback. [RUNBOOK.md section 5](RUNBOOK.md#5-restore) gives the restore procedure; substitute `sudo docker compose -f /etc/bphs-connect/compose.yml` for every `docker compose` command there. Stop the app before replacing its database, and move the old database and its WAL/SHM files aside together. A restore discards changes made since the backup.

Never use `docker compose down -v`, remove `bphs-connect-data`, or prune volumes as part of an update; those actions can delete your application data.

## 14. Useful operations and troubleshooting

```bash
# Container status and recent logs
sudo docker compose -f /etc/bphs-connect/compose.yml ps
sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets

# Restart; use "start assets" instead if you deliberately stopped the container
sudo docker compose -f /etc/bphs-connect/compose.yml restart assets

# Account recovery; use the actual account email if you changed it
sudo docker compose -f /etc/bphs-connect/compose.yml exec assets node server/admin.ts list
sudo docker compose -f /etc/bphs-connect/compose.yml exec assets node server/admin.ts unlock admin@bphs-connect.com
sudo docker compose -f /etc/bphs-connect/compose.yml exec assets node server/admin.ts reset-password admin@bphs-connect.com

# Proxy, certificate and backup diagnostics
sudo nginx -t
sudo tail -n 50 /var/log/nginx/error.log
sudo certbot certificates
sudo tail -n 50 /var/log/bphs-backup.log
df -h
```

| Symptom | What to check |
| --- | --- |
| Domain shows a parking page or another server | Authoritative DNS settings, cached DNS, conflicting A/AAAA records, and any CDN proxy. |
| Website times out | Provider firewall, UFW ports 80/443, and `sudo systemctl status nginx`. |
| Nginx returns 502 | Container logs and `curl -fsS http://127.0.0.1:8080/api/health`; check that Nginx and Compose both use port 8080. |
| Certificate issuance fails | Both requested names must reach this server on port 80; check AAAA records and any restrictive CAA records. |
| Sign-in returns to the login page | Use `https://bphs-connect.com`; verify `COOKIE_SECURE: 'true'`, then recreate with the production Compose file after any setting change. |
| Sign-in says "Too many sign-in attempts from this network" | The Nginx limit from step 9. It clears within minutes. If a whole office keeps hitting it, raise `burst` in the site file and reload Nginx. |
| Backup log shows `invalid_grant` or `couldn't fetch token` | Google withdrew rclone's access. Run `sudo rclone config reconnect gdrive:`, answer `n` to the browser question, and repeat the `rclone authorize` step from step 12. |
| Upload/import fails with 413 | Preserve the 4m and 101m Nginx limits after Certbot changes; the app also limits each attachment to 10 MiB. |
| Excel import/export stalls | Check whether a proxy or browser policy changed the app's Content-Security-Policy or blocked its blob workers. |
| Build is killed or reports no space | Check `free -h`, `df -h` and `sudo docker system df`; provide enough RAM/disk for the frontend build. Do not delete the data volume. |
| App is unhealthy or repeatedly restarts | Read the container log for migration errors, configuration errors or an unwritable `/data`. |
| Data seems empty after an update | Verify you used the production Compose file and the `bphs-connect-data` volume before entering new records. |
| App does not return after a VPS reboot | Check `sudo systemctl status docker nginx`. A deliberately stopped container needs `start assets`; its restart policy does not undo a manual stop. |

The HTTPS URL to share with users is **https://bphs-connect.com**.

## 15. Connect the Zoho maintenance form

Maintenance requests come from the Zoho Forms form *Maintenance Work Order Request*. When someone submits it, Zoho posts the entry to the app with a shared secret in a header. Nothing is sent the other way. Until this step is done, the webhook answers 404 and Super Admins can still enter requests by hand under **Maintenance → New request**.

**1. The secret.** One value goes in two places: the server and Zoho's custom header. If you do not have one yet, make one with:

```bash
openssl rand -hex 32
```

It must be at least 32 characters. Keep it in `/etc/bphs-connect/compose.yml` (readable only by root and the `root` group, step 6), never in the Git checkout.

**2. Give it to the server.** Open the production Compose file:

```bash
sudo nano /etc/bphs-connect/compose.yml
```

Under `environment:`, below `BOOTSTRAP_ADMIN_NAME`, add this line with the same indentation, putting the secret between the quotes:

```yaml
      MAINTENANCE_WEBHOOK_SECRET: 'the-secret'
```

Then recreate the container and check the endpoint:

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml up -d --wait --wait-timeout 120
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://bphs-connect.com/api/webhooks/maintenance -H 'Content-Type: application/json' -d '{}'
```

Expect `401`: the endpoint is on and refused a request without the secret. `404` means the setting did not reach the container (check the indentation and that you ran `up -d`, not `restart`). If the container will not start and its log says the secret must be at least 32 characters, the value is too short.

**3. Configure the webhook in Zoho.** In Zoho Forms, open *Maintenance Work Order Request* → **Integrations → Webhooks**:

| Setting | Value |
| --- | --- |
| Webhook URL | `https://bphs-connect.com/api/webhooks/maintenance` |
| HTTP method | `POST` |
| Payload Content Type | `application/json` |
| Authorization Type | `General` |
| URL Parameters | Leave empty |
| Custom Headers | Name `X-Webhook-Secret`, value: the secret from part 1 |

Use JSON, not the other two content types: the app refuses form-encoded and multipart posts that carry no `Origin` header, which Zoho's do not.

Under **Payload → Form Fields**, add one row per field, with the Parameter Name typed exactly as shown (they are case-sensitive):

| Form field | Parameter Name | Shown in the app as |
| --- | --- | --- |
| Name – First Name | `firstName` | Requested by |
| Name – Last Name | `lastName` | Requested by |
| Email | `email` | Email |
| Program Selection | `program` | Program, as Zoho's text |
| Location/Room of Request | `location` | Location |
| Describe the Request in Detail | `description` | Description (the only field that must arrive) |
| Urgent? | `urgent` | Urgent badge, unless the value is empty or `No` |
| Date | `requestDate` | Date |
| Date Maintenance Issue was Noticed | `noticedDate` | Noticed |
| Added Time | `addedTime` | Submitted in Zoho |

Leave out Upload Image(s), Verify, Signature and CAPTCHA. Any other parameter is ignored, so adding fields to the form later breaks nothing.

**4. Test it.** Press **Test Webhook** in Zoho and read the response it shows:

| Response | Meaning |
| --- | --- |
| `201` with an `id` | Stored. It is under **Maintenance** in the app |
| `200` with `"duplicate": true` | Already stored: the same email and Added Time arrived before. Nothing new was added |
| `400` "The entry has no description" | No `description` arrived. Check that Parameter Name. The container log lists the parameter names that did arrive (never their values): `sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets \| grep -i maintenance` |
| `401` | The header is missing, misnamed, or its value differs from the server's |
| `404` | The server has no secret set (part 2) |

Then submit one real entry through the form, with quotes and a line break in the description, and open it in the app. Check that the name, email, program, location, dates and Urgent all came through as you typed them. Afterwards, delete the test requests (open each one → **Delete**).

Zoho does not retry a failed post. If a request is ever missing, it is still in the form's Entries in Zoho; see [RUNBOOK.md section 9](RUNBOOK.md#9-troubleshooting).
