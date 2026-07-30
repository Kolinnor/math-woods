"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MarkdownInline } from "@/components/MarkdownInline";

type ConceptExerciseCarouselProps = {
  exercises: Array<{
    id: number;
    slug: string;
    titleHtml: string;
    difficultyLabel: string;
  }>;
  labels: {
    kicker: string;
    title: string;
    previous: string;
    next: string;
    open: string;
  };
};

export function ConceptExerciseCarousel({ exercises, labels }: ConceptExerciseCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, exercises.length - 1));
  const exercise = exercises[safeActiveIndex];

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, exercises.length - 1)));
  }, [exercises.length]);

  if (!exercise) return null;

  const hasMultipleExercises = exercises.length > 1;

  return (
    <section className="concept-practice-box">
      <div className="concept-practice-heading">
        <p className="home-section-kicker">{labels.kicker}</p>
        <h2>{labels.title}</h2>
      </div>
      <div className="concept-exercise-carousel" aria-live="polite">
        <span className="concept-exercise-position">
          {safeActiveIndex + 1} / {exercises.length}
        </span>
        <button
          type="button"
          className="concept-exercise-arrow"
          aria-label={labels.previous}
          title={labels.previous}
          disabled={!hasMultipleExercises}
          onClick={() => setActiveIndex((safeActiveIndex - 1 + exercises.length) % exercises.length)}
        >
          <ChevronLeft size={42} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <Link href={`/problems/${exercise.slug}`} className="concept-exercise-card">
          <strong>
            <MarkdownInline html={exercise.titleHtml} />
          </strong>
          <span>{exercise.difficultyLabel}</span>
          <span className="concept-exercise-open">{labels.open}</span>
        </Link>
        <button
          type="button"
          className="concept-exercise-arrow"
          aria-label={labels.next}
          title={labels.next}
          disabled={!hasMultipleExercises}
          onClick={() => setActiveIndex((safeActiveIndex + 1) % exercises.length)}
        >
          <ChevronRight size={42} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
