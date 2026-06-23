# Math Woods launch checklist

## Before buying the VPS

- Pick the public domain, for example `mathwoods.example`.
- Pick the status domain, for example `status.mathwoods.example`.
- Pick the admin email for Let's Encrypt and operational alerts.
- Pick the external backup destination. Local VPS backups are not enough.

## Infomaniak VPS

- Ubuntu 24.04 LTS.
- Start around 4 vCPU, 8 GB RAM, 50 GB disk.
- SSH key login works.
- Root password login is disabled.
- Firewall exposes only 22, 80, and 443.

## DNS

- `APP_DOMAIN` has an `A` record to the VPS public IP.
- `STATUS_DOMAIN` has an `A` record to the VPS public IP.
- Wait for DNS propagation before starting Caddy.

## Secrets

- `.env.production` exists and is not committed.
- `APP_URL` is set to the public HTTPS origin.
- `AUTH_SECRET` is unique and at least 32 characters.
- `POSTGRES_PASSWORD` is long and random.
- SMTP is configured for outgoing verification emails, including `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_AUTH_REQUIRED=1`.
- New account creation has been tested with a real received verification email.
- The example/demo seed is not run in production.

## First deploy

- `docker compose --env-file .env.production -f docker-compose.infomaniak.yml build`
- `docker compose --env-file .env.production -f docker-compose.infomaniak.yml up -d postgres valkey`
- `docker compose --env-file .env.production -f docker-compose.infomaniak.yml run --rm migrate`
- `docker compose --env-file .env.production -f docker-compose.infomaniak.yml up -d app uptime-kuma caddy`
- `https://APP_DOMAIN/api/health` returns `{ "ok": true }`.

## Monitoring

- Uptime Kuma has an admin password.
- Uptime Kuma monitors `https://APP_DOMAIN/api/health`.
- Add one external uptime check outside the VPS.

## Backups

- `sh deploy/backup-postgres.sh` creates a backup.
- Local backup cron is installed.
- Backups are copied outside the VPS with `deploy/sync-backups-offsite.sh`.
- `sh deploy/restore-postgres.sh <backup>` has been tested on a disposable instance or fresh database.

## Public opening

- Create your own admin/moderator account.
- Register a test account and verify its email from the received email.
- Confirm an unverified account cannot create or edit public content.
- Remove demo credentials from public docs if they are not needed.
- Try registration, login, creating a problem, creating a concept, and posting a report.
- Watch logs during the first public announcement.

## Live changes

- Content changes happen directly in Math Woods and are stored in Postgres.
- Code changes are deployed with `sh deploy/deploy.sh`.
- Avoid schema changes during heavy traffic until backups and restore have been tested.
