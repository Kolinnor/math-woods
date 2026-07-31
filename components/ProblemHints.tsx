"use client";

import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";

type ProblemHintItem = {
  id: number;
  html: string;
  label: string;
  fallbackLabel: string | null;
  translateHref: string | null;
};

type ProblemHintsProps = {
  hints: ProblemHintItem[];
  labels: {
    showFirst: string;
    showNext: string;
    guidance: string;
    translate: string;
  };
};

export function ProblemHints({ hints, labels }: ProblemHintsProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const nextHint = hints[revealedCount] ?? null;

  return (
    <div className="problem-hints">
      {hints.slice(0, revealedCount).map((hint) => (
        <article key={hint.id} className="hint-revealed problem-hint-revealed">
          <div className="problem-hint-heading">
            <p className="meta">{hint.label}</p>
            {hint.fallbackLabel && (
              <span className="problem-hint-language">
                {hint.fallbackLabel}
              </span>
            )}
          </div>
          <MarkdownBlock html={hint.html} />
          {hint.translateHref && (
            <a className="problem-hint-translate" href={hint.translateHref}>
              {labels.translate}
            </a>
          )}
        </article>
      ))}

      {nextHint && (
        <div className="hint-guard problem-hint-guard">
          <div className="hint-confirmation">
            <div>
              <h3>
                <Lightbulb size={18} aria-hidden="true" />
                {nextHint.label}
              </h3>
              <p>{labels.guidance}</p>
              {nextHint.fallbackLabel && (
                <p className="problem-hint-fallback">
                  {nextHint.fallbackLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => setRevealedCount((count) => Math.min(count + 1, hints.length))}
            >
              {revealedCount === 0 ? labels.showFirst : labels.showNext}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
