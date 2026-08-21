import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Server } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ObservabilityChart } from "@/components/ObservabilityChart";
import { requireOwner } from "@/lib/auth";
import { getInterfaceLocale } from "@/lib/i18n/server";
import {
  OBSERVABILITY_RANGES,
  loadObservabilityDashboard,
  parseObservabilityRange
} from "@/lib/observability-dashboard";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Site performance",
    eyebrow: "Owner observability",
    description: "Historical server capacity, HTTP health, and anonymous browser performance.",
    back: "Moderation",
    range: "History range",
    activeAlerts: "Active alerts",
    noAlerts: "No active alert",
    targets: "Collectors",
    browserQuality: "Browser quality",
    slowRoutes: "Slowest LCP routes",
    noBrowserData: "Browser measurements will appear after visitors load the new version.",
    noData: "No data yet",
    unavailable: "Monitoring is not available yet",
    reports: "reports",
    poor: "poor",
    privacy: "Routes are grouped and measurements contain no account identifier, full content slug, or persistent IP address."
  },
  fr: {
    title: "Performances du site",
    eyebrow: "Observabilité owner",
    description: "Historique des capacités du serveur, de la santé HTTP et des performances anonymes des navigateurs.",
    back: "Modération",
    range: "Période",
    activeAlerts: "Alertes actives",
    noAlerts: "Aucune alerte active",
    targets: "Collecteurs",
    browserQuality: "Qualité côté navigateur",
    slowRoutes: "Pages au LCP le plus lent",
    noBrowserData: "Les mesures des navigateurs apparaîtront après les premières visites sur la nouvelle version.",
    noData: "Pas encore de données",
    unavailable: "Le suivi n’est pas encore disponible",
    reports: "mesures",
    poor: "mauvaises",
    privacy: "Les pages sont regroupées et les mesures ne contiennent aucun identifiant de compte, slug complet ou adresse IP persistante."
  }
} as const;

export default async function PerformancePage({
  searchParams
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  await requireOwner();
  const locale = await getInterfaceLocale();
  const t = locale === "fr" ? copy.fr : copy.en;
  const params = searchParams ? await searchParams : {};
  const range = parseObservabilityRange(params.range);
  const dashboard = await loadObservabilityDashboard(range);

  return (
    <ForestPageLayout
      className="observability-page"
      title={t.title}
      eyebrow={t.eyebrow}
      description={t.description}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      actions={<Link href="/moderation" className="button secondary">{t.back}</Link>}
    >
      <nav className="observability-range" aria-label={t.range}>
        <span>{t.range}</span>
        {OBSERVABILITY_RANGES.map((item) => (
          <Link
            key={item}
            href={`/moderation/performance?range=${item}` as never}
            className={item === range ? "active" : ""}
            aria-current={item === range ? "page" : undefined}
          >
            {item}
          </Link>
        ))}
      </nav>

      {!dashboard.available ? (
        <section className="observability-unavailable" role="status">
          <Server size={24} aria-hidden="true" />
          <div>
            <h2>{t.unavailable}</h2>
            <p>{dashboard.message}</p>
          </div>
        </section>
      ) : (
        <>
          <section className="observability-status-band">
            <div>
              <h2><AlertTriangle size={19} aria-hidden="true" /> {t.activeAlerts}</h2>
              {dashboard.alerts.length === 0 ? (
                <p className="observability-ok"><CheckCircle2 size={17} aria-hidden="true" /> {t.noAlerts}</p>
              ) : (
                <div className="observability-alerts">
                  {dashboard.alerts.map((alert) => (
                    <p key={`${alert.name}-${alert.activeAt ?? "active"}`}>
                      <strong>{alert.name}</strong> {alert.summary}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h2><Server size={19} aria-hidden="true" /> {t.targets}</h2>
              <div className="observability-targets">
                {dashboard.targets.map((target) => (
                  <span key={target.job} className={target.up ? "up" : "down"}>
                    <i aria-hidden="true" />{target.job}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="observability-grid" aria-label={t.description}>
            {dashboard.charts.map((chart) => (
              <ObservabilityChart key={chart.key} chart={chart} noDataLabel={t.noData} />
            ))}
          </section>

          <section className="observability-browser-section">
            <header>
              <Activity size={20} aria-hidden="true" />
              <div>
                <h2>{t.browserQuality}</h2>
                <p>{t.privacy}</p>
              </div>
            </header>
            {dashboard.webVitalQuality.length > 0 ? (
              <div className="observability-table-wrap">
                <table>
                  <thead><tr><th>Metric</th><th>Device</th><th>{t.reports}</th><th>{t.poor}</th></tr></thead>
                  <tbody>
                    {dashboard.webVitalQuality.map((item) => (
                      <tr key={`${item.name}-${item.device}`}>
                        <th>{item.name}</th>
                        <td>{item.device}</td>
                        <td>{Math.round(item.reports)}</td>
                        <td>{item.poorPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="observability-no-browser-data">{t.noBrowserData}</p>}

            <h3>{t.slowRoutes}</h3>
            {dashboard.slowRoutes.length > 0 ? (
              <div className="observability-slow-routes">
                {dashboard.slowRoutes.map((item) => (
                  <div key={`${item.route}-${item.device}`}>
                    <code>{item.route}</code>
                    <span>{item.device}</span>
                    <strong>{Math.round(item.lcpMs)} ms</strong>
                  </div>
                ))}
              </div>
            ) : <p className="observability-no-browser-data">{t.noBrowserData}</p>}
          </section>
        </>
      )}
    </ForestPageLayout>
  );
}
