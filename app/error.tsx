"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";
import { SiteErrorPage } from "@/components/SiteErrorPage";
import {
  clientBundleErrorSignature,
  shouldReloadForClientBundleError
} from "@/lib/chunk-load-error";

export default function AppError({
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
      message: error.message || "Application error",
      stack: error.stack,
      digest: error.digest,
      source: "next.error-boundary"
    });
  }, [error]);

  return (
    <SiteErrorPage
      code="Math Woods"
      title="You got lost in the forest."
      message="We could not load this path. The error has been reported. If Math Woods is being restarted, this should only last a minute."
      french={{
        title: "Vous vous êtes perdu dans la forêt.",
        message: "Cette page n’a pas pu être chargée. L’erreur a été signalée. Si Math Woods redémarre, cela ne devrait durer qu’une minute."
      }}
      onRetry={reset}
    />
  );
}
