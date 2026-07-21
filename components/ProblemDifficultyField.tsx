"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { MAX_PROBLEM_DIFFICULTY, MIN_PROBLEM_DIFFICULTY } from "@/lib/problems";
import { FieldHelp } from "@/components/FieldHelp";
import { problemDifficultyTone } from "@/lib/problem-difficulty";

type ProblemDifficultyFieldProps = {
  defaultValue?: number | null;
  help?: string;
};

export function ProblemDifficultyField({ defaultValue, help }: ProblemDifficultyFieldProps) {
  const [value, setValue] = useState(defaultValue ?? 50);
  const position = ((value - MIN_PROBLEM_DIFFICULTY) / (MAX_PROBLEM_DIFFICULTY - MIN_PROBLEM_DIFFICULTY)) * 100;

  return (
    <label className="problem-compose-difficulty">
      <span className="field-label-with-help text-sm font-medium">
        Difficulty
        {help && <FieldHelp text={help} />}
      </span>
      <span className="problem-compose-difficulty-row">
        <input
          name="difficulty"
          type="range"
          min={MIN_PROBLEM_DIFFICULTY}
          max={MAX_PROBLEM_DIFFICULTY}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          style={{
            "--difficulty-value": `${position}%`,
            "--difficulty-tone": problemDifficultyTone(value)
          } as CSSProperties}
        />
        <strong style={{ color: problemDifficultyTone(value) }}>{value}</strong>
      </span>
    </label>
  );
}
