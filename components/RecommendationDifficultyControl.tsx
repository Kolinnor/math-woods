"use client";

import { ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecommendationDifficultyControl({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function requestEasier() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/recommendations/easier", { method: "POST" });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="recommendation-easier-button"
      disabled={pending}
      onClick={requestEasier}
    >
      <ArrowDown size={15} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
