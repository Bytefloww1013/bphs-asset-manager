# Deploy BPHS Connect to your VPS

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

```bash
sudo install -d -o "$(id -un)" -g "$(id -gn)" /opt/bphs-asset-manager
git clone https://github.com/Bytefloww1013/bphs-asset-manager.git /opt/bphs-asset-manager
cd /opt/bphs-asset-manager
git switch main
git log -1 --oneline
```

If the repository is private, give the VPS a read-only GitHub deploy key and clone using `git@github.com:Bytefloww1013/bphs-asset-manager.git` instead. Use an SSH remote for later pulls too. Do not put access tokens in the clone URL.

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

## 7. Build the image and optionally bring over existing data

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml build
```

The build installs dependencies from `bun.lock`, builds the frontend, and creates the production image. A first build can take several minutes.

**For a new, empty deployment:** skip to step 8. Do not run the demo seed script on the VPS.

**To keep data from an existing installation:** make a consistent backup at the source, then import it before the VPS app's first start. Do not copy a running installation's raw `bphs.sqlite` file; recent writes can still be in its WAL file.

For an existing local installation, **on your computer**, from this repository:

```bash
bun run db:backup
```

Use the exact backup path printed by that command. For an existing Docker installation, use its `server/backup.ts` tool or `scripts/backup-offbox.sh` instead; see [RUNBOOK.md](RUNBOOK.md#4-backups).

**On your computer**, copy that backup to the VPS, replacing the example filename:

```bash
scp ./data/backups/YOUR-BACKUP.sqlite YOUR_SSH_USER@50.6.205.113:~/bphs-transfer.sqlite
```

**On the VPS**, import into the new volume. Run this only for an initial migration into an empty deployment:

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml run --rm --no-deps -T assets \
  sh -c 'test ! -e /data/bphs.sqlite && cat > /data/bphs.sqlite' \
  < ~/bphs-transfer.sqlite
```

Existing accounts, passwords, records and grievance files come with the database. A migrated database will not create a new bootstrap account.

## 8. Start the app and check its health

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml up -d --wait --wait-timeout 120
sudo docker compose -f /etc/bphs-connect/compose.yml ps
curl -fsS http://127.0.0.1:8080/api/health
sudo docker port bphs-assets
```

Expect a healthy container, `{"ok":true}`, and `3000/tcp -> 127.0.0.1:8080`. Migrations run automatically at startup. The app serves both the API and the built frontend; no Vite development server is needed.

On a fresh database, retrieve the first Super Admin's one-time password:

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets
```

Keep that password private and wait until HTTPS is ready before signing in. `COOKIE_SECURE=true` is already enabled, so browser sign-in over plain HTTP will not work.

## 9. Configure Nginx

Create the initial HTTP site. The quoted `EOF` preserves Nginx's `$host` and other variables:

```bash
sudo tee /etc/nginx/sites-available/bphs-connect.com > /dev/null <<'EOF'
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
}
EOF

sudo ln -s /etc/nginx/sites-available/bphs-connect.com /etc/nginx/sites-enabled/bphs-connect.com
sudo nginx -t
sudo systemctl reload nginx
```

Reload only if `nginx -t` succeeds. If the symlink already exists, skip the `ln` command.

