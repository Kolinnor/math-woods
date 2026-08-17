"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";
import { SiteErrorPage } from "@/components/SiteErrorPage";
import {
  clientBundleErrorSignature,
  shouldReloadForClientBundleError
} from "@/lib/chunk-load-error";
import "./globals.css";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const reloadKey = `math-woods:chunk-reload:${window.location.pathname}:${clientBundleErrorSignature(error)}`;
      if (shouldReloadForClientBundleError(error, sessionStorage.getItem(reloadKey))) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
        return;
      }
    } catch {
      // Continue to error reporting when storage or navigation is unavailable.
    }

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
            french={{
              title: "La forêt est temporairement indisponible.",
              message: "L’erreur a été signalée. Veuillez réessayer ; si le serveur redémarre, cela ne devrait durer qu’une minute."
            }}
            onRetry={reset}
          />
        </main>
      </body>
    </html>
  );
}
