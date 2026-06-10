# Security Policy

## Reporting a vulnerability

Please report suspected security issues privately by email:

```text
contact@mathwoods.org
```

Do not open a public issue containing exploit details, private user data, tokens, logs with secrets, or database dumps.

## Production safeguards

- Production sessions require a unique `AUTH_SECRET` of at least 32 characters.
- The app refuses known development placeholder secrets when `NODE_ENV=production`.
- Rate limiting uses Valkey/Redis in production and falls back to memory only when Redis is not configured.
- Public traffic is served through Caddy with HTTPS and basic security headers.
- Postgres backups are created on the server and should be copied off-server regularly.
- Demo seed data is blocked in production unless `ALLOW_DEMO_SEED=true` is explicitly set.

## Known gaps

- Email verification is not implemented yet.
- Password reset is not implemented yet.
- Uptime monitoring should include at least one check outside the production VPS.
