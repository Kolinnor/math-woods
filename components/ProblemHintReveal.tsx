"use client";

import { useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";

export function ProblemHintReveal({ html, index }: { html: string; index: number }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <article className="hint-revealed problem-hint-revealed">
        <p className="meta">Hint {index}</p>
        <MarkdownBlock html={html} />
      </article>
    );
  }

  return (
    <div className="hint-guard problem-hint-guard">
      <div className="hint-confirmation">
        <h3>Hint {index}</h3>
        <p>Open this only if you want a small nudge before looking at the solutions.</p>
        <button type="button" className="secondary" onClick={() => setRevealed(true)}>
          Show hint
        </button>
      </div>
    </div>
  );
}
