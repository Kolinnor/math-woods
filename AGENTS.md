# Notes for Codex Agents

This is the active Math Woods project.

## Local project

- Work in this directory: `C:\Users\matth\Documents\Codex\math-woods\stage`
- Do not look for a separate "math-garden" repository unless explicitly asked. Old names or older clones may exist, but this repository is the current Math Woods codebase.

## Git remotes

- `origin`: VPS bare repository at `ubuntu@37.156.45.153:~/git/math-woods.git`
- `github`: public GitHub repository at `https://github.com/Kolinnor/math-woods.git`

When committing project changes, usually push to both:

```powershell
git push origin main --tags
git push github main --tags
```

Important existing tags:

- `vps-origin-2026-06-10`: original VPS snapshot from June 10, 2026.
- `public-origin-2026-06-27`: public release state pushed to GitHub on June 27, 2026.

## Deployment reminder

Production runs on the Infomaniak VPS:

- Host: `ubuntu@37.156.45.153`
- Directory: `/opt/math-woods`
- Health check: `curl -fsS https://mathwoods.org/api/health`

Normal local verification before deploy:

```powershell
npm.cmd run deploy:prepare
```

This exports the public FR/EN contributor guide from production, merges site edits into
`content/guides/concepts/*.md`, then runs TypeScript, core tests and the build.
Run it BEFORE presenting the deployment commit for approval. Review the Markdown and
`site-snapshot.json` diff together; never edit the snapshot manually or bypass a conflict.
See `docs/concept-guide-sync.md` for conflict resolution and offline checks.

Always show the exact commit message and wait for the user's validation before committing.
Deploy only on explicit request. The user has explicitly authorized publication of the
code to the public GitHub remote alongside each deployment; push to both remotes then.

Normal deployment archive excludes `.next`, `node_modules`, `.git`, `backups`, and `.env.production`.
Never overwrite the server `.env.production`, and never delete backups.

## Editor regression log

Before changing Markdown/LaTeX editor behavior, read `docs/editor-regressions.md`.
After fixing a new editor regression, add a short dated note there describing the symptom, the root cause, and the guardrail that should prevent the bug from returning.
