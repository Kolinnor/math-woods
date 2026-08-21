import type { ObservabilityChart as ObservabilityChartData } from "@/lib/observability-dashboard";

const WIDTH = 640;
const HEIGHT = 168;
const PADDING = 12;

function formattedValue(value: number, unit: ObservabilityChartData["unit"]) {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "MiB") return `${Math.round(value)} MiB`;
  return `${value.toFixed(value < 1 ? 3 : 1)} req/s`;
}

function chartTone(chart: ObservabilityChartData, value: number) {
  if (chart.dangerAt !== undefined && value >= chart.dangerAt) return "danger";
  if (chart.warningAt !== undefined && value >= chart.warningAt) return "warning";
  return "healthy";
}

export function ObservabilityChart({ chart, noDataLabel }: { chart: ObservabilityChartData; noDataLabel: string }) {
  const values = chart.points.map((point) => point.value);
  const current = values.at(-1);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const spread = Math.max(max - min, Math.abs(max) * 0.05, 1);
  const points = chart.points.map((point, index) => {
    const x = PADDING + index * (WIDTH - 2 * PADDING) / Math.max(1, chart.points.length - 1);
    const y = HEIGHT - PADDING - (point.value - min) / spread * (HEIGHT - 2 * PADDING);
    return `${x.toFixed(1)},${Math.max(PADDING, Math.min(HEIGHT - PADDING, y)).toFixed(1)}`;
  }).join(" ");

  return (
    <article className={`observability-card observability-${current === undefined ? "empty" : chartTone(chart, current)}`}>
      <header>
        <h2>{chart.title}</h2>
        <strong>{current === undefined ? "—" : formattedValue(current, chart.unit)}</strong>
      </header>
      {points ? (
        <svg
          className="observability-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${chart.title}: ${current === undefined ? noDataLabel : formattedValue(current, chart.unit)}`}
          preserveAspectRatio="none"
        >
          <line x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING} />
          <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <p className="observability-no-data">{noDataLabel}</p>
      )}
      {values.length > 0 && (
        <footer>
          <span>min {formattedValue(min, chart.unit)}</span>
          <span>max {formattedValue(max, chart.unit)}</span>
        </footer>
      )}
    </article>
  );
}