The API permits 4 MiB for normal requests, and up to 101 MiB for grievance uploads (ten files of up to 10 MiB plus form data). Nginx's default 1 MiB limit would reject valid imports and attachments. The app still enforces its own per-file and route limits. These settings use Nginx's [body-size directive](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size) and [proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

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
sudo certbot --nginx --redirect -d bphs-connect.com -d www.bphs-connect.com
sudo nginx -t
sudo certbot renew --dry-run
sudo systemctl list-timers --all 'snap.certbot.renew*'
```

Supply a monitored email address and accept the certificate terms when prompted. If Certbot was installed previously, use one installation method rather than mixing snap and Ubuntu packages. If its symlink already exists, skip that `ln` command.

Certbot updates the Nginx site to serve HTTPS and redirect HTTP. Its scheduled renewal should be present, and the dry run should succeed. Keep port 80 reachable for later certificate validation. After Certbot edits the site, preserve its TLS configuration when making future Nginx changes; do not overwrite it with the initial HTTP block from step 9.

**On your computer**, verify the final URLs:

```bash
curl -I http://bphs-connect.com
curl -fsS https://bphs-connect.com/api/health
curl -fsS https://www.bphs-connect.com/api/health
curl -I https://bphs-connect.com/login
```

Expect an HTTP-to-HTTPS redirect, successful health responses, and a successful login page with a trusted certificate. Do not use `curl -k`; certificate validation is part of this check.

## 11. Sign in and verify the application

Open **https://bphs-connect.com**. For a fresh database, sign in as `admin@bphs-connect.com` (or your configured bootstrap email) with the one-time password from step 8. Choose a permanent password when prompted. For a migrated database, use an existing account.

Before inviting users:

- Create a second Super Admin from **Users** so account recovery has a second route.
- Confirm you can sign out and back in, and refresh a direct URL such as `/assets`.
- Check the Assets and Grievances workspaces and the expected records if you migrated data.
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

Schedule it daily at 02:15 in the VPS's timezone:

```bash
timedatectl
sudo tee /etc/cron.d/bphs-connect-backup > /dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 2 * * * root DEST=/srv/backups/bphs CONTAINER=bphs-assets /opt/bphs-asset-manager/scripts/backup-offbox.sh >> /var/log/bphs-backup.log 2>&1
EOF
sudo chmod 0644 /etc/cron.d/bphs-connect-backup
```

**Also arrange a daily encrypted copy to storage outside this VPS**, using your backup service or another server. Copies in `/srv/backups/bphs` survive container replacement, but losing the VPS loses those copies too. Include `/etc/bphs-connect/compose.yml` and the Nginx site configuration in your server configuration backups.

Check the backup log and alert if the newest successful backup becomes more than a day old. Budget disk space for multiple full copies of all attachments. Practise a restore into a scratch volume using [RUNBOOK.md section 5.3](RUNBOOK.md#53-restore-into-a-scratch-volume-drill-or-to-inspect-old-data); the image name remains `bphs-asset-manager:latest`.

## 13. Deploy later updates

Push your tested changes to `main` first. On the VPS, back up before changing versions and record the old commit:

```bash
cd /opt/bphs-asset-manager
git rev-parse HEAD
sudo env DEST=/srv/backups/bphs CONTAINER=bphs-assets ./scripts/backup-offbox.sh
git pull --ff-only origin main
sudo docker compose -f /etc/bphs-connect/compose.yml build
sudo docker compose -f /etc/bphs-connect/compose.yml up -d --wait --wait-timeout 120
sudo docker compose -f /etc/bphs-connect/compose.yml logs --tail 100 assets
curl -fsS https://bphs-connect.com/api/health
```

Keep the old commit ID and the backup filename printed by the script. Stop if the backup, pull or build fails. The app stays available during the build, with a brief interruption when Compose replaces the container. Database migrations run on startup.

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
| Upload/import fails with 413 | Preserve the 4m and 101m Nginx limits after Certbot changes; the app also limits each attachment to 10 MiB. |
| Excel import/export stalls | Check whether a proxy or browser policy changed the app's Content-Security-Policy or blocked its blob workers. |
| Build is killed or reports no space | Check `free -h`, `df -h` and `sudo docker system df`; provide enough RAM/disk for the frontend build. Do not delete the data volume. |
| App is unhealthy or repeatedly restarts | Read the container log for migration errors, configuration errors or an unwritable `/data`. |
| Data seems empty after an update | Verify you used the production Compose file and the `bphs-connect-data` volume before entering new records. |
| App does not return after a VPS reboot | Check `sudo systemctl status docker nginx`. A deliberately stopped container needs `start assets`; its restart policy does not undo a manual stop. |

The HTTPS URL to share with users is **https://bphs-connect.com**.
