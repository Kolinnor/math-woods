"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";
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
    <div className="mx-auto grid max-w-2xl gap-4">
      <section className="panel p-5">
        <h1 className="text-xl font-semibold">Something went wrong.</h1>
        <p className="muted mt-2">
          The error has been reported to the Math Woods maintainers. You can try again without losing the page.
        </p>
        <button type="button" className="mt-4" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
