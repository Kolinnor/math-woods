"use client";

import { useEffect } from "react";

type ErrorReportInput = {
  message: string;
  stack?: string | null;
  digest?: string | null;
  source: string;
  path?: string;
};

const sentReports = new Set<string>();

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function errorStack(reason: unknown) {
  return reason instanceof Error ? reason.stack : null;
}

function reportKey(report: ErrorReportInput) {
  return [report.source, report.path, report.message, report.digest, report.stack?.slice(0, 240)].join("|");
}

export function reportClientError(input: ErrorReportInput) {
  if (!input.message.trim()) return;

  const report = {
    ...input,
    path: input.path ?? `${window.location.pathname}${window.location.search}`
  };
  const key = reportKey(report);
  if (sentReports.has(key)) return;
  sentReports.add(key);

  const payload = JSON.stringify(report);

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/api/error-reports", new Blob([payload], { type: "application/json" }));
    if (sent) return;
  }

  void fetch("/api/error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {
    sentReports.delete(key);
  });
}

export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError({
        message: event.message || errorMessage(event.error),
        stack: event.error instanceof Error ? event.error.stack : null,
        source: "window.error"
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError({
        message: errorMessage(event.reason),
        stack: errorStack(event.reason),
        source: "unhandledrejection"
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
