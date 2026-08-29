"use client";

import { useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";

type HiddenHintLabels = {
  hint: string;
  question: string;
  guidance: string;
  loading: string;
  show: string;
  keepThinking: string;
  unavailable: string;
  loadError: string;
};

export function HiddenHint({ postId, labels }: { postId: number; labels: HiddenHintLabels }) {
  const [confirming, setConfirming] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hints/${postId}`);
      if (!response.ok) throw new Error(labels.unavailable);
      const payload = (await response.json()) as { html?: string };
      setHtml(payload.html ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.loadError);
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
          {labels.hint}
        </button>
      ) : (
        <div className="hint-confirmation">
          <h3>{labels.question}</h3>
          <p>{labels.guidance}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reveal} disabled={loading}>
              {loading ? labels.loading : labels.show}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {labels.keepThinking}
            </button>
          </div>
          {error && <p className="hint-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
