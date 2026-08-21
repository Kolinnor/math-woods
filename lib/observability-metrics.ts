import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const WEB_VITAL_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
export const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;
export const WEB_VITAL_DEVICES = ["mobile", "desktop"] as const;

export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];
export type WebVitalRating = (typeof WEB_VITAL_RATINGS)[number];
export type WebVitalDevice = (typeof WEB_VITAL_DEVICES)[number];

type MetricsBundle = {
  registry: Registry;
  reports: Counter<"name" | "route" | "device" | "rating">;
  duration: Histogram<"name" | "route" | "device" | "rating">;
  layoutShift: Histogram<"route" | "device" | "rating">;
};

const globalMetrics = globalThis as typeof globalThis & {
  mathWoodsMetrics?: MetricsBundle;
};

function createMetrics(): MetricsBundle {
  const registry = new Registry();
  collectDefaultMetrics({ prefix: "math_woods_process_", register: registry });

  const reports = new Counter({
    name: "math_woods_web_vital_reports_total",
    help: "Anonymous browser Web Vital reports received by Math Woods.",
    labelNames: ["name", "route", "device", "rating"],
    registers: [registry]
  });
  const duration = new Histogram({
    name: "math_woods_web_vital_duration_seconds",
    help: "Browser Web Vital durations in seconds, excluding CLS.",
    labelNames: ["name", "route", "device", "rating"],
    buckets: [0.05, 0.1, 0.2, 0.5, 0.8, 1, 1.5, 2, 2.5, 4, 6, 10, 20, 40],
    registers: [registry]
  });
  const layoutShift = new Histogram({
    name: "math_woods_web_vital_cls",
    help: "Browser cumulative layout shift values.",
    labelNames: ["route", "device", "rating"],
    buckets: [0.01, 0.03, 0.05, 0.1, 0.15, 0.25, 0.4, 0.75, 1, 2],
    registers: [registry]
  });

  return { registry, reports, duration, layoutShift };
}

export function observabilityMetrics() {
  globalMetrics.mathWoodsMetrics ??= createMetrics();
  return globalMetrics.mathWoodsMetrics;
}

export function recordWebVital(input: {
  name: WebVitalName;
  route: string;
  device: WebVitalDevice;
  rating: WebVitalRating;
  value: number;
}) {
  const metrics = observabilityMetrics();
  const labels = {
    name: input.name,
    route: input.route,
    device: input.device,
    rating: input.rating
  };
  metrics.reports.inc(labels);

  if (input.name === "CLS") {
    metrics.layoutShift.observe(
      { route: input.route, device: input.device, rating: input.rating },
      input.value
    );
    return;
  }

  metrics.duration.observe(labels, input.value / 1000);
}
