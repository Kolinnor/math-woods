# Math Woods

Next.js application for an open-source math problem site inspired by lichess, Obsidian, and Math StackExchange.

Math Woods' core promise is to remain 100% free and free of advertising. Application code is licensed under
GNU AGPL-3.0-or-later. Original public content defaults to CC BY-SA 4.0.

Math Woods was designed and directed by its human creator and implemented in collaboration with Codex, an AI coding
agent by OpenAI, under human review.

## Implemented Features

- Email/password authentication with PBKDF2 password hashes and database-backed session tokens.
- Problem creation and display with Markdown/LaTeX.
- CodeMirror 6 editor for Markdown content.
- Wikilink detection for `[[concept]]` and `[[concept|alias]]`.
- Existing concepts, missing concepts, and backlinks.
- Sourced concept articles with global aliases/redirects and mathematical domains.
- Public article history with attributed edit summaries and rollback.
- Separate editorial talk pages, concept watchlists, and recent changes.
- Global search across concepts, aliases, problems, and playlists.
- Random concept discovery and encyclopedia contribution guidelines.
- `Start this problem` button.
- Discussion locked for 24h after the first attempt.
- Private notes and personal status per user.
- Discussion posts after unlock.
- Playlists, problem insertion by slug, simple votes.
- Problem search and filtering by tag or difficulty.
- Problem domains with category browsing and filtering.
- Expandable problem provenance with approximate origin, chapter, page, and historical notes.
- Dark theme and a focused zen mode for problem statements.
- Solved problems and favorite problems on user profiles.
- Playlist following with personal solved progress.
- Public suggestion box and a Competition placeholder.
- Large About/FAQ policy covering free access, advertising, open source, AI, licensing, attribution, and responsible reformulation.
- Problem tags.
- Problem and concept editing with revision history.
- Rollback from earlier revisions.
- Basic reporting and moderation queue.
- User profiles with editable bios.
- Account settings with password changes and session revocation.
- Typed discussion posts, post votes, and post reports.
- Personal work dashboard at `/me`.
- Markdown export for problems, concepts, and playlists.
- Markdown import for problems and concepts at `/import`.
- Rate limiting for login, registration, reports, and discussion posts, backed by Valkey/Redis in production with an in-memory local fallback.
- PostgreSQL Prisma schema for the core Math Woods entities.

## Local Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:migrate
npm run db:seed
npm run dev
```

Then open `http://localhost:3000`.

## One-Click Launch on Windows

Double-click `Launch Math Woods.vbs` from the project folder. It starts Docker/Postgres if needed, runs the Next dev server in the background, then opens `http://localhost:3000`.

Double-click `Stop Math Woods.vbs` to stop the hidden dev server.

Logs are written to `runtime/launcher.log` and `runtime/next-dev.log`.

If PowerShell blocks `npm`, use `npm.cmd`:

```powershell
npm.cmd run dev
```

## Core Tests

```bash
npm run test:core
```

These tests cover slugs, wikilinks, and the 24h unlock rule.

## Low-Cost Production Deploy

The Infomaniak/VPS deployment path is documented in `deploy/INFOMANIAK.md`.
It runs Math Woods on one Docker host with Next.js, PostgreSQL, Valkey rate limiting, Caddy HTTPS, Uptime Kuma, scheduled Postgres backups, and a restore-test script.

The current live deployment uses `mathwoods.org` on an Infomaniak Public Cloud Ubuntu instance.

Security reporting and current safeguards are documented in `SECURITY.md`.

## Backups and Restore Checks

On the VPS, `deploy/backup-postgres.sh` creates compressed Postgres dumps under `backups/postgres`.
Use `deploy/restore-test.sh` to verify the latest backup in a disposable Postgres container before trusting it.

From a Windows machine, pull off-server copies with:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\pull-backups.ps1
```

## Notes

Authentication currently uses email/password accounts and database-backed sessions. The natural next step is email verification and password reset.

For production, set `AUTH_SECRET` to a unique random value of at least 32 characters. The app refuses to use the local-development placeholder when `NODE_ENV=production`.

Do not run `npm run db:seed` against production. The seed script contains local demo content and refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is explicitly set.
