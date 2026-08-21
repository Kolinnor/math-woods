export const OBSERVABILITY_RANGES = ["24h", "7d", "30d"] as const;
export type ObservabilityRange = (typeof OBSERVABILITY_RANGES)[number];

export type ObservabilityPoint = {
  timestamp: number;
  value: number;
};

export type ObservabilityChart = {
  key: string;
  title: string;
  unit: "%" | "ms" | "req/s" | "MiB";
  warningAt?: number;
  dangerAt?: number;
  points: ObservabilityPoint[];
};

export type ObservabilityAlert = {
  name: string;
  severity: string;
  summary: string;
  activeAt: string | null;
};

export type ObservabilityTarget = {
  job: string;
  up: boolean;
};

export type SlowRoute = {
  route: string;
  device: string;
  lcpMs: number;
};

export type WebVitalQuality = {
  name: string;
  device: string;
  poorPercent: number;
  reports: number;
};

export type ObservabilityDashboard = {
  available: boolean;
  message?: string;
  charts: ObservabilityChart[];
  alerts: ObservabilityAlert[];
  targets: ObservabilityTarget[];
  slowRoutes: SlowRoute[];
  webVitalQuality: WebVitalQuality[];
};

type PrometheusMatrixResult = {
  metric: Record<string, string>;
  values: Array<[number, string]>;
};

type PrometheusVectorResult = {
  metric: Record<string, string>;
  value: [number, string];
};

type PrometheusEnvelope<T> = {
  status: string;
  data: T;
  error?: string;
};

type PrometheusQueryData<T> = {
  result: T[];
};

const RANGE_CONFIG: Record<ObservabilityRange, { seconds: number; step: number }> = {
  "24h": { seconds: 24 * 60 * 60, step: 5 * 60 },
  "7d": { seconds: 7 * 24 * 60 * 60, step: 30 * 60 },
  "30d": { seconds: 30 * 24 * 60 * 60, step: 2 * 60 * 60 }
};

const CHART_QUERIES: Array<Omit<ObservabilityChart, "points"> & { query: string }> = [
  {
    key: "cpu",
    title: "CPU",
    unit: "%",
    warningAt: 75,
    dangerAt: 90,
    query: "100 * (1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])))"
  },
  {
    key: "memory",
    title: "Memory",
    unit: "%",
    warningAt: 80,
    dangerAt: 90,
    query: "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)"
  },
  {
    key: "disk",
    title: "Disk",
    unit: "%",
    warningAt: 80,
    dangerAt: 90,
    query: "100 * (1 - node_filesystem_avail_bytes{mountpoint=\"/\"} / node_filesystem_size_bytes{mountpoint=\"/\"})"
  },
  {
    key: "app-memory",
    title: "App memory",
    unit: "MiB",
    warningAt: 2048,
    dangerAt: 4096,
    query: "sum(container_memory_working_set_bytes{container_label_com_docker_compose_service=\"app\"}) / 1024 / 1024"
  },
  {
    key: "requests",
    title: "Traffic",
    unit: "req/s",
    query: "sum(rate(caddy_http_requests_total{handler=\"reverse_proxy\"}[5m]))"
  },
  {
    key: "latency",
    title: "HTTP p95",
    unit: "ms",
    warningAt: 700,
    dangerAt: 1000,
    query: "1000 * histogram_quantile(0.95, sum(rate(caddy_http_request_duration_seconds_bucket{handler=\"reverse_proxy\"}[5m])) by (le))"
  },
  {
    key: "errors",
    title: "5xx errors",
    unit: "req/s",
    warningAt: 0.02,
    dangerAt: 0.1,
    query: "sum(rate(caddy_http_requests_total{handler=\"reverse_proxy\",code=~\"5..\"}[5m]))"
  }
];

export function parseObservabilityRange(value: unknown): ObservabilityRange {
  return OBSERVABILITY_RANGES.includes(value as ObservabilityRange)
    ? value as ObservabilityRange
    : "24h";
}

function prometheusBaseUrl() {
  return process.env.OBSERVABILITY_PROMETHEUS_URL?.trim().replace(/\/$/, "") ?? "";
}

async function prometheusFetch<T>(path: string, params: Record<string, string>) {
  const baseUrl = prometheusBaseUrl();
  if (!baseUrl) throw new Error("Performance history is not configured in this environment.");
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(4_000)
  });
  if (!response.ok) throw new Error(`Prometheus returned ${response.status}.`);
  const payload = await response.json() as PrometheusEnvelope<T>;
  if (payload.status !== "success") throw new Error(payload.error || "Prometheus query failed.");
  return payload.data;
}

