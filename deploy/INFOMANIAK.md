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
- `STATUS_DOMAIN`
- `LETSENCRYPT_EMAIL`
- `AUTH_SECRET`
- `POSTGRES_PASSWORD`

Generate secrets with commands like:

```sh
openssl rand -base64 48
```

For `POSTGRES_PASSWORD`, use URL-safe characters:

```sh
openssl rand -hex 32
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

As an immediate off-server copy from your Windows machine:

```powershell
.\deploy\pull-backups.ps1
```

If PowerShell blocks local scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\pull-backups.ps1
```

This downloads the VPS dumps into `backups/postgres` on your local machine. Run it after important content changes, and at least once a week until a fully automated external backup is configured.

## Updating Math Woods

After changing the code:

```sh
sh deploy/deploy.sh
```

This creates a Postgres backup first, rebuilds the app image, runs Prisma migrations, restarts the public services, and checks `/api/health`.

## Restore drill

Do a restore test before inviting real users. A backup is only real after a restore has been tested.

Test the latest backup in an isolated disposable Postgres container:

```sh
sh deploy/restore-test.sh
```

Restore a backup into the production Postgres service only when you intentionally need to recover data:

```sh
sh deploy/restore-postgres.sh backups/postgres/math_woods_YYYYMMDDTHHMMSSZ.dump.gz
```

Use `deploy/LAUNCH_CHECKLIST.md` as the final preflight checklist.
