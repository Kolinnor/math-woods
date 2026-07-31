"use client";

import { useRef, useState } from "react";
import { FieldHelp } from "@/components/FieldHelp";

export function ProblemContentOptions({
  initialIsExercise,
  initialShowRelatedProblems
}: {
  initialIsExercise: boolean;
  initialShowRelatedProblems: boolean;
}) {
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
          <strong>Exercise</strong>
          <FieldHelp text="Exercises are designed to practise a specific concept. They appear on linked concept pages and are hidden from the default problem-browser view, while remaining available through the Exercises filter." />
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
          <strong>Show related problems</strong>
          <FieldHelp text="Display the related-problems section on this page. It is off by default for exercises." />
        </div>
      </label>
    </>
  );
}
