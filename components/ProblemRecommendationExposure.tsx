"use client";

import { useEffect } from "react";

export function ProblemRecommendationExposure({ problemId }: { problemId: number }) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/problems/${problemId}/recommendation-exposure`, {
      method: "POST",
      signal: controller.signal
    }).catch(() => undefined);
    return () => controller.abort();
  }, [problemId]);

  return null;
}
