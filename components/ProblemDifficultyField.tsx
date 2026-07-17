"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { MAX_PROBLEM_DIFFICULTY, MIN_PROBLEM_DIFFICULTY } from "@/lib/problems";
import { FieldHelp } from "@/components/FieldHelp";

type ProblemDifficultyFieldProps = {
  defaultValue?: number | null;
  help?: string;
};

function difficultyTone(value: number) {
  if (value <= 19) return "#5d7a4c";
  if (value <= 39) return "#a07a2c";
  if (value <= 64) return "#b05f2c";
  return "#8c3b22";
}

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
            "--difficulty-tone": difficultyTone(value)
          } as CSSProperties}
        />
        <strong style={{ color: difficultyTone(value) }}>{value}</strong>
      </span>
    </label>
  );
}
