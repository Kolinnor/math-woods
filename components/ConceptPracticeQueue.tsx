"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownInline } from "@/components/MarkdownInline";
import { problemDifficultyBars } from "@/lib/problem-difficulty";

type ConceptPracticeQueueProps = {
  exercises: Array<{
    id: number;
    slug: string;
    titleHtml: string;
    difficulty: number | null;
    difficultyTone: string;
    solved: boolean;
    solvedCountLabel: string;
    blurbHtml: string;
  }>;
  labels: {
    title: string;
    previous: string;
    next: string;
    open: string;
    solved: string;
    difficultyUnset: string;
    difficulty: string;
  };
};

export function ConceptPracticeQueue({ exercises, labels }: ConceptPracticeQueueProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const queueId = useId();
  const lastIndex = Math.max(0, exercises.length - 1);
  const safeActiveIndex = Math.min(activeIndex, lastIndex);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, lastIndex));
  }, [lastIndex]);

  if (exercises.length === 0) return null;

  function moveActiveIndex(offset: number) {
    setActiveIndex((current) => Math.min(lastIndex, Math.max(0, current + offset)));
  }

  return (
    <section
      className="concept-practice-queue"
      aria-labelledby={`${queueId}-heading`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActiveIndex(-1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActiveIndex(1);
        }
      }}
    >
      <header className="concept-practice-queue-header">
        <h2 id={`${queueId}-heading`}>{labels.title}</h2>
        {exercises.length > 1 && (
          <div className="concept-practice-queue-nav">
            <span className="concept-practice-queue-counter" aria-live="polite">
              {safeActiveIndex + 1} / {exercises.length}
            </span>
            <button
              type="button"
              className="concept-practice-queue-arrow"
              aria-label={labels.previous}
              title={labels.previous}
              disabled={safeActiveIndex === 0}
              onClick={() => moveActiveIndex(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="concept-practice-queue-arrow"
              aria-label={labels.next}
              title={labels.next}
              disabled={safeActiveIndex === lastIndex}
              onClick={() => moveActiveIndex(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <ul className="concept-practice-queue-list">
        {exercises.map((exercise, index) => {
          const isOpen = index === safeActiveIndex;
          const headerId = `${queueId}-${exercise.id}-header`;
          const bodyId = `${queueId}-${exercise.id}-body`;
          const difficultyLabel =
            exercise.difficulty === null
              ? labels.difficultyUnset
              : `${labels.difficulty} ${exercise.difficulty}/100`;
          const difficultyLevel = problemDifficultyBars(exercise.difficulty);

          return (
            <li
              key={exercise.id}
              className={`concept-practice-queue-row${isOpen ? " is-open" : ""}${
                exercise.solved ? " is-solved" : ""
              }`}
            >
              <button
                type="button"
                className="concept-practice-queue-row-header"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    router.push(`/problems/${exercise.slug}`);
                  }
                }}
              >
                <span
                  className="concept-practice-queue-difficulty"
                  style={{ color: exercise.difficultyTone }}
                  title={difficultyLabel}
                >
                  <span className="concept-practice-queue-difficulty-value">
                    {exercise.difficulty ?? "--"}
                  </span>
                  <span className="concept-practice-queue-difficulty-bars" aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6].map((level) => (
                      <i
                        key={level}
                        style={{ background: level <= difficultyLevel ? exercise.difficultyTone : undefined }}
                      />
                    ))}
                  </span>
                </span>
                <span className="concept-practice-queue-title">
                  <MarkdownInline html={exercise.titleHtml} />
                </span>
                {exercise.solved && (
                  <span className="concept-practice-queue-row-meta">
                    <span className="concept-practice-queue-solved">
                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                      {labels.solved}
                    </span>
                  </span>
                )}
              </button>

              {isOpen && (
                <div
                  className="concept-practice-queue-body"
                  id={bodyId}
                  role="region"
                  aria-labelledby={headerId}
                >
                  <div className="concept-practice-queue-statement">
                    <MarkdownBlock html={exercise.blurbHtml} />
                  </div>
                  <div className="concept-practice-queue-actions">
                    <Link href={`/problems/${exercise.slug}`} className="concept-practice-queue-open">
                      {labels.open}
                    </Link>
                    <span>
                      {difficultyLabel} {"\u00b7"} {exercise.solvedCountLabel}
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
