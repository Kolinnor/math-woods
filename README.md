# Math Woods

Next.js prototype for an open-source math problem site inspired by lichess, Obsidian, and Math StackExchange.

Math Woods' core promise is to remain 100% free and free of advertising. Application code is licensed under
GNU AGPL-3.0-or-later. Educational content defaults to CC BY-NC-SA 4.0 unless otherwise stated.

Math Woods was coded with help from Codex, an AI coding agent by OpenAI, under human direction and review. The
published site remains a human responsibility.

## Implemented Features

- Email/password authentication with PBKDF2 password hashes and database-backed session tokens.
- Email verification before public contributions.
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
- Discussion posts behind an explicit reveal action on problem pages.
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
- Rate limiting for auth, public contributions, reports, imports, voting, and moderation actions.
- PostgreSQL Prisma schema for the MVP entities.

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

Demo moderator account:

- Email: `curator@example.com`
- Password: `curator-demo`

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

These tests cover slugs, wikilinks, and core problem-solving flows.

## Low-Cost Production Deploy

The Infomaniak/VPS deployment path is documented in `deploy/INFOMANIAK.md`.
It runs Math Woods on one Docker host with Next.js, PostgreSQL, Valkey rate limiting, Caddy HTTPS, Uptime Kuma, and a Postgres backup script.

## Repository and Remotes

This repository is the active Math Woods codebase. Older "math-garden" names or clones may exist, but current work
should happen here.

- `origin`: VPS bare repository at `ubuntu@37.156.45.153:~/git/math-woods.git`.
- `github`: public GitHub repository at `https://github.com/Kolinnor/math-woods.git`.

Important provenance tags:

- `vps-origin-2026-06-10`: original VPS snapshot from June 10, 2026.
- `public-origin-2026-06-27`: public release state pushed to GitHub on June 27, 2026.

## Notes

Authentication is still intentionally lightweight for this first prototype. The natural next step is password reset and stronger production-grade rate limiting.

For production, set `AUTH_SECRET` to a unique random value of at least 32 characters. The app refuses to use the local-development placeholder when `NODE_ENV=production`.

Before public registration is opened, configure SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_AUTH_REQUIRED=1`) so users can verify their email addresses.
Before inviting contributors, copy Postgres backups outside the VPS with `deploy/sync-backups-offsite.sh` and test at least one restore.