async function queryRange(query: string, range: ObservabilityRange) {
  const config = RANGE_CONFIG[range];
  const end = Math.floor(Date.now() / 1000);
  const data = await prometheusFetch<PrometheusQueryData<PrometheusMatrixResult>>(
    "/api/v1/query_range",
    {
      query,
      start: String(end - config.seconds),
      end: String(end),
      step: String(config.step)
    }
  );
  return (data.result[0]?.values ?? []).flatMap(([timestamp, rawValue]) => {
    const value = Number(rawValue);
    return Number.isFinite(value) ? [{ timestamp, value }] : [];
  });
}

async function queryVector(query: string) {
  const data = await prometheusFetch<PrometheusQueryData<PrometheusVectorResult>>(
    "/api/v1/query",
    { query }
  );
  return data.result;
}

async function loadAlerts() {
  const data = await prometheusFetch<{
    alerts: Array<{
      labels: Record<string, string>;
      annotations: Record<string, string>;
      activeAt?: string;
    }>;
  }>("/api/v1/alerts", {});
  return data.alerts.map((alert) => ({
    name: alert.labels.alertname ?? "Alert",
    severity: alert.labels.severity ?? "warning",
    summary: alert.annotations.summary ?? alert.labels.alertname ?? "Active alert",
    activeAt: alert.activeAt ?? null
  }));
}

async function loadTargets() {
  const results = await queryVector("up");
  return results
    .map((result) => ({ job: result.metric.job ?? result.metric.instance ?? "unknown", up: Number(result.value[1]) === 1 }))
    .sort((left, right) => left.job.localeCompare(right.job));
}

async function loadSlowRoutes(range: ObservabilityRange) {
  const window = range;
  const results = await queryVector(
    `1000 * topk(8, histogram_quantile(0.75, sum by (le, route, device) (increase(math_woods_web_vital_duration_seconds_bucket{name="LCP"}[${window}]))))`
  );
  return results.flatMap((result) => {
    const lcpMs = Number(result.value[1]);
    if (!Number.isFinite(lcpMs)) return [];
    return [{
      route: result.metric.route ?? "/",
      device: result.metric.device ?? "unknown",
      lcpMs
    }];
  }).sort((left, right) => right.lcpMs - left.lcpMs);
}

async function loadWebVitalQuality(range: ObservabilityRange) {
  const totalQuery = `sum by (name, device) (increase(math_woods_web_vital_reports_total[${range}]))`;
  const poorQuery = `sum by (name, device) (increase(math_woods_web_vital_reports_total{rating="poor"}[${range}]))`;
  const [totals, poor] = await Promise.all([queryVector(totalQuery), queryVector(poorQuery)]);
  const poorByKey = new Map(poor.map((item) => [
    `${item.metric.name}:${item.metric.device}`,
    Number(item.value[1])
  ]));
  return totals.flatMap((item) => {
    const reports = Number(item.value[1]);
    if (!Number.isFinite(reports) || reports <= 0) return [];
    const name = item.metric.name ?? "unknown";
    const device = item.metric.device ?? "unknown";
    const poorReports = poorByKey.get(`${name}:${device}`) ?? 0;
    return [{ name, device, reports, poorPercent: 100 * poorReports / reports }];
  }).sort((left, right) => left.name.localeCompare(right.name) || left.device.localeCompare(right.device));
}

export async function loadObservabilityDashboard(range: ObservabilityRange): Promise<ObservabilityDashboard> {
  try {
    const [chartPoints, alerts, targets, slowRoutes, webVitalQuality] = await Promise.all([
      Promise.all(CHART_QUERIES.map((chart) => queryRange(chart.query, range))),
      loadAlerts(),
      loadTargets(),
      loadSlowRoutes(range),
      loadWebVitalQuality(range)
    ]);
    return {
      available: true,
      charts: CHART_QUERIES.map(({ query: _query, ...chart }, index) => ({
        ...chart,
        points: chartPoints[index] ?? []
      })),
      alerts,
      targets,
      slowRoutes,
      webVitalQuality
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : "Performance history is unavailable.",
      charts: [],
      alerts: [],
      targets: [],
      slowRoutes: [],
      webVitalQuality: []
    };
  }
}
