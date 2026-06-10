"use client";

import { useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";

export function HiddenHint({ postId }: { postId: number }) {
  const [confirming, setConfirming] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hints/${postId}`);
      if (!response.ok) throw new Error("This hint is not available yet.");
      const payload = (await response.json()) as { html?: string };
      setHtml(payload.html ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the hint.");
    } finally {
      setLoading(false);
    }
  };

  if (html !== null) {
    return (
      <div className="hint-revealed">
        <MarkdownBlock html={html} />
      </div>
    );
  }

  return (
    <div className="hint-guard">
      {!confirming ? (
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          Hint
        </button>
      ) : (
        <div className="hint-confirmation">
          <h3>Show hint?</h3>
          <p>
            Try examples, write down what you know, and name the place where you are stuck.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reveal} disabled={loading}>
              {loading ? "Loading..." : "Show hint"}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              Keep thinking
            </button>
          </div>
          {error && <p className="hint-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
