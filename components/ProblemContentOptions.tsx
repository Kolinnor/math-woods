"use client";

import { useRef, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";

export function ProblemContentOptions({
  initialIsExercise,
  initialShowRelatedProblems,
  labels
}: {
  initialIsExercise: boolean;
  initialShowRelatedProblems: boolean;
  labels?: {
    exercise: string;
    exerciseHelp: string;
    showRelatedProblems: string;
    showRelatedProblemsHelp: string;
  };
}) {
  const copy = labels ?? {
    exercise: "Exercise",
    exerciseHelp: "Exercises are designed to practise a specific concept. They appear on linked concept pages and are hidden from the default problem-browser view, while remaining available through the Exercises filter.",
    showRelatedProblems: "Show related problems",
    showRelatedProblemsHelp: "Display the related-problems section on this page. It is off by default for exercises."
  };
  const [isExercise, setIsExercise] = useState(initialIsExercise);
  const [showRelatedProblems, setShowRelatedProblems] = useState(initialShowRelatedProblems);
  const relatedVisibilityWasChanged = useRef(false);

  return (
    <>
      <label className="checkbox-field">
        <input
          name="isExercise"
          type="checkbox"
          checked={isExercise}
          onChange={(event) => {
            const nextIsExercise = event.target.checked;
            setIsExercise(nextIsExercise);
            if (!relatedVisibilityWasChanged.current) setShowRelatedProblems(!nextIsExercise);
          }}
        />
        <div className="field-label-with-help">
          <strong>{copy.exercise}</strong>
          <FieldHelp text={copy.exerciseHelp} />
        </div>
      </label>
      <label className="checkbox-field">
        <input
          name="showRelatedProblems"
          type="checkbox"
          checked={showRelatedProblems}
          onChange={(event) => {
            relatedVisibilityWasChanged.current = true;
            setShowRelatedProblems(event.target.checked);
          }}
        />
        <div className="field-label-with-help">
          <strong>{copy.showRelatedProblems}</strong>
          <FieldHelp text={copy.showRelatedProblemsHelp} />
        </div>
      </label>
    </>
  );
}
