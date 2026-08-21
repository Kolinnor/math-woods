# Math Woods observability

Math Woods keeps a private, owner-only performance history so a report such as "the site lagged on mobile" can be checked against server and browser measurements from the same period.

## Architecture

- **Prometheus** stores 30 days of time series, capped at 2 GB.
- **node-exporter** measures host CPU, memory, filesystems, and network activity.
- **cAdvisor** measures Docker container CPU and memory.
- **Caddy metrics** provide aggregate HTTP request counts, response codes, and request-duration histograms.
- **Math Woods Web Vitals** provide browser LCP, INP, CLS, FCP, and TTFB grouped by normalized route and broad mobile/desktop category.
- `/moderation/performance` queries Prometheus through the internal Docker network and is protected by `requireOwner()`.

Prometheus, node-exporter, and cAdvisor only use Docker `expose`; they publish no host port. Caddy rejects public requests to `/api/internal/metrics` before they reach Next.js.

## Privacy and cardinality

Browser reports contain only:

- the Web Vital name, value, and rating;
- `mobile` or `desktop`;
- a normalized route such as `/problems/[slug]`.

They contain no account identifier, content slug, profile name, user-agent, cookie, or persistent IP address. The short-lived Valkey rate-limit key is a SHA-256 digest and is not part of the metrics history.

Do not add raw paths, usernames, user IDs, IP addresses, query strings, or error messages as Prometheus labels. Unbounded labels can leak information and make the time-series database grow without limit.

## Retention and disk safety

Prometheus is limited by both:

- `--storage.tsdb.retention.time=30d`
- `--storage.tsdb.retention.size=2GB`

The deployment script also removes Docker build cache older than seven days after the new application passes its health check. It does not remove images, running containers, volumes, database backups, or current build cache.

## Alerts

Prometheus evaluates these rules every 15 seconds:

- a metrics target is unavailable for 5 minutes;
- host CPU exceeds 90% for 10 minutes;
- available memory falls below 10% for 10 minutes;
- root disk usage exceeds 85% for 15 minutes;
- sustained HTTP 5xx responses exceed 0.1 requests/second for 5 minutes;
- HTTP p95 latency exceeds one second for 10 minutes.

Active alerts are visible at the top of `/moderation/performance`. There is no external Alertmanager yet, so the owner dashboard is the notification surface for these rules.

## Investigating a mobile lag report

Ask for the approximate time, page type, action, device/browser, and connection type. Do not ask for an IP address.

1. Open `/moderation/performance` and select `24h`, `7d`, or `30d`.
2. Check active alerts and collector status.
3. Compare CPU, memory, disk, app memory, HTTP p95, traffic, and 5xx errors around that period.
4. Check the mobile LCP route table and poor Web Vital percentages.
5. If server metrics are calm but LCP or INP is poor, investigate page weight, JavaScript, images, JSXGraph, or the user interaction itself.
6. If HTTP p95 rises with CPU or memory pressure, inspect database queries and container logs for the same period.

## Operational checks

Validate the configuration:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml config --quiet
docker compose --env-file .env.production -f docker-compose.infomaniak.yml exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose --env-file .env.production -f docker-compose.infomaniak.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile
```

Check scrape targets from the internal network:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml exec -T app \
  node -e "fetch('http://prometheus:9090/api/v1/query?query=up').then(r => r.text()).then(console.log)"
```

Inspect service state without exposing metrics ports:

```sh
docker compose --env-file .env.production -f docker-compose.infomaniak.yml ps
docker compose --env-file .env.production -f docker-compose.infomaniak.yml logs --since=30m prometheus node-exporter cadvisor caddy app
```

Metrics begin accumulating only after the observability stack is first deployed. Browser tables can remain empty until visitors load pages and their Web Vitals finish reporting.
