"use client";

import Link from "next/link";
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
    <div className="error-page-shell mx-auto grid max-w-2xl gap-4">
      <section className="panel error-page-panel">
        <p className="error-page-kicker">Math Woods</p>
        <h1>You got lost in the forest.</h1>
        <p className="muted">
          A branch snapped somewhere in the application. The error has been reported, and you can try the path again.
        </p>
        <div className="error-page-actions">
          <button type="button" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="button secondary">
            Back home
          </Link>
        </div>
      </section>
    </div>
  );
}
