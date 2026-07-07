# Infomaniak VPS deployment

This is the low-cost production path for Math Woods: one VPS, Docker Compose, Caddy, Next.js, Postgres, Valkey, and Uptime Kuma.

## Target machine

Start with an Infomaniak Public Cloud instance around 4 vCPU, 8 GB RAM, and 50 GB storage. Ubuntu 24.04 LTS is a good default.

Only expose:

- 22/tcp for SSH
- 80/tcp for HTTP
- 443/tcp for HTTPS

Use SSH keys, disable root password login, enable unattended security upgrades, and keep a firewall on.

## First server setup

Install Docker and the Compose plugin on the VPS, then copy or clone the Math Woods project into `/opt/math-woods`.

You can use the setup helper as root:

```sh
sudo sh deploy/setup-ubuntu-vps.sh
```

Reconnect over SSH after the script finishes so Docker group membership applies.

Create the production environment file:

```sh
cp .env.production.example .env.production
nano .env.production
```

Set real values for:

- `APP_DOMAIN`
- `APP_URL`
- `STATUS_DOMAIN`
- `LETSENCRYPT_EMAIL`
- `AUTH_SECRET`
- `POSTGRES_PASSWORD`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_AUTH_REQUIRED`

For an Infomaniak mailbox such as `contact@APP_DOMAIN`, use:

```env
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=465
SMTP_USER=contact@APP_DOMAIN
SMTP_PASSWORD=the-mailbox-password
SMTP_FROM="Math Woods <contact@APP_DOMAIN>"
SMTP_SECURE=1
SMTP_STARTTLS=0
SMTP_AUTH_REQUIRED=1
```

Generate secrets with commands like:

```sh
openssl rand -base64 48
```

Point DNS records at the VPS public IP:

```text
mathwoods.example          A     VPS_IP
status.mathwoods.example   A     VPS_IP
```

## Deploy

Build the images:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml build
```

Start Postgres and Valkey first:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml up -d postgres valkey
```

Run Prisma migrations:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml run --rm migrate
```

Start the public stack:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml up -d app uptime-kuma caddy
```

In Uptime Kuma, monitor `https://APP_DOMAIN/api/health`.

Before opening registration to the public, configure SMTP with the mailbox for `contact@APP_DOMAIN`.
New users must verify their email address before they can create or edit public content.

Watch logs:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml logs -f app caddy
```

## Backups

Create a local compressed Postgres dump:

```sh
sh deploy/backup-postgres.sh
```

Add it to cron:

```cron
17 3 * * * cd /opt/math-woods && sh deploy/backup-postgres.sh >/var/log/math-woods-backup.log 2>&1
```

Local VPS backups are not enough. Sync `backups/postgres` to an external target such as Infomaniak Swiss Backup, S3-compatible storage, or another machine with `restic`, `rclone`, or `rsync`.
Keep at least one restore-tested backup outside the VPS before inviting contributors.

Math Woods ships a small offsite sync helper:

```sh
sh deploy/sync-backups-offsite.sh
```

It supports either:

```env
OFFSITE_BACKUP_TARGET=user@backup-host:/remote/path
```

or:

```env
OFFSITE_BACKUP_RCLONE_REMOTE=remote:path
```

After testing the command manually, enable offsite sync during every deploy backup:

```env
SYNC_OFFSITE_BACKUPS=1
```

A reasonable cron setup is:

```cron
17 3 * * * cd /opt/math-woods && sh deploy/backup-postgres.sh >/var/log/math-woods-backup.log 2>&1
27 3 * * * cd /opt/math-woods && SKIP_LOCAL_BACKUP=1 sh deploy/sync-backups-offsite.sh >/var/log/math-woods-offsite-backup.log 2>&1
```

Contribution request reminders are sent by the app through a protected cron endpoint. Add `CRON_SECRET` to
`.env.production`, then run the reminder script once per morning:

```cron
CRON_TZ=Europe/Paris
0 8 * * * cd /opt/math-woods && sh deploy/run-daily-reminders.sh >/var/log/math-woods-daily-reminders.log 2>&1
```

## Updating Math Woods

After changing the code:

```sh
sh deploy/deploy.sh
```

This creates a Postgres backup first, rebuilds the app image, runs Prisma migrations, restarts the public services, and checks `/api/health`.

## Restore drill

Do a restore test before inviting real users. A backup is only real after a restore has been tested.

```sh
sh deploy/restore-postgres.sh backups/postgres/math_woods_YYYYMMDDTHHMMSSZ.dump.gz
```

Use `deploy/LAUNCH_CHECKLIST.md` as the final preflight checklist.
