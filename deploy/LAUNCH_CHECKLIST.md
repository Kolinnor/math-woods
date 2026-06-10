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
- `AUTH_SECRET` is unique and at least 32 characters.
- `POSTGRES_PASSWORD` is long, random, and URL-safe. `openssl rand -hex 32` is a good default.
- The demo seed is not run in production. The seed script refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is explicitly set.

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
- For Math Woods, a Codex hourly external check monitors `https://mathwoods.org/api/health`.

## Backups

- `sh deploy/backup-postgres.sh` creates a backup.
- Backups are copied outside the VPS.
- `sh deploy/restore-postgres.sh <backup>` has been tested on a disposable instance or fresh database.
- `sh deploy/restore-test.sh` verifies the latest backup in an isolated temporary Postgres container.

## Public opening

- Create your own admin/moderator account.
- Verify public docs and login pages do not expose demo credentials.
- Try registration, login, creating a problem, creating a concept, and posting a report.
- Watch logs during the first public announcement.

## Live changes

- Content changes happen directly in Math Woods and are stored in Postgres.
- Code changes are deployed with `sh deploy/deploy.sh`.
- Avoid schema changes during heavy traffic until backups and restore have been tested.
