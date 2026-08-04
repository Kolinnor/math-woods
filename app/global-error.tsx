"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";
import { SiteErrorPage } from "@/components/SiteErrorPage";
import "./globals.css";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message || "Global application error",
      stack: error.stack,
      digest: error.digest,
      source: "next.global-error-boundary"
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="site-main">
          <SiteErrorPage
            code="Math Woods"
            title="The forest is temporarily unavailable."
            message="The error has been reported. Please try again; if the server is being restarted, this should only last a minute."
            onRetry={reset}
          />
        </main>
      </body>
    </html>
  );
}
