"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";
import { SiteErrorPage } from "@/components/SiteErrorPage";
import { chunkLoadErrorSignature, isChunkLoadError } from "@/lib/chunk-load-error";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      const reloadKey = `math-woods:chunk-reload:${window.location.pathname}:${chunkLoadErrorSignature(error)}`;
      if (sessionStorage.getItem(reloadKey) !== "1") {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return;
      }
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
