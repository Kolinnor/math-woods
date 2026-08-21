"use client";

import { useReportWebVitals } from "next/web-vitals";
import { normalizedObservabilityRoute } from "@/lib/observability-routes";

type ReportableMetric = {
  name: string;
  rating: string;
  value: number;
};

function reportMetric(metric: ReportableMetric) {
  const payload = JSON.stringify({
    name: metric.name,
    rating: metric.rating,
    value: metric.value,
    route: normalizedObservabilityRoute(window.location.pathname),
    device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop"
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/web-vitals", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/web-vitals", {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true
  });
}

export function WebVitalsReporter() {
  useReportWebVitals(reportMetric);
  return null;
}
