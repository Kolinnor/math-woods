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
npx.cmd tsc --noEmit
npm.cmd run test:core
npm.cmd run build
```

Normal deployment archive excludes `.next`, `node_modules`, `.git`, `backups`, and `.env.production`.
Never overwrite the server `.env.production`, and never delete backups.

## Editor regression log

Before changing Markdown/LaTeX editor behavior, read `docs/editor-regressions.md`.
After fixing a new editor regression, add a short dated note there describing the symptom, the root cause, and the guardrail that should prevent the bug from returning.
