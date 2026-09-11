"use client";

import { useEffect } from "react";
import { isBrowserExtensionError, isOpaqueWindowScriptError } from "@/lib/client-error-filter";
import { sanitizeReportPath } from "@/lib/security";
import { clientErrorDetails, clientErrorEventStack } from "@/lib/client-error-diagnostics";

type ErrorReportInput = {
  message: string;
  stack?: string | null;
  digest?: string | null;
  source: string;
  path?: string;
};

const sentReports = new Set<string>();

function reportKey(report: ErrorReportInput) {
  return [report.source, report.path, report.message, report.digest, report.stack?.slice(0, 240)].join("|");
}

export function reportClientError(input: ErrorReportInput) {
  if (!input.message.trim()) return;
  if (isBrowserExtensionError({ stack: input.stack })) return;
  if (isOpaqueWindowScriptError(input)) return;

  const report = {
    ...input,
    path: sanitizeReportPath(input.path ?? `${window.location.pathname}${window.location.search}${window.location.hash}`) ?? "/"
  };
  const key = reportKey(report);
  if (sentReports.has(key)) return;
  sentReports.add(key);

  const payload = JSON.stringify(report);

  if (navigator.sendBeacon) {
    try {
      const sent = navigator.sendBeacon("/api/error-reports", new Blob([payload], { type: "application/json" }));
      if (sent) return;
    } catch { /* A blocked beacon should fall back to fetch, not report itself. */ }
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
      const details = clientErrorDetails(event.error);
      if (isOpaqueWindowScriptError({ message: event.message, stack: details.stack, source: "window.error" })) return;
      if (isBrowserExtensionError({
        stack: details.stack,
        sourceUrl: event.filename
      })) {
        return;
      }
      reportClientError({
        message: event.message || details.message,
        stack: clientErrorEventStack(details.stack, event.filename, event.lineno, event.colno),
        source: "window.error"
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError({
        ...clientErrorDetails(event.reason),
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
